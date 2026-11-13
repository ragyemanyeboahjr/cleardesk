import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDay, fmtTime, WEEKDAYS } from "@/lib/dates";
import { nextRunDay } from "@/lib/scheduler";
import { saveSettingsAction } from "../actions";

export const metadata = { title: "Settings" };

const TIMES = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
const TYPE_LABEL: Record<string, string> = {
  dental: "Dental",
  salon: "Salon",
  home_services: "Home services",
  property_management: "Property management",
  other: "Other",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; saved?: string; error?: string }>;
}) {
  const user = await requireClient();
  const sp = await searchParams;
  const c = await db.client.findUniqueOrThrow({ where: { id: user.clientId } });

  return (
    <div className="max-w-2xl">
      {sp.welcome && (
        <div className="mb-8 rounded-md border border-gold/40 bg-gold/5 p-4 text-sm">
          <div className="font-semibold">Welcome, {c.name}.</div>
          <div className="mt-1 text-muted">Pick when you'd like your weekly summary. Then you can upload your first files.</div>
        </div>
      )}
      <h1 className="h1">Settings</h1>
      {sp.saved && <p className="mt-3 text-sm text-[#2f6b4f]">Saved.</p>}
      {sp.error && <p className="mt-3 text-sm text-late">Please check the day, time and email.</p>}

      <form action={saveSettingsAction} className="mt-8 space-y-8">
        {sp.welcome && <input type="hidden" name="welcome" value="1" />}
        <section>
          <h2 className="h2 border-b border-gold pb-2">Weekly summary</h2>
          <p className="mt-3 text-sm text-muted">
            Your summary is drafted on this day, checked by Richard, then delivered. Dallas time.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold">Day</span>
              <select name="summaryDay" defaultValue={c.summaryDay} className="input mt-1">
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    Every {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Time</span>
              <select name="summaryTime" defaultValue={c.summaryTime} className="input mt-1">
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {fmtTime(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-muted">
            Next summary: {fmtDay(nextRunDay(c.summaryDay, c.summaryTime), { weekday: true })} at {fmtTime(c.summaryTime)}.
          </p>
          <label className="mt-5 block">
            <span className="text-sm font-semibold">Delivery email</span>
            <input name="deliveryEmail" type="email" required defaultValue={c.deliveryEmail} className="input mt-1" />
          </label>
        </section>

        <section>
          <h2 className="h2 border-b border-gold pb-2">Plan</h2>
          <div className="mt-4 text-sm">
            <div>
              <span className="font-semibold">{c.plan === "pilot" ? "Pilot (free week)" : "Ongoing service"}</span>
              {c.plan === "pilot" && c.pilotEndsAt && <span className="text-muted"> · ends {fmtDay(c.pilotEndsAt, { weekday: true })}</span>}
            </div>
            <div className="mt-1 text-muted">{TYPE_LABEL[c.businessType] ?? c.businessType}</div>
            {c.plan === "pilot" && (
              <label className="mt-4 flex items-center gap-2">
                <input type="checkbox" name="plan" value="ongoing" className="h-4 w-4 accent-[#0f2340]" />
                <span>Switch to Ongoing service after my pilot</span>
              </label>
            )}
          </div>
        </section>

        <button className="btn">{sp.welcome ? "Save and continue" : "Save settings"}</button>
      </form>
    </div>
  );
}
