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
 */

import { useCallback, useRef, useState } from "react";
import { createClient } from "./supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export type PeerRole = "HOST" | "GUEST";
export type PeerState = "idle" | "waiting" | "connecting" | "connected" | "failed";

export function usePeerAudio(roomId: string, selfId: string) {
  const [peerState, setPeerState] = useState<PeerState>("idle");
  const [peerPresent, setPeerPresent] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const roleRef = useRef<PeerRole | null>(null);

  // Web Audio graph, host side only.
  const ctxRef = useRef<AudioContext | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const returnDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);

  const teardown = useCallback(() => {
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
    roleRef.current = null;
    setPeerState("idle");
    setPeerPresent(false);
  }, []);

  const signal = useCallback((event: string, payload: unknown) => {
    void channelRef.current?.send({
      type: "broadcast",
      event,
      payload: { from: selfId, ...(payload as object) },
    });
  }, [selfId]);

  /**
   * HOST: returns the stream to hand to OpenAI — its own mic mixed with the
   * guest's, once the guest arrives. Callable before the guest connects; the
   * mix node is live from the start and the guest is patched in on arrival.
   */
  const startHost = useCallback(
    async (localMic: MediaStream, aegisOutput: () => MediaStream | null) => {
      roleRef.current = "HOST";
      setPeerState("waiting");

      const ctx = new AudioContext();
      ctxRef.current = ctx;

      // Everything Aegis should hear.
      const mixDest = ctx.createMediaStreamDestination();
      mixDestRef.current = mixDest;
      ctx.createMediaStreamSource(localMic).connect(mixDest);

      // Everything the guest should hear.
      const returnDest = ctx.createMediaStreamDestination();
      returnDestRef.current = returnDest;
      ctx.createMediaStreamSource(localMic).connect(returnDest);

      const supabase = createClient();
      const channel = supabase.channel(`peer:${roomId}`, {
        config: { broadcast: { self: false } },
      });
      channelRef.current = channel;

      channel.on("broadcast", { event: "guest-offer" }, async ({ payload }) => {
        if (payload.from === selfId) return;
        setPeerPresent(true);
        setPeerState("connecting");

        const pc = new RTCPeerConnection(ICE);
        pcRef.current = pc;

        // Guest hears Aegis plus the host.
        const aegis = aegisOutput();
        if (aegis && ctxRef.current && returnDestRef.current) {
          try {
            ctxRef.current
              .createMediaStreamSource(aegis)
              .connect(returnDestRef.current);
          } catch {
            /* track may not be attachable yet; guest still hears the host */
          }
        }
        returnDest.stream
          .getAudioTracks()
          .forEach((t) => pc.addTrack(t, returnDest.stream));

        pc.ontrack = (e) => {
          // The guest's voice joins what Aegis hears.
          remoteStreamRef.current = e.streams[0];
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
          setPeerState("connected");
        };

        pc.onicecandidate = (e) =>
          e.candidate && signal("host-ice", { candidate: e.candidate });
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed") setPeerState("failed");
        };

        await pc.setRemoteDescription(payload.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal("host-answer", { sdp: answer });
      });

      channel.on("broadcast", { event: "guest-ice" }, ({ payload }) => {
        if (payload.from === selfId || !payload.candidate) return;
        void pcRef.current?.addIceCandidate(payload.candidate).catch(() => {});
      });

      await channel.subscribe();
      // Tell any waiting guest that a host is now live.
      signal("host-ready", {});

      return mixDest.stream;
    },
    [roomId, selfId, signal],
  );

  /** GUEST: send our mic to the host and play back what the host returns. */
  const startGuest = useCallback(
    async (localMic: MediaStream) => {
      roleRef.current = "GUEST";
      setPeerState("connecting");

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
        setPeerState("connected");
        setPeerPresent(true);
      };
      pc.onicecandidate = (e) =>
        e.candidate && signal("guest-ice", { candidate: e.candidate });
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") setPeerState("failed");
      };

      const dial = async () => {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        signal("guest-offer", { sdp: offer });
      };

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
      // If the host arrives after us, redial on their announcement.
      channel.on("broadcast", { event: "host-ready" }, () => void dial());

      await channel.subscribe();
      await dial();
    },
    [roomId, selfId, signal],
  );

  return {
    peerState,
    peerPresent,
    startHost,
    startGuest,
    teardown,
    remoteStream: remoteStreamRef,
  };
}
