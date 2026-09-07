export type XpToastEvent = {
  amount: number;
  line?: string;
};

type Listener = (event: XpToastEvent) => void;

const listeners = new Set<Listener>();
let pendingAmount = 0;
let pendingLine = "";
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  const amount = pendingAmount;
  const line = pendingLine;
  pendingAmount = 0;
  pendingLine = "";
  if (!Number.isFinite(amount) || amount <= 0) return;
  const event: XpToastEvent = { amount: Math.round(amount), line: line || undefined };
  listeners.forEach((fn) => fn(event));
}

export function emitXpToast(amount: number, line?: string) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  pendingAmount += Math.round(amount);
  if (line) pendingLine = line;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 280);
}

export function subscribeXpToasts(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
