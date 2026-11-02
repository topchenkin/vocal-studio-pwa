/** Display default. Live RF kassa is chosen on pay-api (admin toggle / env). */
export const PAYMENT_PROVIDER = "robokassa";

export const PAYMENT_API_BASE = "/api/payments";

/** Student picker: RF kassa (Robokassa or YooKassa) vs Prodamus international. */
export type PaymentGateway = "rf" | "prodamus";
export type RfKassa = "robokassa" | "yookassa";

export function paymentProviderLabel(provider: string = PAYMENT_PROVIDER) {
  if (provider === "robokassa" || provider === "rf") return "Robokassa";
  if (provider === "yookassa") return "ЮKassa";
  if (provider === "prodamus") return "Prodamus";
  return provider;
}
