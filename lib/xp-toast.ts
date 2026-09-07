export type XpToastEvent = {
  amount: number;
};

type Listener = (event: XpToastEvent) => void;

const listeners = new Set<Listener>();

export function emitXpToast(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const event: XpToastEvent = { amount: Math.round(amount) };
  listeners.forEach((fn) => fn(event));
}

export function subscribeXpToasts(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
