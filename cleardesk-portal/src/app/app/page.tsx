import Link from "next/link";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeBuckets, bucketOf } from "@/lib/buckets";
import { daysBetween, fmtDay, fmtRange, isoDay, todayIso } from "@/lib/dates";
import { usd } from "@/lib/money";
import { PaidCheckbox } from "@/components/PaidCheckbox";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireClient();
  const { denied } = await searchParams;
  const today = todayIso();
  const [client, owed, latest, processing] = await Promise.all([
    db.client.findUniqueOrThrow({ where: { id: user.clientId } }),
    db.bill.findMany({
      where: { clientId: user.clientId, kind: { in: ["bill", "expected"] }, isPaid: false, dueDate: { not: null } },
      orderBy: { dueDate: "asc" },
    }),
    db.summary.findFirst({ where: { clientId: user.clientId, status: "approved" }, orderBy: { asOf: "desc" } }),
    db.agentJob.count({ where: { clientId: user.clientId, status: { in: ["queued", "reading"] } } }),
  ]);
  const b = computeBuckets(owed, today);
  const next = owed.find((x) => x.dueDate && isoDay(x.dueDate) >= today);
  const nextIn = next?.dueDate ? daysBetween(today, isoDay(next.dueDate)) : null;
  const urgent = owed.filter((x) => x.dueDate && ["late", "next7"].includes(bucketOf(x.dueDate, today)));

  return (
    <div>
      {denied && (
        <p className="mb-6 rounded-md border border-late/30 bg-late/5 px-4 py-3 text-sm text-late">
          That page is for Clear Desk staff only.
        </p>
      )}
      <p className="text-sm text-muted">{client.name}</p>
      <div className="mt-6">
        <div className="label">Total owed, next 30 days</div>
        <div className="mt-1 font-serif text-5xl font-semibold tracking-tight sm:text-6xl">{usd(b.total30Cents)}</div>
        <p className="mt-3 text-sm text-muted">
          {next && nextIn != null ? (
            <>
              Next bill due {nextIn === 0 ? "today" : `in ${nextIn} ${nextIn === 1 ? "day" : "days"}`}: {next.vendor},{" "}
              {usd(next.amountCents)} on {fmtDay(next.dueDate, { weekday: true })}.
            </>
          ) : (
            "No upcoming bills."
          )}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
        {[
          ["Late", b.lateCents, true],
          ["Due next 7 days", b.next7Cents, false],
          ["Due in 8 to 30 days", b.next8to30Cents, false],
        ].map(([label, cents, red]) => (
          <div key={label as string} className="bg-white p-3 sm:p-5">
            <div className={`label ${red ? "!text-late" : ""}`}>{label as string}</div>
            <div className={`mt-1 font-serif text-base sm:text-2xl ${red ? "text-late" : ""}`}>{usd(cents as number)}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <section>
          <h2 className="h2 border-b border-gold pb-2">Pay first</h2>
          {urgent.length === 0 ? (
            <p className="py-4 text-sm text-muted">Nothing late or due this week.</p>
          ) : (
            <ul>
              {urgent.map((x) => {
                const late = bucketOf(x.dueDate!, today) === "late";
                return (
                  <li key={x.id} className="flex items-center gap-3 border-b border-line py-3">
                    <PaidCheckbox billId={x.id} paid={false} label={x.vendor} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{x.vendor}</div>
                      <div className={`text-xs ${late ? "font-bold text-late" : "text-muted"}`}>
                        {late ? (x.lateConfirmedAt ? "Late" : "Late, confirm") : "Due"} {fmtDay(x.dueDate, { weekday: true })}
                      </div>
                    </div>
                    <div className={`font-semibold tabular-nums ${late ? "text-late" : ""}`}>{usd(x.amountCents)}</div>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/app/bills" className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">
            All bills
          </Link>
        </section>

        <aside className="space-y-6">
          <div className="card p-5">
            <div className="label">Latest summary</div>
            {latest ? (
              <>
                <div className="mt-2 font-serif text-lg">Week of {fmtRange(latest.weekStart, latest.weekEnd)}</div>
                <Link href={`/app/summaries/${latest.id}`} className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">
                  Open summary
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">Your first summary will appear here once Richard has reviewed it.</p>
            )}
          </div>
          <div className="card p-5">
            <div className="label">Send us paperwork</div>
            <p className="mt-2 text-sm text-muted">
              {processing > 0 ? `${processing} file${processing === 1 ? "" : "s"} being sorted now.` : "Upload bills, invoices or receipts any day."}
            </p>
            <Link href="/app/uploads" className="btn mt-4">
              Upload files
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
