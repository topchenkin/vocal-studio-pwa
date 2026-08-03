/**
 * @deprecated Broken for singing: raw DFT peaks = F0 harmonics → thin female → "male".
 * Use `classifySingingGender` from `@/lib/singing-gender` instead.
 *
 * Kept as a thin wrapper so older imports keep compiling.
 */

import {
  classifySingingGender,
  type SingingGenderResult,
} from "@/lib/singing-gender";

export type FormantGenderResult = {
  gender: "female" | "male";
  confidence: "high" | "medium" | "low";
  f1: number;
  f2: number;
  score: number;
};

export function estimateGenderFromFormants(
  channel: Float32Array,
  sampleRate: number
): FormantGenderResult | null {
  const r: SingingGenderResult = classifySingingGender(channel, sampleRate);
  if (r.pitchFrames < 2 && r.f1 <= 0) return null;
  // score > 0 male lean (legacy sign)
  const score = r.gender === "male" ? 0.6 : -0.6;
  return {
    gender: r.gender,
    confidence: r.confidence,
    f1: r.f1 || 500,
    f2: r.f2 || 1500,
    score,
  };
}
