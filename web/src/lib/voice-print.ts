"use client";

/**
 * Two-speaker presence detection.
 *
 * The spec is explicit that "one voice agreeing twice is not two parties
 * agreeing", but Aegis can only ever self-report that from the transcript. This
 * measures it from the audio instead.
 *
 * Method: estimate the fundamental frequency of voiced audio by autocorrelation,
 * then run a 1-D two-means clustering over the collected pitches. Adult speaking
 * F0 separates fairly cleanly (typically ~85-180 Hz vs ~165-255 Hz), so two
 * genuinely different speakers produce two well-separated centroids, while one
 * person talking to themselves produces one tight cluster no matter what they
 * say.
 *
 * This is presence evidence, not biometric identification — it answers "are
 * there two distinct voices in this room", which is exactly the question that
 * gates the escrow lock.
 */

const MIN_HZ = 70;
const MAX_HZ = 320;
const MIN_RMS = 0.014; // below this it is silence or room noise, not speech
const MIN_SAMPLES_PER_SPEAKER = 12;
const MIN_CENTROID_GAP_HZ = 26;

export type SpeakerReading = {
  distinctSpeakers: 0 | 1 | 2;
  centroids: number[];
  samples: number;
  confidence: number;
};

/** Autocorrelation pitch estimate. Returns Hz, or 0 when the frame is unvoiced. */
export function estimatePitch(buf: Float32Array, sampleRate: number): number {
  const n = buf.length;

  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < MIN_RMS) return 0;

  const minLag = Math.floor(sampleRate / MAX_HZ);
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / MIN_HZ));

  let bestLag = -1;
  let bestCorr = 0;
  let lastCorr = 1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < n - lag; i++) corr += buf[i] * buf[i + lag];
    corr /= n - lag;

    // take the first strong peak, not the global max, to avoid octave errors
    if (corr > 0.42 && corr > lastCorr && corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
    lastCorr = corr;
  }

  return bestLag > 0 ? sampleRate / bestLag : 0;
}

/** Two-means over a 1-D pitch series. */
function twoMeans(values: number[]): { a: number; b: number; naS: number; nbS: number } {
  const sorted = [...values].sort((x, y) => x - y);
  let a = sorted[Math.floor(sorted.length * 0.2)];
  let b = sorted[Math.floor(sorted.length * 0.8)];

  for (let iter = 0; iter < 24; iter++) {
    let sumA = 0, sumB = 0, na = 0, nb = 0;
    for (const v of values) {
      if (Math.abs(v - a) <= Math.abs(v - b)) {
        sumA += v; na++;
      } else {
        sumB += v; nb++;
      }
    }
    const newA = na ? sumA / na : a;
    const newB = nb ? sumB / nb : b;
    if (Math.abs(newA - a) < 0.4 && Math.abs(newB - b) < 0.4) {
      a = newA; b = newB;
      return { a, b, naS: na, nbS: nb };
    }
    a = newA; b = newB;
  }

  let na = 0, nb = 0;
  for (const v of values) (Math.abs(v - a) <= Math.abs(v - b) ? na++ : nb++);
  return { a, b, naS: na, nbS: nb };
}

export function analyseSpeakers(pitches: number[]): SpeakerReading {
  const voiced = pitches.filter((p) => p >= MIN_HZ && p <= MAX_HZ);

  if (voiced.length < MIN_SAMPLES_PER_SPEAKER) {
    return { distinctSpeakers: voiced.length ? 1 : 0, centroids: [], samples: voiced.length, confidence: 0 };
  }

  const { a, b, naS, nbS } = twoMeans(voiced);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const gap = hi - lo;
  const bothPopulated =
    Math.min(naS, nbS) >= MIN_SAMPLES_PER_SPEAKER &&
    Math.min(naS, nbS) / voiced.length > 0.18;

  if (gap >= MIN_CENTROID_GAP_HZ && bothPopulated) {
    // confidence scales with separation and how balanced the two clusters are
    const sep = Math.min(1, gap / 70);
    const balance = Math.min(naS, nbS) / Math.max(naS, nbS);
    return {
      distinctSpeakers: 2,
      centroids: [Math.round(lo), Math.round(hi)],
      samples: voiced.length,
      confidence: Math.round(Math.min(0.99, sep * 0.65 + balance * 0.35) * 100) / 100,
    };
  }

  const mean = voiced.reduce((s, v) => s + v, 0) / voiced.length;
  return {
    distinctSpeakers: 1,
    centroids: [Math.round(mean)],
    samples: voiced.length,
    confidence: Math.round(Math.min(0.95, voiced.length / 90) * 100) / 100,
  };
}
