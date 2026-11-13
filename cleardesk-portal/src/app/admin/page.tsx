import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { runDueSummaries } from "@/lib/scheduler";
import { db } from "@/lib/db";
import { fmtRange, fmtTimestamp } from "@/lib/dates";
import { usd } from "@/lib/money";
import { buildSummaryView } from "@/lib/summary-view";
import { Badge, STATUS_BADGE } from "@/components/Badge";
import { runSchedulerAction } from "./actions";

export const metadata = { title: "Review queue" };


export default async function ReviewQueue({
  searchParams,
}: {
  searchParams: Promise<{ approved?: string; scheduled?: string }>;
}) {
  await requireAdmin();
  // Demo scheduler: build any summary drafts that are due before listing them.
  await runDueSummaries();
  const sp = await searchParams;
  const [waiting, recent] = await Promise.all([
    db.summary.findMany({
      where: { status: { in: ["awaiting_review", "sent_back"] } },
      orderBy: { asOf: "asc" },
      include: { client: true, rows: true },
    }),
    db.summary.findMany({
      where: { status: "approved" },
      orderBy: { approvedAt: "desc" },
      take: 10,
      include: { client: true },
    }),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h1">Review queue</h1>
          <p className="mt-2 text-sm text-muted">Nothing reaches a client until you approve it.</p>
        </div>
        <form action={runSchedulerAction}>
          <button className="btn-quiet">Run scheduler now</button>
        </form>
      </div>
      {sp.approved && (
        <p className="mt-6 rounded-md border border-[#2f6b4f]/30 bg-[#2f6b4f]/5 px-4 py-3 text-sm text-[#2f6b4f]">
          Approved. The client can see it now, and the delivery email was logged to the outbox.
        </p>
      )}
      {sp.scheduled && (
        <p className="mt-6 rounded-md border border-line px-4 py-3 text-sm text-muted">
          Scheduler ran: {sp.scheduled} new draft{sp.scheduled === "1" ? "" : "s"}.
        </p>
      )}

      <ul className="mt-8 border-t border-gold">
        {waiting.length === 0 && <li className="py-6 text-sm text-muted">All caught up. No drafts waiting.</li>}
        {waiting.map((s) => {
          const v = buildSummaryView(s);
          const badge = STATUS_BADGE[s.status];
          return (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/review/${s.id}`} className="font-serif text-lg hover:underline">
                    {s.client.name}
                  </Link>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  Week of {fmtRange(s.weekStart, s.weekEnd)} · {s.rows.length} bills · {usd(v.buckets.total30Cents)} owed ·{" "}
                  {v.secondLook.length} flagged · {v.needsEyes.length} question{v.needsEyes.length === 1 ? "" : "s"}
                </div>
                {s.reviewNote && <div className="mt-1 text-xs text-late">Your note: “{s.reviewNote}”</div>}
              </div>
              <Link href={`/admin/review/${s.id}`} className="btn">
                Review
              </Link>
            </li>
          );
        })}
      </ul>

      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="h2 border-b border-gold pb-2">Recently approved</h2>
          <ul>
            {recent.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-3 text-sm">
                <Link href={`/admin/review/${s.id}`} className="font-semibold hover:underline">
                  {s.client.name} · week of {fmtRange(s.weekStart, s.weekEnd)}
                </Link>
                <span className="text-xs text-muted">{s.approvedAt ? fmtTimestamp(s.approvedAt) : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
