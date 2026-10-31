import type { AppSubscriptionTier } from "@/types";

/** Inclusive last day of the student Premium trial, studio clock (Yekaterinburg). */
export const STUDIO_TRIAL_END_LABEL = "10 ноября 2026";

/** First instant after the trial: 11 Nov 2026 00:00 Asia/Yekaterinburg. */
export const STUDIO_TRIAL_PREMIUM_ENDS_AT = "2026-11-10T19:00:00.000Z";

export function studioTrialEndsAt(): Date {
  return new Date(STUDIO_TRIAL_PREMIUM_ENDS_AT);
}

export function isStudioTrialActive(now = Date.now()): boolean {
  return now < studioTrialEndsAt().getTime();
}

/** Profile was granted the open beta Premium (not a paid plan that happens to end later). */
export function isStudioTrialPremium(
  tier: AppSubscriptionTier,
  expiresAt: string | null | undefined,
  now = Date.now()
): boolean {
  if (!isStudioTrialActive(now) || tier !== "premium" || !expiresAt) return false;
  const end = studioTrialEndsAt().getTime();
  const got = new Date(expiresAt).getTime();
  if (!Number.isFinite(got)) return false;
  return Math.abs(got - end) < 36 * 60 * 60 * 1000;
}
