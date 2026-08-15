"use client";

/**
 * The Aegis voice session.
 *
 * Establishes a WebRTC peer connection to the OpenAI Realtime API by way of
 * the FastAPI SDP proxy, so the OpenAI key never reaches the browser. Audio
 * then flows browser <-> OpenAI directly; only tool calls come back through
 * our backend, where every argument is re-validated before money moves.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "./supabase/client";
import { usePeerAudio } from "./usePeerAudio";
import { analyseSpeakers, estimatePitch, type SpeakerReading } from "./voice-print";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type VoiceState = "idle" | "connecting" | "live" | "closed" | "error";

/**
 * HOST holds the Aegis seat and talks to OpenAI on behalf of the room.
 * GUEST is bridged in over peer-to-peer audio through the host.
 */
export type VoiceMode = "HOST" | "GUEST" | null;

export type Utterance = {
  id: string;
  speaker: "AEGIS" | "PARTY";
  text: string;
  at: number;
};

/** Tool calls the browser enriches before relaying to the backend. */
const ROOM_SCOPED = new Set([
  "create_escrow_contract",
  "flag_risk_event",
  "issue_vocal_challenge",
  "update_deal_terms",
]);

export function useAegisVoice(roomId: string, selfId: string) {
  const [state, setState] = useState<VoiceState>("idle");
  const [mode, setMode] = useState<VoiceMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [challengePhrase, setChallengePhrase] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [speakers, setSpeakers] = useState<SpeakerReading>({
    distinctSpeakers: 0,
    centroids: [],
    samples: 0,
    confidence: 0,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  /** Aegis's own voice track, relayed onward to the guest by the host. */
  const aegisStreamRef = useRef<MediaStream | null>(null);
  const pitchesRef = useRef<number[]>([]);

  const peer = usePeerAudio(roomId, selfId);

  // Vocal Entropy Trap timing: the clock starts when Aegis stops speaking the
  // challenge and stops when the party starts speaking. That interval is pure
  // reaction time — the signal a synthesis pipeline cannot fake.
  const aegisFinishedAt = useRef<number | null>(null);
  const awaitingChallenge = useRef(false);
  const measuredLatency = useRef<number | null>(null);
  const heldSeat = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Fire-and-forget authed POST used by the seat lease. */
  const seatCall = useCallback(
    async (action: "heartbeat" | "release") => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await fetch(`${API}/realtime/seat/${action}`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ room_id: roomId }),
      }).catch(() => {});
    },
    [roomId],
  );

  const push = useCallback((u: Omit<Utterance, "id" | "at">) => {
    setUtterances((prev) => [
      ...prev,
      { ...u, id: crypto.randomUUID(), at: Date.now() },
    ]);
  }, []);

  const send = useCallback((event: unknown) => {
    const dc = dcRef.current;
    if (dc?.readyState === "open") dc.send(JSON.stringify(event));
  }, []);

  // The Realtime API allows exactly one in-flight response. Firing
  // `response.create` while one is active returns "Conversation already has an
  // active response in progress" and the turn is lost, so creation is gated on
  // response.created / response.done and deferred when the model is busy.
  const responseActive = useRef(false);
  const pendingResponse = useRef<Record<string, unknown> | null>(null);

  const createResponse = useCallback(
    (response?: Record<string, unknown>) => {
      if (responseActive.current) {
        pendingResponse.current = response ?? {};
        return;
      }
      responseActive.current = true;
      send(response ? { type: "response.create", response } : { type: "response.create" });
    },
    [send],
  );

  // --- relay a tool call to the backend --------------------------------------
  const runTool = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const body: Record<string, unknown> = { ...args };
      if (ROOM_SCOPED.has(name)) body.room_id = roomId;
      if (name === "verify_vocal_challenge" && measuredLatency.current != null) {
        body.latency_ms = measuredLatency.current;
      }

      const res = await fetch(`${API}/tools/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          spoken_summary:
            json?.detail ?? "That action could not be completed right now.",
        };
      }
      return json;
    },
    [roomId],
  );

  const handleToolCall = useCallback(
    async (name: string, callId: string, rawArgs: string) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(rawArgs || "{}");
      } catch {
        /* the model occasionally emits nothing for no-arg tools */
      }

      const result = await runTool(name, args);

      if (name === "issue_vocal_challenge" && result?.phrase) {
        setChallengePhrase(result.phrase as string);
        awaitingChallenge.current = true;
        measuredLatency.current = null;
      }
      if (name === "verify_vocal_challenge") {
        awaitingChallenge.current = false;
        if (result?.passed) setChallengePhrase(null);
      }

      send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
        },
      });
      createResponse();
    },
    [createResponse, runTool, send],
  );

  // --- persist a line of transcript so the other party sees it live ---------
  const persist = useCallback(
    async (speaker: string, content: string) => {
      if (!content.trim()) return;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("transcript_segments").insert({
        room_id: roomId,
        speaker,
        user_id: speaker === "AEGIS" ? null : user?.id,
        content: content.trim(),
      });
    },
    [roomId],
  );

  const onServerEvent = useCallback(
    (raw: MessageEvent) => {
      let evt: { type?: string; [k: string]: unknown };
      try {
        evt = JSON.parse(raw.data);
      } catch {
        return;
      }

      switch (evt.type) {
        // ---- the party spoke ----
        case "input_audio_buffer.speech_started": {
          if (awaitingChallenge.current && aegisFinishedAt.current) {
            measuredLatency.current = Math.round(
              performance.now() - aegisFinishedAt.current,
            );
          }
          break;
        }
        case "conversation.item.input_audio_transcription.completed": {
          const text = String(evt.transcript ?? "");
          if (text.trim()) {
            push({ speaker: "PARTY", text });
            void persist("PARTY", text);
          }
          break;
        }

        // ---- Aegis spoke ----
        case "response.audio_transcript.done": {
          const text = String(evt.transcript ?? "");
          if (text.trim()) {
            push({ speaker: "AEGIS", text });
            void persist("AEGIS", text);
          }
          break;
        }
        case "response.created":
          responseActive.current = true;
          break;
        case "output_audio_buffer.started":
          setSpeaking(true);
          break;
        case "output_audio_buffer.stopped":
          setSpeaking(false);
          aegisFinishedAt.current = performance.now();
          break;
        case "response.done": {
          setSpeaking(false);
          aegisFinishedAt.current = performance.now();
          responseActive.current = false;
          // flush anything that arrived while the model was mid-turn
          const queued = pendingResponse.current;
          if (queued) {
            pendingResponse.current = null;
            responseActive.current = true;
            send(
              Object.keys(queued).length
                ? { type: "response.create", response: queued }
                : { type: "response.create" },
            );
          }
          break;
        }

        // ---- tool call ----
        case "response.function_call_arguments.done": {
          void handleToolCall(
            String(evt.name ?? ""),
            String(evt.call_id ?? ""),
            String(evt.arguments ?? "{}"),
          );
          break;
        }

        case "error": {
          const message =
            (evt.error as { message?: string })?.message ?? "Realtime error";
          // A rejected response.create means nothing is actually in flight from
          // our side; unlatch so the session isn't wedged for the rest of the call.
          if (message.includes("active response")) {
            responseActive.current = false;
            break;
          }
          setError(message);
          break;
        }
      }
    },
    [handleToolCall, persist, push],
  );

  // --- microphone level + two-speaker analysis -----------------------------
  const startMeter = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; // long enough a window for reliable F0
    src.connect(analyser);

    const bytes = new Uint8Array(analyser.frequencyBinCount);
    const floats = new Float32Array(analyser.fftSize);
    let frame = 0;
    let lastLevel = -1;

    const tick = () => {
      analyser.getByteTimeDomainData(bytes);
      let peak = 0;
      for (const v of bytes) peak = Math.max(peak, Math.abs(v - 128));

      // Only re-render when the level visibly moves. Setting state on every
      // animation frame re-rendered the whole room sixty times a second, which
      // is wasted work at best and amplifies any render-keyed effect at worst.
      const next = Math.min(1, peak / 60);
      if (Math.abs(next - lastLevel) > 0.04 || (next === 0) !== (lastLevel === 0)) {
        lastLevel = next;
        setLevel(next);
      }

      // Pitch is far more expensive than the level meter, so sample it every
      // sixth frame (~10 Hz) — plenty to characterise a speaker.
      if (++frame % 6 === 0) {
        analyser.getFloatTimeDomainData(floats);
        const hz = estimatePitch(floats, ctx.sampleRate);
        if (hz > 0) {
          pitchesRef.current.push(hz);
          if (pitchesRef.current.length > 400) pitchesRef.current.shift();
          if (pitchesRef.current.length % 10 === 0) {
            setSpeakers(analyseSpeakers(pitchesRef.current));
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return ctx;
  }, []);

  // --- connect --------------------------------------------------------------
  const connect = useCallback(async () => {
    if (state === "connecting" || state === "live") return;
    setState("connecting");
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");

      // Exactly one arbitrator per room. Without this lock, each browser spawns
      // its own agent and the two talk over each other in the same negotiation.
      const seatRes = await fetch(`${API}/realtime/seat/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ room_id: roomId }),
      });
      const seat = await seatRes.json().catch(() => ({}));

      // --- GUEST path -------------------------------------------------------
      // The seat is taken, so we do not open our own Realtime session (that is
      // what made two agents talk over each other). Instead our microphone is
      // bridged peer-to-peer to the host, who mixes it into what Aegis hears.
      if (!seatRes.ok || !seat.granted) {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streamRef.current = mic;
        startMeter(mic);
        await peer.startGuest(mic);
        setMode("GUEST");
        setState("live");
        return;
      }

      heldSeat.current = true;
      setMode("HOST");

      const configRes = await fetch(
        `${API}/realtime/config?room_id=${encodeURIComponent(roomId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!configRes.ok) throw new Error("Could not load the arbitrator configuration.");
      const config = await configRes.json();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      startMeter(stream);

      // Host mixes its own mic with the guest's incoming audio, so Aegis hears
      // one room containing two people rather than a single speaker.
      const mixed = await peer.startHost(stream, () => aegisStreamRef.current);

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Aegis's voice
      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
        aegisStreamRef.current = e.streams[0];
      };

      mixed.getAudioTracks().forEach((t) => pc.addTrack(t, mixed));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = onServerEvent;
      dc.onopen = () => {
        // Send the config through EXACTLY as the backend built it. `session.type`
        // is required; stripping any field here silently voids the whole update
        // and leaves the agent with no instructions and no tools.
        send({ type: "session.update", session: config });
        setState("live");
        // Keep the lease warm so a live session is never reclaimed as stale.
        heartbeatRef.current = setInterval(() => void seatCall("heartbeat"), 30_000);
        createResponse({
          instructions:
            "Open the negotiation. In one sentence: you are Aegis, you will " +
            "hold the funds in escrow, and neither side has to trust the " +
            "other. Then address the Buyer by name and ask them to state " +
            "what they want to buy and what they are offering to pay. End " +
            "your turn with that question. Do not address both parties at " +
            "once and do not ask an open question to the room.",
        });
      };

      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(pc.connectionState)) {
          setState("error");
          setError("The voice connection dropped.");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(`${API}/realtime/sdp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          Authorization: `Bearer ${token}`,
        },
        body: offer.sdp,
      });
      if (!sdpRes.ok) {
        throw new Error(
          `The arbitrator did not accept the connection (${sdpRes.status}).`,
        );
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpRes.text(),
      });
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Could not start the session.");
    }
  }, [createResponse, onServerEvent, peer, roomId, seatCall, send, startMeter, state]);

  /**
   * Inject a line into the negotiation as if a party had spoken it.
   *
   * Deception Forensics is the hardest pillar to show on demand — it needs an
   * actual bad actor in the room. This puts scripted adversarial lines into the
   * conversation so the risk engine can be demonstrated deliberately, and it
   * exercises the identical code path a spoken sentence would.
   */
  const injectUtterance = useCallback(
    (text: string) => {
      if (state !== "live") return;
      push({ speaker: "PARTY", text });
      void persist("PARTY", text);
      send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      });
      createResponse();
    },
    [createResponse, persist, push, send, state],
  );

  const disconnect = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (heldSeat.current) {
      heldSeat.current = false;
      void seatCall("release");
    }
    peer.teardown();
    dcRef.current?.close();
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    setLevel(0);
    pitchesRef.current = [];
    setSpeaking(false);
    responseActive.current = false;
    pendingResponse.current = null;
    aegisStreamRef.current = null;
    setMode(null);
    setState("closed");
  }, [peer, seatCall]);

  // Tear down on unmount ONLY.
  //
  // This must not depend on `disconnect`. `disconnect` is rebuilt whenever its
  // dependencies change, and React runs an effect's cleanup every time the
  // effect re-runs — so depending on it here made the cleanup fire on every
  // render, killing the session mid-connect. The mic meter re-renders roughly
  // sixty times a second, so the call tore itself down about that often. The
  // ref keeps the latest implementation reachable while the effect stays
  // mounted for the component's whole life.
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;
  useEffect(() => () => disconnectRef.current(), []);

  return {
    state,
    error,
    utterances,
    speaking,
    level,
    challengePhrase,
    connect,
    disconnect,
    injectUtterance,
    mode,
    speakers,
    peerState: peer.peerState,
    peerPresent: peer.peerPresent,
  };
}
