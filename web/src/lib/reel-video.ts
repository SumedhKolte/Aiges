"use client";

/**
 * Trust Reel video renderer.
 *
 * Draws the reel frame-by-frame onto an offscreen 1080x1920 canvas and records
 * the canvas stream with MediaRecorder, producing a real subtitled video file
 * rather than a static card. Everything is generated locally — no render farm,
 * no upload, no third-party video service.
 */

export type ReelScene = {
  key: string;
  label: string;
  caption: string;
  value: string;
};

export type ReelData = {
  share_slug: string;
  headline: string;
  scenes: ReelScene[];
  freelancer: string;
  trust_score: number;
  deals_closed: number;
};

const W = 1080;
const H = 1920;
const FPS = 30;
const SCENE_MS = 2400;
const OUTRO_MS = 2200;

const INK = "#e9edf5";
const DIM = "#98a2b8";
const FAINT = "#5c6579";
const AEGIS = "#14c9b8";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Canvas has no text wrapping; lines are measured and broken by hand. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawShield(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-16, -16);

  const shield = new Path2D(
    "M16 2.5 27 6.6v8.2c0 6.6-4.4 12.3-11 14.7-6.6-2.4-11-8.1-11-14.7V6.6L16 2.5Z",
  );
  ctx.fillStyle = "rgba(20, 201, 184, 0.16)";
  ctx.strokeStyle = AEGIS;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.fill(shield);
  ctx.stroke(shield);

  const check = new Path2D("M11 15.4 16 20l5-6.4");
  ctx.lineWidth = 2.1;
  ctx.lineCap = "round";
  ctx.stroke(check);
  ctx.restore();
}

