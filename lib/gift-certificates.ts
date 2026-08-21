import type {
  AppSubscriptionTier,
  GiftCertificateRow,
} from "@/types";

export const GIFT_KINDS = [
  "lesson",
  "abonement",
  "subscription",
  "premium",
] as const;

export type GiftKind = (typeof GIFT_KINDS)[number];

export type GiftStatus =
  | "pending_payment"
  | "paid"
  | "redeemed"
  | "cancelled";

export type GiftCertificate = GiftCertificateRow;

export const GIFT_KIND_LABELS: Record<GiftKind, string> = {
  lesson: "Один урок",
  abonement: "Абонемент",
  subscription: "Подписка",
  premium: "Премиум: абонемент + подписка",
};

export const GIFT_STATUS_LABELS: Record<GiftStatus, string> = {
  pending_payment: "Ждёт оплату",
  paid: "Оплачен, не активирован",
  redeemed: "Активирован",
  cancelled: "Отменён",
};

export function normalizeGiftCode(raw: string) {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function formatGiftCode(code: string) {
  const compact = normalizeGiftCode(code).slice(0, 12);
  const parts = [
    compact.slice(0, 4),
    compact.slice(4, 8),
    compact.slice(8, 12),
  ].filter(Boolean);
  return parts.join("-");
}

export function giftBenefitLine(cert: Pick<
  GiftCertificate,
  "kind" | "lessons_count" | "app_sub_tier"
>) {
  const lessons = cert.lessons_count ?? 0;
  const tier = cert.app_sub_tier
    ? cert.app_sub_tier.charAt(0).toUpperCase() + cert.app_sub_tier.slice(1)
    : "";
  if (cert.kind === "lesson") return "1 занятие";
  if (cert.kind === "abonement") {
    return `${lessons} ${lessons === 1 ? "занятие" : lessons < 5 ? "занятия" : "занятий"}`;
  }
  if (cert.kind === "subscription") return `подписка ${tier}`;
  return `${lessons} ${lessons === 1 ? "занятие" : lessons < 5 ? "занятия" : "занятий"} + подписка ${tier}`;
}
