export const SUPABASE_UNREACHABLE_RU =
  "Недоступен Supabase (supabase.co). Сайт отдаёт Timeweb в России, но вход, чат и кабинет ходят в зарубежное облако и часто блокируются. Проверьте, что supabase.co открывается без VPN, либо подключите свой домен или прокси до Supabase.";

export function isLikelyUnreachableBackend(error: unknown): boolean {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error ?? "");
  return /failed to fetch|networkerror|abort|timeout|timed out|load failed|fetch failed|network request failed/i.test(
    raw
  );
}

export function mapBackendError(error: unknown, fallback?: string): string {
  if (isLikelyUnreachableBackend(error)) return SUPABASE_UNREACHABLE_RU;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message ?? "").trim();
    if (message) return message;
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback ?? SUPABASE_UNREACHABLE_RU;
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error("timeout"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (error) => {
        clearTimeout(id);
        reject(error);
      }
    );
  });
}
