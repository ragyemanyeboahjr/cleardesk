import { db } from "./db";
import { addDays, dayFromIso, minutesNow, todayIso, weekday } from "./dates";
import { buildDraft } from "./agents/summarizer";

// Weekly summary schedule. In the demo this runs whenever an admin page
// loads (and from the "Run scheduler now" button). In production it would be
// a cron job or queue worker calling runDueSummaries() every few minutes.

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

/** Most recent scheduled run on or before now, as YYYY-MM-DD. */
export function lastRunDay(summaryDay: number, summaryTime: string, now = new Date()): string {
  const today = todayIso(now);
  const back = (weekday(today) - summaryDay + 7) % 7;
  // With DEMO_TODAY set the clock is frozen on a day, so ignore the hour.
  const frozen = Boolean(process.env.DEMO_TODAY?.trim());
  if (back === 0 && !frozen && minutesNow(now) < timeToMinutes(summaryTime)) return addDays(today, -7);
  return addDays(today, -back);
}

/** Next scheduled run strictly after now, as YYYY-MM-DD. */
export function nextRunDay(summaryDay: number, summaryTime: string, now = new Date()): string {
  return addDays(lastRunDay(summaryDay, summaryTime, now), 7);
}

/** Build any draft that is due and doesn't exist yet. Returns how many were built. */
export async function runDueSummaries(now = new Date()): Promise<number> {
  const clients = await db.client.findMany();
  let built = 0;
  for (const c of clients) {
    const due = lastRunDay(c.summaryDay, c.summaryTime, now);
    // Skip if this run (or a later one) already has a summary.
    const exists = await db.summary.findFirst({ where: { clientId: c.id, asOf: { gte: dayFromIso(due) } } });
    if (exists) continue;
    const uploads = await db.upload.count({ where: { clientId: c.id } });
    if (uploads === 0) continue;
    try {
      await buildDraft(c.id, due);
      built++;
    } catch (err) {
      // Another request drafted the same week at the same moment (unique
      // clientId+asOf). Anything else is a real error.
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  return built;
}
