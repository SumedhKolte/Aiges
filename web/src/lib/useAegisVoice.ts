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
import {
  analyseSpeakers,
  estimatePitch,
  type SpeakerReading,
} from "./voice-print";

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
  /** Resolved party name when the floor monitor could attribute it. */
  label?: string;
};

/** How long a guest waits for the seat holder to answer before taking over. */
const HOST_ANSWER_TIMEOUT_MS = 8000;
// A host that crashed still holds its lease until the server calls it stale,
// so keep asking across that window rather than giving up on the first no.
const TAKEOVER_ATTEMPTS = 12;
const TAKEOVER_RETRY_MS = 8000;

/** Tool calls the browser enriches before relaying to the backend. */
const ROOM_SCOPED = new Set([
  "create_escrow_contract",
  "flag_risk_event",
  "issue_vocal_challenge",
  "update_deal_terms",
]);

export function useAegisVoice(
  roomId: string,
  selfId: string,
  /** Who this browser is, and who the counterparty is, for speaker labelling. */
  selfLabel = "Buyer",
  peerLabel = "Seller",
) {
  const [state, setState] = useState<VoiceState>("idle");
  const [mode, setMode] = useState<VoiceMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [challengePhrase, setChallengePhrase] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  // Muted by default. Taking the floor is an explicit act, which is what makes
  // attribution reliable: Aegis is told who unmuted.
  const [muted, setMuted] = useState(true);
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
  // Transcription completes asynchronously. Preserve who held the floor when
  // an audio item began instead of guessing after the floor may have changed.
  const audioItemRoles = useRef(new Map<string, string>());
  const activeRoleRef = useRef<string | null>(null);
  // Seller intake is private. Nothing from it is copied into the shared
  // transcript until all three offer terms have been captured.
  const sellerIntakeCompleteRef = useRef(false);
  const buyerJoinedRef = useRef(false);

  const peer = usePeerAudio(roomId, selfId);

  // Vocal Entropy Trap timing: the clock starts when Aegis stops speaking the
  // challenge and stops when the party starts speaking. That interval is pure
  // reaction time — the signal a synthesis pipeline cannot fake.
  const aegisFinishedAt = useRef<number | null>(null);
  const awaitingChallenge = useRef(false);
  const measuredLatency = useRef<number | null>(null);
  const heldSeat = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guest-side recovery when the seat holder stops answering.
  const hostWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const takingOver = useRef(false);
  const mountedRef = useRef(true);

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
      }).catch(() => { });
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
      send(
        response
          ? { type: "response.create", response }
          : { type: "response.create" },
      );
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
      if (
        name === "verify_vocal_challenge" &&
        measuredLatency.current != null
      ) {
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

      if (
        name === "update_deal_terms" &&
        result?.ok &&
        Array.isArray(result?.still_missing) &&
        result.still_missing.length === 0
      ) {
        sellerIntakeCompleteRef.current = true;
      }

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
      // The Buyer may not receive the Seller's raw intake or the AI's private
      // intake prompts. Share only after the Buyer has joined to receive the
      // synthesized proposal; later turns remain in the audit trail.
      if (!sellerIntakeCompleteRef.current || !buyerJoinedRef.current) return;
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
      let evt: { type?: string;[k: string]: unknown };
      try {
        evt = JSON.parse(raw.data);
      } catch {
        return;
      }

      switch (evt.type) {
        // ---- the party spoke ----
        case "input_audio_buffer.speech_started": {
          const itemId = String(evt.item_id ?? "");
          const source = peer.activeSourceRef.current;
          const role =
            source === "LOCAL"
              ? selfLabel
              : source === "REMOTE"
                ? peerLabel
                : activeRoleRef.current;
          if (itemId && role) audioItemRoles.current.set(itemId, role);
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
            const itemId = String(evt.item_id ?? "");
            // Falling back to PARTY is safer than assigning a line to the
            // wrong person after a handoff.
            const who = itemId ? audioItemRoles.current.get(itemId) ?? "PARTY" : "PARTY";
            if (itemId) audioItemRoles.current.delete(itemId);
            push({ speaker: "PARTY", text, label: who });
            void persist(who.toUpperCase(), text);

            // Realtime consumes the mixed audio natively. Give it an explicit
            // source-of-truth turn before asking for a response, so it never
            // has to infer Buyer vs Seller from a voice.
            send({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: `[Authoritative transcript — ${who}]: ${text}`,
                  },
                ],
              },
            });
            createResponse();
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
          // The guest has no data channel and cannot see this for itself.
          peer.announceAegis(true);
          break;
        case "output_audio_buffer.stopped":
          setSpeaking(false);
          peer.announceAegis(false);
          aegisFinishedAt.current = performance.now();
          break;
        case "response.done": {
          setSpeaking(false);
          peer.announceAegis(false);
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
    [createResponse, handleToolCall, peer, persist, push, peerLabel, selfLabel, send],
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
      if (
        Math.abs(next - lastLevel) > 0.04 ||
        (next === 0) !== (lastLevel === 0)
      ) {
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

  /** Ask for the arbitrator seat. */
  const claimSeat = useCallback(
    async (token: string) => {
      const res = await fetch(`${API}/realtime/seat/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ room_id: roomId }),
      });
      const seat = await res.json().catch(() => ({}));
      return Boolean(res.ok && seat.granted);
    },
    [roomId],
  );

  // --- host: hold the seat and run the Realtime session ---------------------
  const beginHost = useCallback(
    async (token: string) => {
      heldSeat.current = true;
      setMode("HOST");

      const configRes = await fetch(
        `${API}/realtime/config?room_id=${encodeURIComponent(roomId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!configRes.ok)
        throw new Error("Could not load the arbitrator configuration.");
      const configPayload = await configRes.json();
      const config = configPayload.session ?? configPayload;
      sellerIntakeCompleteRef.current = Boolean(
        configPayload.seller_intake_complete,
      );

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
        // Aegis's voice arrives after the guest has already connected, so it
        // must be patched into the return path here. Without this the guest
        // never hears the arbitrator — only the host does.
        peer.attachAegisAudio(e.streams[0]);
      };

      mixed.getAudioTracks().forEach((t) => pc.addTrack(t, mixed));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = onServerEvent;
      dc.onopen = () => {
        // Send the session config through exactly as the backend built it. `session.type`
        // is required; stripping any field here silently voids the whole update
        // and leaves the agent with no instructions and no tools.
        send({ type: "session.update", session: config });
        setState("live");
        // Keep the lease warm so a live session is never reclaimed as stale.
        heartbeatRef.current = setInterval(
          () => void seatCall("heartbeat"),
          30_000,
        );
        createResponse({
          instructions:
            sellerIntakeCompleteRef.current
              ? `A structured offer is already prepared. Wait for the ${peerLabel} ` +
                "to join, then present the proposal and begin mediated negotiation."
              : `Begin the private Seller intake. The Buyer must not receive ` +
                "or see this intake. Tell the Seller in one short sentence that " +
                "you will turn their details into a buyer-ready offer, then ask " +
                "for the product or service, specifications, price, delivery, " +
                "and release condition. Ask the Seller to unmute to respond.",
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
    },
    [
      createResponse,
      onServerEvent,
      peer,
      peerLabel,
      roomId,
      seatCall,
      selfLabel,
      send,
      startMeter,
    ],
  );

  // Guest recovery reaches back into the host path, so it is held in a ref to
  // keep the two callbacks from depending on each other.
  const beginHostRef = useRef(beginHost);
  beginHostRef.current = beginHost;

  // --- guest: bridge our microphone through whoever holds the seat ----------
  const beginGuest = useCallback(
    async (token: string) => {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = mic;
      startMeter(mic);

      /**
       * The host is gone — it ended the session, closed the tab, or dropped.
       *
       * Without this the guest sits in a room with no arbitrator in it,
       * unmuting into a connection nobody is on the other end of. The seat is
       * only released cleanly on a graceful exit, so a crashed host leaves it
       * held until the lease goes stale; we keep asking until it is ours.
       */
      const takeOver = async (reason: "left" | "silent" | "unreachable") => {
        if (takingOver.current || heldSeat.current) return;
        takingOver.current = true;
        // A host that went away will free its lease, in a moment or when the
        // server calls it stale — worth waiting out. A peer-to-peer connection
        // that cannot be established is not going to fix itself, so ask once
        // and then say plainly what happened.
        const attempts = reason === "unreachable" ? 1 : TAKEOVER_ATTEMPTS;
        try {
          for (let attempt = 0; attempt < attempts; attempt++) {
            if (!mountedRef.current) return;
            // The bridge came up while we were waiting — a slow rendezvous,
            // not an absent host. Leave the working session alone.
            if (peer.peerStateRef.current === "connected") return;
            if (await claimSeat(token)) {
              setState("connecting");
              peer.teardown();
              streamRef.current?.getTracks().forEach((t) => t.stop());
              streamRef.current = null;
              await beginHostRef.current(token);
              return;
            }
            if (attempt < attempts - 1) {
              await new Promise((r) => setTimeout(r, TAKEOVER_RETRY_MS));
            }
          }
          if (!mountedRef.current || peer.peerStateRef.current === "connected")
            return;
          setState("error");
          setError(
            reason === "unreachable"
              ? "Your network will not carry a direct audio connection to the " +
              "other party. Switch to Text chat, or have the other party " +
              "end their session so this browser can host it."
              : "The party hosting the arbitrator stopped responding, and the " +
              "seat is still held. Reload to try again, or use Text chat.",
          );
        } catch (e) {
          setState("error");
          setError(
            e instanceof Error ? e.message : "Could not take over the session.",
          );
        } finally {
          takingOver.current = false;
        }
      };

      await peer.startGuest(mic, {
        onHostGone: (reason) => void takeOver(reason),
      });
      setMode("GUEST");
      setState("live");

      // Nobody answered our hello. Either the seat holder left without
      // releasing it or peer-to-peer audio cannot be established between these
      // two networks — in both cases sitting here silently is the worst
      // outcome, so go and try to host it ourselves.
      hostWatchdogRef.current = setTimeout(() => {
        if (peer.peerStateRef.current !== "connected") void takeOver("silent");
      }, HOST_ANSWER_TIMEOUT_MS);
    },
    [claimSeat, peer, startMeter],
  );

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
      if (!token)
        throw new Error("Your session expired. Please sign in again.");

      // Exactly one arbitrator per room. Without this lock, each browser spawns
      // its own agent and the two talk over each other in the same negotiation.
      // The seat is taken -> we do not open our own Realtime session; our
      // microphone is bridged peer-to-peer to the host, who mixes it into what
      // Aegis hears.
      if (await claimSeat(token)) {
        await beginHost(token);
      } else {
        await beginGuest(token);
      }
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Could not start the session.");
    }
  }, [beginGuest, beginHost, claimSeat, state]);

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

  /**
   * Say something by typing it instead of speaking it.
   *
   * The line is written to the shared transcript either way — that is what puts
   * it on the counterparty's screen and into the audit trail. What differs is
   * who answers: if a Realtime session is up in this browser, the message is
   * handed to the arbitrator already in the room so it replies in the call.
   * Otherwise nothing here can answer, and the caller asks the server-side
   * arbitrator to take the turn.
   *
   * Returns true when a live session has taken responsibility for replying.
   */
  const sendTypedMessage = useCallback(
    async (text: string, label = selfLabel) => {
      const line = text.trim();
      if (!line) return false;

      push({ speaker: "PARTY", text: line, label });
      await persist(label.toUpperCase(), line);

      // A guest holds no data channel; the host's browser relays typed lines
      // into the session on its behalf (see relayPeerText).
      if (state === "live" && mode === "HOST") {
        send({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: `[${label} typed rather than spoke]: ${line}`,
              },
            ],
          },
        });
        createResponse();
      }
      return state === "live";
    },
    [createResponse, mode, persist, push, selfLabel, send, state],
  );

  /**
   * Feed a line the counterparty typed into the live session.
   *
   * Only the host is connected to the arbitrator, so when the other party types
   * while the host is on the call, the host is the only one who can put those
   * words in front of Aegis. Without this the typed side of a mixed room is
   * visible to humans and invisible to the arbitrator.
   */
  const relayPeerText = useCallback(
    (label: string, text: string) => {
      if (state !== "live" || mode !== "HOST" || !text.trim()) return;
      send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: `[${label} typed rather than spoke]: ${text.trim()}`,
            },
          ],
        },
      });
      createResponse();
    },
    [createResponse, mode, send, state],
  );

  /**
   * Tell Aegis who just took the floor.
   *
   * The Realtime API accepts a single input stream, so the mixed audio alone
   * cannot say which of the two people is talking. The host, however, holds
   * both sources separately and measures them independently — so attribution
   * is known locally and only needs stating. A short text marker on each change
   * of speaker gives Aegis what the audio cannot.
   */
  const lastAnnounced = useRef<string | null>(null);
  useEffect(() => {
    if (state !== "live" || mode !== "HOST") return;
    const src = peer.activeSource;
    if (src !== "LOCAL" && src !== "REMOTE" && src !== "BOTH") return;

    const who =
      src === "BOTH"
        ? "BOTH parties are talking at once"
        : `${src === "LOCAL" ? selfLabel : peerLabel} is now speaking`;
    activeRoleRef.current =
      src === "LOCAL" ? selfLabel : src === "REMOTE" ? peerLabel : null;
    if (who === lastAnnounced.current) return;
    lastAnnounced.current = who;

    send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              src === "BOTH"
                ? "[Floor: both parties are speaking at once. Ask them to " +
                "answer one at a time, naming who you want to hear from.]"
                : `[Floor: ${who}. Attribute the speech that follows to them.]`,
          },
        ],
      },
    });
    // Deliberately no response.create — this is context, not a turn. Prompting
    // a reply on every change of speaker would make Aegis interrupt constantly.
  }, [peer.activeSource, state, mode, selfLabel, peerLabel, send]);

  /**
   * Tell Aegis the second party has arrived.
   *
   * The opening brief says the counterparty is muted and cannot answer, which
   * is true at the time. Nothing ever corrected it: the guest could join, sit
   * there, and Aegis would keep addressing the host alone until the guest
   * happened to speak. A negotiation with two people in it has to know when
   * the second one walked in.
   */
  const announcedJoin = useRef(false);
  useEffect(() => {
    if (state !== "live" || mode !== "HOST") return;
    if (peer.peerState !== "connected" || announcedJoin.current) return;
    announcedJoin.current = true;
    buyerJoinedRef.current = true;

    send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `[The ${peerLabel} has just joined the room. Present the ` +
              `finalized structured proposal now. Do not repeat or reveal the ` +
              `${selfLabel}'s private intake wording. State the offer, value, ` +
              `price, delivery, and release condition, then ask the ${peerLabel} ` +
              `for their response.]`,
          },
        ],
      },
    });
    createResponse();
  }, [peer.peerState, state, mode, peerLabel, selfLabel, send, createResponse]);

  /**
   * Take or release the floor.
   *
   * Only the unmuted party's audio reaches Aegis, and Aegis is told by name who
   * just took it. That removes the guesswork entirely: with one live microphone
   * at a time there is nothing to mis-attribute.
   */
  const toggleMic = useCallback(() => {
    setMuted((wasMuted) => {
      const nowMuted = !wasMuted;
      peer.setMuted(nowMuted);

      if (!nowMuted && state === "live") {
        send({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  `[${selfLabel} has taken the floor and is about to speak. ` +
                  `Everything you hear until told otherwise is the ${selfLabel}. ` +
                  `Address your reply to them by name.]`,
              },
            ],
          },
        });
      }
      return nowMuted;
    });
  }, [peer, selfLabel, send, state]);

  const disconnect = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (hostWatchdogRef.current) {
      clearTimeout(hostWatchdogRef.current);
      hostWatchdogRef.current = null;
    }
    if (heldSeat.current) {
      heldSeat.current = false;
      // Say so before the socket goes, so the other party can take the seat
      // now rather than waiting out a ninety-second stale lease.
      peer.announceLeaving();
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
    setMuted(true);
    setSpeaking(false);
    responseActive.current = false;
    pendingResponse.current = null;
    aegisStreamRef.current = null;
    announcedJoin.current = false;
    lastAnnounced.current = null;
    sellerIntakeCompleteRef.current = false;
    buyerJoinedRef.current = false;
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
  useEffect(
    () => () => {
      mountedRef.current = false;
      disconnectRef.current();
    },
    [],
  );

  return {
    state,
    error,
    utterances,
    // A guest is not connected to Aegis directly and can only know that it is
    // talking because the host says so. Reporting the host's own (always
    // false) speaking state there would tell the guest it is their turn while
    // the arbitrator is mid-sentence.
    speaking: mode === "GUEST" ? peer.aegisSpeaking : speaking,
    level,
    challengePhrase,
    connect,
    disconnect,
    injectUtterance,
    sendTypedMessage,
    relayPeerText,
    mode,
    speakers,
    muted,
    toggleMic,
    remoteMuted: peer.remoteMuted,
    activeSource: peer.activeSource,
    peerState: peer.peerState,
    peerPresent: peer.peerPresent,
  };
}
