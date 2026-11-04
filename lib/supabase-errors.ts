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

export const AUTH_EMAIL_UNCONFIRMED_RU =
  "Почта ещё не подтверждена. Если письма нет или ссылка устарела — запросите новое ниже.";
export const AUTH_LINK_EXPIRED_RU =
  "Ссылка устарела. Запросите новую на экране входа.";
export const AUTH_LINK_GENERIC_RU =
  "Ссылка входа недействительна. Войдите или запросите новое письмо.";

const AUTH_LINK_SAFE_COPY = new Set([
  AUTH_EMAIL_UNCONFIRMED_RU,
  AUTH_LINK_EXPIRED_RU,
  AUTH_LINK_GENERIC_RU,
]);

/** Known GoTrue (Supabase Auth) English messages → Russian student copy. */
function translateAuthMessage(text: string): string {
  if (/invalid login credentials/i.test(text)) return "Неверная почта или пароль.";
  if (/already (been )?registered|already exists/i.test(text))
    return "Эта почта уже зарегистрирована. Войдите или восстановите пароль.";
  if (/email not confirmed/i.test(text)) return AUTH_EMAIL_UNCONFIRMED_RU;
  if (/error sending .*email|sending .*email/i.test(text))
    return "Не удалось отправить письмо. Попробуйте позже или напишите преподавателю.";
  const waitSec = text.match(/after\s+(\d+)\s+seconds/i);
  if (waitSec)
    return `Письмо уже отправлено. Подождите ${waitSec[1]} сек. и проверьте почту.`;
  if (/over_email_send_rate_limit|rate limit|too many requests|for security purposes/i.test(text))
    return "Письмо уже отправлено. Подождите минуту и проверьте почту — в том числе папку «Спам».";
  if (/new password should be different|same password/i.test(text))
    return "Новый пароль должен отличаться от старого.";
  if (/password should be|weak password|at least \d+ char/i.test(text))
    return "Пароль слишком короткий или простой. Используйте не менее 8 символов.";
  if (/unable to validate email|invalid format|invalid email/i.test(text))
    return "Проверьте адрес почты.";
  if (/otp.*expired|token.*(expired|invalid)|link.*expired/i.test(text))
    return AUTH_LINK_EXPIRED_RU;
  return text;
}

/**
 * Auth callback query/hash (`error`, `error_code`, `error_description`).
 * Never echoes attacker-controlled text into the login form.
 */
export function mapAuthCallbackError(params: {
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
}): string | null {
  const error = (params.error ?? "").trim();
  const errorCode = (params.errorCode ?? "").trim();
  const errorDescription = (params.errorDescription ?? "").trim();
  if (!error && !errorCode && !errorDescription) return null;

  for (const value of [errorDescription, error, errorCode]) {
    if (AUTH_LINK_SAFE_COPY.has(value)) return value;
  }

  const blob = [errorCode, error, errorDescription].filter(Boolean).join(" ");
  if (
    /otp_expired|flow_state_expired/i.test(blob) ||
    /email link is invalid or has expired/i.test(blob) ||
    /otp.*expired|token.*(expired|invalid)|link.*expired/i.test(blob)
  ) {
    return AUTH_LINK_EXPIRED_RU;
  }
  if (/email_not_confirmed|email not confirmed/i.test(blob)) {
    return AUTH_EMAIL_UNCONFIRMED_RU;
  }
  return AUTH_LINK_GENERIC_RU;
}

export function isEmailConfirmPendingError(text: string): boolean {
  return /письмо уже отправлено|подождите \d+ сек|подождите минуту и проверьте почту/i.test(
    text
  );
}

export function isEmailUnconfirmedError(text: string): boolean {
  return /почта ещё не подтверждена|email not confirmed|ссылка устарела/i.test(
    text
  );
}

/** Human-readable auth/backend error; never returns `{}` / empty object stringification. */
export function mapBackendError(error: unknown, fallback?: string): string {
  const fb = fallback ?? SUPABASE_UNREACHABLE_RU;
  if (isLikelyUnreachableBackend(error)) return SUPABASE_UNREACHABLE_RU;

  if (typeof error === "string") {
    const text = pickErrorText(error);
    return text ? translateAuthMessage(text) : fb;
  }

  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    for (const key of ["message", "error_description", "msg", "error", "code"] as const) {
      const text = pickErrorText(obj[key]);
      if (text) return translateAuthMessage(text);
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
