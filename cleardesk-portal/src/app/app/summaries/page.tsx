import Link from "next/link";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtRange, fmtTimestamp } from "@/lib/dates";
import { usd } from "@/lib/money";
import { buildSummaryView } from "@/lib/summary-view";

export const metadata = { title: "Summaries" };

export default async function SummariesPage() {
  const user = await requireClient();
  // Clients only ever see approved summaries.
  const [summaries, outbox] = await Promise.all([
    db.summary.findMany({
      where: { clientId: user.clientId, status: "approved" },
      orderBy: { asOf: "desc" },
      include: { rows: true },
    }),
    db.outboxEmail.findMany({ where: { clientId: user.clientId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div>
      <h1 className="h1">Weekly summaries</h1>
      <p className="mt-2 text-sm text-muted">Every summary is checked by Richard before it reaches you.</p>

      {summaries.length === 0 ? (
        <p className="mt-8 rounded-md border border-line px-4 py-6 text-sm text-muted">
          No summaries yet. Your first one will show up here after your scheduled summary day, once Richard has reviewed it.
        </p>
      ) : (
        <ul className="mt-6 border-t border-gold">
          {summaries.map((s) => {
            const v = buildSummaryView(s);
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-4">
                <div>
                  <Link href={`/app/summaries/${s.id}`} className="font-serif text-lg hover:underline">
                    Week of {fmtRange(s.weekStart, s.weekEnd)}, {s.weekEnd.getUTCFullYear()}
                  </Link>
                  <div className="text-xs text-muted">
                    {usd(v.buckets.total30Cents)} owed next 30 days ·{" "}
                    <span className={v.buckets.lateCents ? "text-late" : ""}>{usd(v.buckets.lateCents)} late</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/app/summaries/${s.id}`} className="btn-quiet">
                    Open
                  </Link>
                  <a href={`/api/summaries/${s.id}/pdf`} className="btn-quiet">
                    PDF
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-12">
        <h2 className="h2 border-b border-gold pb-2">Delivery log</h2>
        <p className="mt-2 text-xs text-muted">Demo: emails are logged here instead of being sent.</p>
        {outbox.length === 0 ? (
          <p className="py-4 text-sm text-muted">Nothing delivered yet.</p>
        ) : (
          <ul>
            {outbox.map((e) => (
              <li key={e.id} className="border-b border-line py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold">{e.subject}</span>
                  <span className="text-xs text-muted">{fmtTimestamp(e.createdAt)}</span>
                </div>
                <div className="text-xs text-muted">
                  To {e.to} · {e.status === "logged" ? "logged, not sent (demo)" : e.status}
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-semibold">Show email</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-md border border-line p-3 font-sans text-xs leading-relaxed">{e.body}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
