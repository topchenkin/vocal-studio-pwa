/** Active payment provider for the static PWA (mirrors PAYMENT_PROVIDER on pay-api). */
export const PAYMENT_PROVIDER =
  (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || "yookassa").toLowerCase();

export const PAYMENT_API_BASE = "/api/payments";

export function paymentProviderLabel(provider = PAYMENT_PROVIDER) {
  if (provider === "yookassa") return "ЮKassa";
  if (provider === "robokassa") return "Robokassa";
  return provider;
}
