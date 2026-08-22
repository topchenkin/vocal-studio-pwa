export const SUPABASE_UNREACHABLE_RU =
  "Не удалось связаться с кабинетом. Если только что включили или выключили VPN — подождите пару секунд и нажмите «Повторить подключение».";

export function isLikelyUnreachableBackend(error: unknown): boolean {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error ?? "");
  return /failed to fetch|networkerror|abort|timeout|timed out|load failed|fetch failed|network request failed|unreachable/i.test(
    raw
  );
}

function isUselessErrorText(value: string): boolean {
  const t = value.trim();
  return !t || t === "{}" || t === "[object Object]" || t === "null" || t === "undefined";
}

function pickErrorText(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return isUselessErrorText(t) ? null : t;
  }
  return null;
}

/** Human-readable auth/backend error; never returns `{}` / empty object stringification. */
export function mapBackendError(error: unknown, fallback?: string): string {
  const fb = fallback ?? SUPABASE_UNREACHABLE_RU;
  if (isLikelyUnreachableBackend(error)) return SUPABASE_UNREACHABLE_RU;

  if (typeof error === "string") {
    return pickErrorText(error) ?? fb;
  }

  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    for (const key of ["message", "error_description", "msg", "error", "code"] as const) {
      const text = pickErrorText(obj[key]);
      if (text) return text;
    }
  }

  return fb;
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
