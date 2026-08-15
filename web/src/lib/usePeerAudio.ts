"use client";

/**
 * Peer audio bridge — what makes a two-person remote negotiation possible.
 *
 * Only one browser holds the Aegis seat and talks to OpenAI. That browser is
 * the HOST. The other party is the GUEST. Without this bridge the guest can
 * watch the negotiation but never speak into it.
 *
 *   GUEST  --- mic ------------------>  HOST  --- mixed mic --->  OpenAI
 *   GUEST  <-- Aegis + host's mic ----  HOST  <-- Aegis voice --  OpenAI
 *
 * The host mixes its own microphone with the guest's incoming track in Web
 * Audio and hands the single mixed stream to the Realtime session, so Aegis
 * hears one room with two people in it. The return path carries Aegis's voice
 * plus the host's microphone back to the guest.
 *
 * Signalling rides Supabase Realtime broadcast — no extra service, no SFU.
 * Media itself is peer-to-peer.
 *
 * Rendezvous is deliberately order-independent: whoever arrives second says
 * hello, whoever is already there answers, and only then does anyone dial.
 * Neither side may broadcast before its own channel has joined, or it will be
 * talking into a socket it is not yet listening on.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { createClient } from "./supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export type PeerRole = "HOST" | "GUEST";
export type PeerState =
  "idle" | "waiting" | "connecting" | "connected" | "failed";

/** Which microphone currently holds the floor, from the host's point of view. */
export type ActiveSource = "LOCAL" | "REMOTE" | "BOTH" | null;

// Energy above this counts as speech rather than room noise.
const SPEECH_FLOOR = 0.055;
// One side must beat the other by this much to be called the sole speaker;
// inside the margin we report BOTH rather than guess.
const DOMINANCE = 1.6;
// Hold the floor briefly after speech stops so ordinary pauses mid-sentence
// do not flap the attribution back and forth.
const FLOOR_HOLD_MS = 700;
// A guest that has already dialled waits this long between re-announcements,
// so a host arriving late is always found without flooding the channel.
const REDIAL_COOLDOWN_MS = 2500;

/** Rolling loudness probe for one stream. */
function makeProbe(ctx: AudioContext, stream: MediaStream) {
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);

  return () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) {
      const d = (v - 128) / 128;
      sum += d * d;
    }
    return Math.sqrt(sum / buf.length); // RMS, 0..1
  };
}

/**
 * Resolve once the channel has actually joined.
 *
 * `channel.subscribe()` returns the channel, not a promise — awaiting it is a
 * no-op that resolves on the next tick, long before the socket has joined.
 * Broadcasting in that window silently falls back to REST: the message reaches
 * the other party, but we are not yet listening for their reply. That is how
 * both browsers end up waiting on each other forever, each convinced it has
 * announced itself.
 */
function awaitSubscribed(channel: RealtimeChannel, timeoutMs = 10_000) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Could not reach the signalling channel.")),
      timeoutMs,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        reject(new Error(`Signalling channel failed (${status}).`));
      }
    });
  });
}