function drawBackdrop(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = "#06070a";
  ctx.fillRect(0, 0, W, H);

  // slow drifting wash so the video never looks like a frozen image
  const drift = Math.sin(t / 2600) * 90;
  const g1 = ctx.createRadialGradient(
    W * 0.25 + drift, 120, 0,
    W * 0.25 + drift, 120, W * 1.25,
  );
  g1.addColorStop(0, "rgba(20, 201, 184, 0.20)");
  g1.addColorStop(1, "rgba(6, 7, 10, 0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  const g2 = ctx.createRadialGradient(
    W * 0.8 - drift, H * 0.85, 0,
    W * 0.8 - drift, H * 0.85, W,
  );
  g2.addColorStop(0, "rgba(99, 102, 241, 0.13)");
  g2.addColorStop(1, "rgba(6, 7, 10, 0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);
}

function drawProgress(
  ctx: CanvasRenderingContext2D,
  count: number,
  index: number,
  sceneT: number,
) {
  const pad = 60;
  const gap = 12;
  const barW = (W - pad * 2 - gap * (count - 1)) / count;
  for (let i = 0; i < count; i++) {
    const x = pad + i * (barW + gap);
    ctx.fillStyle = "#2c3448";
    ctx.fillRect(x, 70, barW, 6);
    const fill = i < index ? 1 : i === index ? sceneT : 0;
    if (fill > 0) {
      ctx.fillStyle = AEGIS;
      ctx.fillRect(x, 70, barW * fill, 6);
    }
  }
}

/**
 * The subtitle band. This is the "subtitled" half of the spec: every scene's
 * caption is burned into the video so it reads with the sound off, which is how
 * these are actually watched.
 */
function drawSubtitle(ctx: CanvasRenderingContext2D, text: string, alpha: number) {
  ctx.font = "500 40px Inter, system-ui, sans-serif";
  const lines = wrap(ctx, text, W - 220);
  const lineH = 54;
  const boxH = lines.length * lineH + 48;
  const boxY = H - 470 - boxH / 2;

  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = "rgba(12, 15, 22, 0.92)";
  const boxW = Math.min(
    W - 140,
    Math.max(...lines.map((l) => ctx.measureText(l).width)) + 80,
  );
  ctx.beginPath();
  ctx.roundRect((W - boxW) / 2, boxY, boxW, boxH, 18);
  ctx.fill();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  lines.forEach((l, i) => {
    ctx.fillText(l, W / 2, boxY + 34 + (i + 1) * lineH - 16);
  });
  ctx.globalAlpha = 1;
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  reel: ReelData,
  scene: ReelScene,
  sceneT: number,
  elapsed: number,
) {
  const intro = easeOut(clamp01(sceneT / 0.22));
  const outro = 1 - clamp01((sceneT - 0.88) / 0.12);
  const alpha = Math.min(intro, outro);

  drawShield(ctx, W / 2, 300, 4.6);

  ctx.textAlign = "center";

  // headline persists across the whole reel
  ctx.globalAlpha = 1;
  ctx.fillStyle = INK;
  ctx.font = "600 58px Inter, system-ui, sans-serif";
  const hl = wrap(ctx, reel.headline, W - 200);
  hl.forEach((l, i) => ctx.fillText(l, W / 2, 560 + i * 70));

  // the scene's own figure, rising as it enters
  const lift = (1 - intro) * 26;
  ctx.globalAlpha = alpha;

  ctx.fillStyle = FAINT;
  ctx.font = "600 30px Inter, system-ui, sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText(scene.label.toUpperCase(), W / 2, 900 + lift);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = AEGIS;
  ctx.font = "600 128px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillText(scene.value, W / 2, 1040 + lift);

  ctx.globalAlpha = 1;
  drawSubtitle(ctx, scene.caption, alpha);

  // footer identity
  ctx.fillStyle = INK;
  ctx.font = "600 44px Inter, system-ui, sans-serif";
  ctx.fillText(reel.freelancer, W / 2, H - 230);
  ctx.fillStyle = FAINT;
  ctx.font = "400 30px Inter, system-ui, sans-serif";
  ctx.fillText(
    `Trust score ${reel.trust_score}  ·  ${reel.deals_closed} deals settled`,
    W / 2,
    H - 175,
  );
  ctx.fillStyle = DIM;
  ctx.font = "500 26px Inter, system-ui, sans-serif";
  ctx.fillText("Verified by Aegis", W / 2, H - 110);

  void elapsed;
}

function drawOutro(ctx: CanvasRenderingContext2D, reel: ReelData, t: number) {
  const inT = easeOut(clamp01(t / 0.35));
  drawShield(ctx, W / 2, H / 2 - 220, 5.4 + inT * 0.6);

  ctx.textAlign = "center";
  ctx.globalAlpha = inT;

  ctx.fillStyle = INK;
  ctx.font = "600 66px Inter, system-ui, sans-serif";
  ctx.fillText(reel.freelancer, W / 2, H / 2 + 40);

  ctx.fillStyle = AEGIS;
  ctx.font = "600 118px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillText(String(reel.trust_score), W / 2, H / 2 + 200);

  ctx.fillStyle = FAINT;
  ctx.font = "500 32px Inter, system-ui, sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("AEGIS TRUST SCORE", W / 2, H / 2 + 260);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = DIM;
  ctx.font = "400 32px Inter, system-ui, sans-serif";
  ctx.fillText("Every deal escrowed, verified, and settled.", W / 2, H / 2 + 380);

  ctx.globalAlpha = 1;
}

function pickMime(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return "video/webm";
}

/**
 * Renders and records the reel. Resolves with a downloadable video blob.
 * `onProgress` reports 0..1 so the UI can show real progress.
 */
export async function renderReelVideo(
  reel: ReelData,
  onProgress?: (p: number) => void,
  /** Optional AI narration. When present it is mixed into the recorded file. */
  voiceoverUrl?: string,
): Promise<{ blob: Blob; ext: string; narrated: boolean }> {
  const scenes = reel.scenes?.length ? reel.scenes : [];
  let totalMs = scenes.length * SCENE_MS + OUTRO_MS;

  // --- narration -----------------------------------------------------------
  // Decoded up front so the video can be stretched to cover the whole read.
  // A reel that cuts off mid-sentence looks broken, so picture waits for voice.
  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  let audioBuffer: AudioBuffer | null = null;

  if (voiceoverUrl) {
    try {
      const res = await fetch(voiceoverUrl);
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        audioCtx = new AudioContext();
        audioBuffer = await audioCtx.decodeAudioData(bytes);
        audioDest = audioCtx.createMediaStreamDestination();
        totalMs = Math.max(totalMs, audioBuffer.duration * 1000 + 400);
      }
    } catch {
      audioCtx?.close().catch(() => {});
      audioCtx = null;
      audioDest = null;
      audioBuffer = null;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");

  // Fonts must be resident before the first frame or early frames render in a
  // fallback face and the video visibly changes typeface partway through.
  if (document.fonts?.ready) {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load("600 128px 'IBM Plex Mono'"),
      document.fonts.load("600 58px Inter"),
      document.fonts.load("500 40px Inter"),
    ]).catch(() => {});
  }

  const mimeType = pickMime();
  const stream = canvas.captureStream(FPS);

  // Fold the narration track into the same stream so the recorder writes one
  // file with both picture and sound.
  if (audioCtx && audioDest && audioBuffer) {
    const src = audioCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(audioDest);
    src.start();
    audioDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 128_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start();
  const started = performance.now();

  await new Promise<void>((resolve) => {
    const frame = () => {
      const elapsed = performance.now() - started;
      if (elapsed >= totalMs) return resolve();

      drawBackdrop(ctx, elapsed);

      if (elapsed < scenes.length * SCENE_MS) {
        const index = Math.min(
          scenes.length - 1,
          Math.floor(elapsed / SCENE_MS),
        );
        const sceneT = (elapsed % SCENE_MS) / SCENE_MS;
        drawProgress(ctx, scenes.length, index, sceneT);
        drawScene(ctx, reel, scenes[index], sceneT, elapsed);
      } else {
        const t = (elapsed - scenes.length * SCENE_MS) / OUTRO_MS;
        drawOutro(ctx, reel, t);
      }

      onProgress?.(clamp01(elapsed / totalMs));
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  await audioCtx?.close().catch(() => {});
  onProgress?.(1);

  return {
    blob: await done,
    ext: mimeType.startsWith("video/mp4") ? "mp4" : "webm",
    narrated: Boolean(audioBuffer),
  };
}
