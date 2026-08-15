"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AegisLogo, AegisMark } from "@/components/brand";
import { renderReelVideo, type ReelData } from "@/lib/reel-video";

type Reel = ReelData;

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SCENE_MS = 2600;

export function ReelPlayer({ reel }: { reel: Reel }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [exported, setExported] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [narrated, setNarrated] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const scenes = reel.scenes?.length ? reel.scenes : [];

  useEffect(() => {
    if (!playing || scenes.length === 0) return;
    const t = setTimeout(
      () => setIndex((i) => (i + 1) % scenes.length),
      SCENE_MS,
    );
    return () => clearTimeout(t);
  }, [index, playing, scenes.length]);

  /**
   * The single export control.
   *
   * Records a real 1080x1920 subtitled video — the vertical format every social
   * platform expects — by animating an offscreen canvas and capturing its
   * stream. Generated entirely in the browser: no render service, no upload.
   */
  const exportReel = useCallback(async () => {
    if (rendering) return;
    setRendering(true);
    setProgress(0);
    setPlaying(false);
    try {
      const { blob, ext, narrated } = await renderReelVideo(
        reel,
        setProgress,
        `${API}/reels/${reel.share_slug}/voiceover`,
      );
      setNarrated(narrated);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aegis-trust-reel-${reel.share_slug}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setExported(true);
      setTimeout(() => setExported(false), 2600);
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 3200);
    } finally {
      setRendering(false);
      setPlaying(true);
    }
  }, [reel, rendering]);
  const scene = scenes[index];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="mb-7">
        <AegisLogo size={28} />
      </div>

      {/* ---------------- the reel ---------------- */}
      <div
        ref={cardRef}
        className="panel relative w-full max-w-[340px] overflow-hidden"
        style={{ aspectRatio: "9 / 16" }}
        onClick={() => setPlaying((p) => !p)}
      >
        {/* progress */}
        <div className="absolute inset-x-4 top-4 z-10 flex gap-1.5">
          {scenes.map((_, i) => (
            <div
              key={i}
              className="h-0.5 flex-1 overflow-hidden rounded-full bg-[var(--color-line-bright)]"
            >
              <div
                className="h-full bg-[var(--color-aegis)]"
                style={{
                  width: i < index ? "100%" : i === index ? "100%" : "0%",
                  transition:
                    i === index && playing
                      ? `width ${SCENE_MS}ms linear`
                      : "none",
                }}
              />
            </div>
          ))}
        </div>

        <div className="flex h-full flex-col items-center justify-center px-7 text-center">
          <AegisMark size={40} />

          <h1 className="mt-6 text-[19px] leading-snug font-semibold text-balance">
            {reel.headline}
          </h1>

          {scene && (
            <div key={index} className="animate-rise mt-9">
              <div className="text-[10px] tracking-[0.16em] text-[var(--color-ink-faint)] uppercase">
                {scene.label}
              </div>
              <div className="tnum mt-2 text-4xl font-semibold text-[var(--color-aegis)]">
                {scene.value}
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-ink-dim)]">
                {scene.caption}
              </p>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-6">
            <p className="text-[15px] font-semibold">{reel.freelancer}</p>
            <p className="mt-1 text-[12px] text-[var(--color-ink-faint)]">
              <span className="tnum">Trust score {reel.trust_score}</span> ·{" "}
              <span className="tnum">{reel.deals_closed}</span> settled
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[12px] text-[var(--color-ink-faint)]">
        {playing ? "Tap the reel to pause" : "Tap to resume"}
      </p>

      {/* ---------------- the single export control ---------------- */}
      <div className="mt-6 w-full max-w-[340px]">
        <button
          onClick={exportReel}
          disabled={rendering}
          className="w-full rounded-lg bg-[var(--color-aegis)] px-6 py-3 text-[15px] font-semibold text-[var(--color-void)] transition-opacity hover:opacity-90 disabled:opacity-70"
        >
          {rendering
            ? progress < 0.02
              ? "Recording narration…"
              : `Rendering video… ${Math.round(progress * 100)}%`
            : exported
              ? narrated
                ? "Narrated video saved"
                : "Video saved"
              : failed
                ? "Export failed — try again"
                : "Export reel video"}
        </button>

        {rendering && (
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--color-line)]">
            <div
              className="h-full rounded-full bg-[var(--color-aegis)] transition-[width] duration-150"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}

        <p className="mt-2.5 text-center text-[12px] text-[var(--color-ink-faint)]">
          Vertical 1080 by 1920, AI narration and subtitles burned in.
        </p>
      </div>
    </main>
  );
}
