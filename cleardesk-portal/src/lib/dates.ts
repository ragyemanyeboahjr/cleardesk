// Calendar dates (due dates, document dates) are stored as 12:00 UTC on that
// day so they never shift when formatted. "Today" is the business's local day
// in Dallas, unless DEMO_TODAY freezes it for the demo.

export const BUSINESS_TZ = "America/Chicago";

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dayFromIso(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

export function addDays(iso: string, days: number): string {
  const d = dayFromIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((dayFromIso(bIso).getTime() - dayFromIso(aIso).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: string): number {
  return dayFromIso(iso).getUTCDay();
}

function chicagoParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10),
  };
}

/** Today's date in Dallas as YYYY-MM-DD (or DEMO_TODAY). */
export function todayIso(now: Date = new Date()): string {
  const demo = process.env.DEMO_TODAY?.trim();
  if (demo && /^\d{4}-\d{2}-\d{2}$/.test(demo)) return demo;
  return chicagoParts(now).iso;
}

/** Minutes past midnight in Dallas right now (real clock, even in demo mode). */
export function minutesNow(now: Date = new Date()): number {
  return chicagoParts(now).minutes;
}

export function fmtDay(d: Date | string | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!d) return "—";
  const date = typeof d === "string" ? dayFromIso(d) : d;
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(opts.weekday ? { weekday: "short" } : {}),
    ...(opts.year ? { year: "numeric" } : {}),
  });
}

/** "Nov 9–13" or "Nov 30 – Dec 4" */
export function fmtRange(start: Date, end: Date): string {
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const s = fmtDay(start);
  return sameMonth ? `${s}–${end.getUTCDate()}` : `${s} – ${fmtDay(end)}`;
}

export function fmtTimestamp(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: BUSINESS_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "09:00" -> "9:00am" */
export function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}