export function usePeerAudio(roomId: string, selfId: string) {
  const [peerState, setPeerState] = useState<PeerState>("idle");
  const [peerPresent, setPeerPresent] = useState(false);
  const [activeSource, setActiveSource] = useState<ActiveSource>(null);
  /** Aegis's speaking state, as relayed to a guest by the host. */
  const [aegisSpeaking, setAegisSpeaking] = useState(false);
  const activeSourceRef = useRef<ActiveSource>(null);
  // Watchdogs need to read this without re-running on every render.
  const peerStateRef = useRef<PeerState>("idle");
  const floorRafRef = useRef<number | null>(null);
  /** Gate on the local mic feeding Aegis. 0 = muted. */
  const micGainRef = useRef<GainNode | null>(null);
  const aegisAttachedRef = useRef(false);
  const attachAegisRef = useRef<((s: MediaStream | null) => void) | null>(null);
  const [remoteMuted, setRemoteMuted] = useState(true);
  const mutedRef = useRef(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localMicRef = useRef<MediaStream | null>(null);
  const roleRef = useRef<PeerRole | null>(null);

  // Web Audio graph, host side only.
  const ctxRef = useRef<AudioContext | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const returnDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);

  const moveTo = useCallback((next: PeerState) => {
    peerStateRef.current = next;
    setPeerState(next);
  }, []);

  const teardown = useCallback(() => {
    if (floorRafRef.current) cancelAnimationFrame(floorRafRef.current);
    floorRafRef.current = null;
    activeSourceRef.current = null;
    setActiveSource(null);
    pcRef.current?.close();
    pcRef.current = null;
    if (channelRef.current) {
      void createClient().removeChannel(channelRef.current);
      channelRef.current = null;
    }
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    mixDestRef.current = null;
    returnDestRef.current = null;
    if (playbackRef.current) {
      playbackRef.current.srcObject = null;
      playbackRef.current = null;
    }
    remoteStreamRef.current = null;
    localMicRef.current = null;
    roleRef.current = null;
    // These outlived the session they belonged to. Left set, the next call
    // starts believing Aegis is already wired into the guest's return path and
    // never attaches it — so on any second session the guest hears nothing.
    aegisAttachedRef.current = false;
    attachAegisRef.current = null;
    micGainRef.current = null;
    mutedRef.current = true;
    setRemoteMuted(true);
    setAegisSpeaking(false);
    setPeerPresent(false);
    peerStateRef.current = "idle";
    setPeerState("idle");
  }, []);

  const signal = useCallback(
    (event: string, payload: unknown) => {
      void channelRef.current?.send({
        type: "broadcast",
        event,
        payload: { from: selfId, ...(payload as object) },
      });
    },
    [selfId],
  );

  /**
   * HOST: returns the stream to hand to OpenAI — its own mic mixed with the
   * guest's, once the guest arrives. Callable before the guest connects; the
   * mix node is live from the start and the guest is patched in on arrival.
   */
  const startHost = useCallback(
    async (localMic: MediaStream, aegisOutput: () => MediaStream | null) => {
      roleRef.current = "HOST";
      localMicRef.current = localMic;
      moveTo("waiting");

      const ctx = new AudioContext();
      ctxRef.current = ctx;

      // Everything Aegis should hear. The local mic passes through a gain
      // node so it can be muted without tearing down the graph — muting the
      // track itself would also mute what the guest hears.
      const mixDest = ctx.createMediaStreamDestination();
      mixDestRef.current = mixDest;
      const micGain = ctx.createGain();
      micGain.gain.value = 0; // start muted: you unmute to take the floor
      micGainRef.current = micGain;
      ctx.createMediaStreamSource(localMic).connect(micGain).connect(mixDest);

      // Everything the guest should hear.
      const returnDest = ctx.createMediaStreamDestination();
      returnDestRef.current = returnDest;
      ctx.createMediaStreamSource(localMic).connect(returnDest);

      // Attribution. Aegis receives one mixed stream and cannot tell the two
      // voices apart, but the host holds both sources separately — so who has
      // the floor is knowable here and merely needs reporting.
      const localProbe = makeProbe(ctx, localMic);
      let remoteProbe: (() => number) | null = null;
      let lastSpokeAt = 0;

      const watchFloor = () => {
        const local = localProbe();
        const remote = remoteProbe ? remoteProbe() : 0;
        const now = performance.now();

        let next: ActiveSource = activeSourceRef.current;
        const localSpeaking = local > SPEECH_FLOOR;
        const remoteSpeaking = remote > SPEECH_FLOOR;

        if (localSpeaking || remoteSpeaking) {
          lastSpokeAt = now;
          if (localSpeaking && remoteSpeaking) {
            // Only call it a clash when neither clearly dominates.
            next =
              local > remote * DOMINANCE
                ? "LOCAL"
                : remote > local * DOMINANCE
                  ? "REMOTE"
                  : "BOTH";
          } else {
            next = localSpeaking ? "LOCAL" : "REMOTE";
          }
        } else if (now - lastSpokeAt > FLOOR_HOLD_MS) {
          next = null;
        }

        if (next !== activeSourceRef.current) {
          activeSourceRef.current = next;
          setActiveSource(next);
        }
        floorRafRef.current = requestAnimationFrame(watchFloor);
      };
      watchFloor();

      const attachRemoteProbe = (s: MediaStream) => {
        if (ctxRef.current) remoteProbe = makeProbe(ctxRef.current, s);
      };

      /** Wire Aegis's voice into the guest's return path. Safe to call twice. */
      const attachAegis = (s: MediaStream | null) => {
        if (!s || aegisAttachedRef.current) return;
        if (!ctxRef.current || !returnDestRef.current) return;
        try {
          ctxRef.current
            .createMediaStreamSource(s)
            .connect(returnDestRef.current);
          aegisAttachedRef.current = true;
        } catch {
          /* not attachable yet; a later call will succeed */
        }
      };
      attachAegisRef.current = attachAegis;

      const supabase = createClient();
      const channel = supabase.channel(`peer:${roomId}`, {
        config: { broadcast: { self: false } },
      });
      channelRef.current = channel;

      channel.on("broadcast", { event: "floor" }, ({ payload }) => {
        if (payload.from === selfId) return;
        setRemoteMuted(Boolean(payload.muted));
      });

      const answerOffer = async (payload: {
        from: string;
        sdp: RTCSessionDescriptionInit;
      }) => {
        if (payload.from === selfId) return;
        setPeerPresent(true);
        moveTo("connecting");

        // A guest that re-announces itself dials again. Replacing the
        // connection without closing the old one leaves a live peer
        // connection and its tracks behind on every retry.
        pcRef.current?.close();

        const pc = new RTCPeerConnection(ICE);
        pcRef.current = pc;

        // Guest hears Aegis plus the host. Aegis's track usually arrives from
        // OpenAI *after* this point, so also attach it on arrival (see
        // attachAegisAudio) — otherwise the guest never hears the arbitrator
        // at all and only the host does.
        attachAegis(aegisOutput());
        returnDest.stream
          .getAudioTracks()
          .forEach((t) => pc.addTrack(t, returnDest.stream));

        pc.ontrack = (e) => {
          // The guest's voice joins what Aegis hears.
          remoteStreamRef.current = e.streams[0];
          attachRemoteProbe(e.streams[0]);
          if (ctxRef.current && mixDestRef.current) {
            ctxRef.current
              .createMediaStreamSource(e.streams[0])
              .connect(mixDestRef.current);
          }
          // And the host hears the guest directly.
          const el = new Audio();
          el.autoplay = true;
          el.srcObject = e.streams[0];
          playbackRef.current = el;
          moveTo("connected");
        };

        pc.onicecandidate = (e) =>
          e.candidate && signal("host-ice", { candidate: e.candidate });
        pc.onconnectionstatechange = () => {
          if (pc !== pcRef.current) return;
          if (pc.connectionState === "failed") moveTo("failed");
          if (pc.connectionState === "disconnected") moveTo("connecting");
        };

        await pc.setRemoteDescription(payload.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal("host-answer", { sdp: answer });
      };

      channel.on("broadcast", { event: "guest-offer" }, ({ payload }) => {
        void answerOffer(payload);
      });

      // A guest announcing itself after we came up. Answer so it knows to
      // dial — this is the half of the handshake that makes arrival order
      // stop mattering.
      channel.on("broadcast", { event: "guest-hello" }, ({ payload }) => {
        if (payload.from === selfId) return;
        setPeerPresent(true);
        signal("host-ready", {});
        signal("floor", { muted: mutedRef.current });
      });

      channel.on("broadcast", { event: "guest-ice" }, ({ payload }) => {
        if (payload.from === selfId || !payload.candidate) return;
        void pcRef.current?.addIceCandidate(payload.candidate).catch(() => {});
      });

      // Join before announcing. Announcing first is the deadlock: the message
      // goes out over the REST fallback, the guest dials in reply, and we are
      // not yet on the socket to hear it.
      await awaitSubscribed(channel);
      signal("host-ready", {});

      return mixDest.stream;
    },
    [moveTo, roomId, selfId, signal],
  );

  /** Called by the voice session the moment Aegis's own track arrives. */
  const attachAegisAudio = useCallback((s: MediaStream | null) => {
    attachAegisRef.current?.(s);
  }, []);

  /**
   * HOST: tell the guest whether Aegis is talking right now.
   *
   * The guest holds no data channel, so without this its screen claims Aegis
   * is listening while the arbitrator is mid-sentence — and the guest talks
   * over it.
   */
  const announceAegis = useCallback(
    (speaking: boolean) => {
      if (roleRef.current !== "HOST") return;
      signal("aegis", { speaking });
    },
    [signal],
  );

  /** HOST: say we are going, so the guest can take the seat immediately. */
  const announceLeaving = useCallback(() => {
    if (roleRef.current !== "HOST") return;
    signal("host-left", {});
  }, [signal]);

  /** Open or close this browser's mic into the negotiation. */
  const setMuted = useCallback(
    (muted: boolean) => {
      mutedRef.current = muted;
      // Host: gate the mix. Guest: gate the outgoing track.
      if (micGainRef.current) {
        micGainRef.current.gain.value = muted ? 0 : 1;
      }
      const local = localMicRef.current;
      if (local && roleRef.current === "GUEST") {
        local.getAudioTracks().forEach((tr) => (tr.enabled = !muted));
      }
      void channelRef.current?.send({
        type: "broadcast",
        event: "floor",
        payload: { from: selfId, muted },
      });
    },
    [selfId],
  );

  /**
   * GUEST: send our mic to the host and play back what the host returns.
   *
   * `onHostGone` fires when the host we were bridged through stops answering —
   * it ended its session, closed the tab, or dropped off the network. The
   * caller uses it to claim the vacated seat rather than sit in a room with no
   * arbitrator in it.
   */
  const startGuest = useCallback(
    async (
      localMic: MediaStream,
      opts: { onHostGone?: (reason: "left" | "unreachable") => void } = {},
    ) => {
      roleRef.current = "GUEST";
      localMicRef.current = localMic;
      localMic.getAudioTracks().forEach((tr) => (tr.enabled = false));
      moveTo("connecting");

      const supabase = createClient();
      const channel = supabase.channel(`peer:${roomId}`, {
        config: { broadcast: { self: false } },
      });
      channelRef.current = channel;

      const pc = new RTCPeerConnection(ICE);
      pcRef.current = pc;
      localMic.getTracks().forEach((t) => pc.addTrack(t, localMic));

      pc.ontrack = (e) => {
        const el = new Audio();
        el.autoplay = true;
        el.srcObject = e.streams[0];
        playbackRef.current = el;
        remoteStreamRef.current = e.streams[0];
        moveTo("connected");
        setPeerPresent(true);
      };
      pc.onicecandidate = (e) =>
        e.candidate && signal("guest-ice", { candidate: e.candidate });
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          // ICE could not find a path between these two networks. With STUN
          // only and no relay, this is terminal for the media path.
          moveTo("failed");
          opts.onHostGone?.("unreachable");
        }
        if (pc.connectionState === "disconnected") moveTo("connecting");
      };

      let lastDialledAt = 0;
      const dial = async () => {
        const now = Date.now();
        if (pc.connectionState === "connected") return;
        if (now - lastDialledAt < REDIAL_COOLDOWN_MS) return;
        lastDialledAt = now;
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        signal("guest-offer", { sdp: offer });
      };

      channel.on("broadcast", { event: "floor" }, ({ payload }) => {
        if (payload.from === selfId) return;
        setRemoteMuted(Boolean(payload.muted));
      });

      channel.on("broadcast", { event: "aegis" }, ({ payload }) => {
        if (payload.from === selfId) return;
        setAegisSpeaking(Boolean(payload.speaking));
      });

      channel.on("broadcast", { event: "host-answer" }, async ({ payload }) => {
        if (payload.from === selfId) return;
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(payload.sdp);
        }
      });
      channel.on("broadcast", { event: "host-ice" }, ({ payload }) => {
        if (payload.from === selfId || !payload.candidate) return;
        void pc.addIceCandidate(payload.candidate).catch(() => {});
      });
      // The host announces itself on start and again whenever a guest says
      // hello, so this fires whichever of us arrived first.
      channel.on("broadcast", { event: "host-ready" }, () => {
        setPeerPresent(true);
        void dial();
      });
      channel.on("broadcast", { event: "host-left" }, ({ payload }) => {
        if (payload.from === selfId) return;
        setPeerPresent(false);
        moveTo("waiting");
        opts.onHostGone?.("left");
      });

      // Join first, then say hello — the same rule the host follows, and for
      // the same reason.
      await awaitSubscribed(channel);
      signal("guest-hello", {});
      signal("floor", { muted: true });
      await dial();
    },
    [moveTo, roomId, selfId, signal],
  );

  // Memoised so consumers get a stable reference. Returning a fresh object
  // literal each render makes every useCallback that depends on it unstable,
  // which in turn makes any effect keyed on those callbacks re-run — a subtle
  // way to make cleanup logic fire continuously.
  return useMemo(
    () => ({
      peerState,
      peerStateRef,
      peerPresent,
      activeSource,
      remoteMuted,
      aegisSpeaking,
      attachAegisAudio,
      announceAegis,
      announceLeaving,
      setMuted,
      activeSourceRef,
      startHost,
      startGuest,
      teardown,
      remoteStream: remoteStreamRef,
    }),
    [
      peerState,
      peerPresent,
      activeSource,
      remoteMuted,
      aegisSpeaking,
      attachAegisAudio,
      announceAegis,
      announceLeaving,
      setMuted,
      startHost,
      startGuest,
      teardown,
    ],
  );
}
