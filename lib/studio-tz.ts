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
