/** Studio wall clock. Yekaterinburg has no DST (UTC+5). */
export const STUDIO_TZ = "Asia/Yekaterinburg";
export const STUDIO_UTC_OFFSET = "+05:00";

export function studioDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function studioDateTimeParts(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

/** Interpret a date+time picker as Yekaterinburg, not the browser zone. */
export function studioWallToUtcIso(date: string, time: string) {
  const clock = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${clock}${STUDIO_UTC_OFFSET}`).toISOString();
}

/** Inclusive end of a civil date in the studio zone. */
export function studioEndOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999${STUDIO_UTC_OFFSET}`).toISOString();
}

export function formatStudioExpiry(
  value: Date | string,
  style: "short" | "long" = "short"
) {
  return formatStudioDate(
    value,
    style === "long"
      ? { day: "numeric", month: "long", year: "numeric" }
      : { day: "2-digit", month: "2-digit", year: "numeric" }
  );
}

export function formatStudioDate(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = {}
) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: STUDIO_TZ,
    ...options,
  }).format(date);
}

/** Noon in Yekaterinburg for the given civil date — stable calendar math. */
export function studioCivilNoon(year: number, month: number, day: number) {
  return new Date(
    Date.UTC(year, month - 1, day, 7, 0, 0)
  );
}

export function formatStudioDateTime(value: Date | string) {
  return formatStudioDate(value, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** First–last activity in the studio zone, e.g. «9 ноября, 18:00–18:59». */
export function formatStudioTimeRange(
  start: Date | string,
  end?: Date | string | null
) {
  const from = formatStudioDateTime(start);
  if (end == null || end === "") return from;
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(endDate.getTime())) return from;
  if (endDate.getTime() - startDate.getTime() < 60_000) return from;
  const endClock = formatStudioDate(endDate, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (studioDateKey(startDate) === studioDateKey(endDate)) {
    return `${from}–${endClock}`;
  }
  return `${from} – ${formatStudioDateTime(endDate)}`;
}
