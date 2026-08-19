export const SUPABASE_UNREACHABLE_RU =
  "Не удалось связаться с кабинетом. Если только что включили или выключили VPN — подождите пару секунд и нажмите «Повторить подключение».";

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

/**
 * Wrap any thenable (real Promise or Supabase query builder).
 * `Promise<T>` is wrong here: Postgrest builders are PromiseLike, so T
 * collapsed to `unknown` and `next build` failed on `{ data, error }`.
 */
export function withTimeout<T>(
  thenable: T,
  ms: number
): Promise<Awaited<T>> {
  return new Promise<Awaited<T>>((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error("timeout"));
    }, ms);
    Promise.resolve(thenable).then(
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
