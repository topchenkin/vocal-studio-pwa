/** Active payment provider for the static PWA. */
export const PAYMENT_PROVIDER = "yookassa";

export const PAYMENT_API_BASE = "/api/payments";

export function paymentProviderLabel(provider = PAYMENT_PROVIDER) {
  if (provider === "yookassa") return "ЮKassa";
  return provider;
}
