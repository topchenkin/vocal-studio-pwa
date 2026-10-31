/** Active payment provider for the static PWA. */
export const PAYMENT_PROVIDER = "yookassa";

export const PAYMENT_API_BASE = "/api/payments";

/** Gateways the student can pick: YooKassa (SBP / RU cards), Prodamus (international cards). */
export type PaymentGateway = "yookassa" | "prodamus";

export function paymentProviderLabel(provider: string = PAYMENT_PROVIDER) {
  if (provider === "yookassa") return "ЮKassa";
  if (provider === "prodamus") return "Prodamus";
  return provider;
}
