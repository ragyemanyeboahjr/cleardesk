import { fmtDay, fmtRange } from "@/lib/dates";
import { usd } from "@/lib/money";
import type { SummaryView } from "@/lib/summary-view";
import { PaidCheckbox } from "./PaidCheckbox";

// The weekly summary as the client sees it. Same layout as the PDF.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="h2 border-b border-gold pb-2">{title}</h2>
      {children}
    </section>
  );
}

function StaticBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-4 w-4 rounded-[3px] border border-navy ${checked ? "bg-navy" : "bg-white"}`}
    />
  );
}

export function SummaryDocument({
  businessName,
  weekStart,
  weekEnd,
  introText,
  view,
  paidBillIds,
  interactive,
}: {
  businessName: string;
  weekStart: Date;
  weekEnd: Date;
  introText: string;
  view: SummaryView;
  paidBillIds: Set<string>;
  interactive: boolean;
}) {
  const box = (billId: string | null, label: string) => {
    const paid = Boolean(billId && paidBillIds.has(billId));
    return interactive && billId ? <PaidCheckbox billId={billId} paid={paid} label={label} /> : <StaticBox checked={paid} />;
  };

  return (
    <article className="text-navy">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-gold pb-4">
        <div>
          <div className="font-serif text-xl font-semibold">Clear Desk Dallas</div>
          <div className="text-xs text-muted">by Richard Agyeman-Yeboah Jr.</div>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold">{businessName}</div>
          <div className="text-muted">
            Week of {fmtRange(weekStart, weekEnd)}, {weekEnd.getUTCFullYear()}
          </div>
        </div>
      </header>

      {/* Page 1 */}
      <div className="mt-8">
        <div className="label">Total you owe, next 30 days</div>
        <div className="mt-1 font-serif text-5xl font-semibold tracking-tight sm:text-6xl">{usd(view.buckets.total30Cents)}</div>
      </div>
      <div className="mt-6 grid grid-cols-3 divide-x divide-line">
        {[
          ["Late", view.buckets.lateCents, true],
          ["Due next 7 days", view.buckets.next7Cents, false],
          ["Due in 8 to 30 days", view.buckets.next8to30Cents, false],
        ].map(([label, cents, red], i) => (
          <div key={label as string} className={i === 0 ? "pr-3" : "px-3"}>
            <div className={`label ${red ? "!text-late" : ""}`}>{label as string}</div>
            <div className={`mt-1 font-serif text-xl sm:text-2xl ${red ? "text-late" : "text-navy"}`}>{usd(cents as number)}</div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm text-muted">
        {view.stats.receiptsSorted} receipts sorted · {usd(view.stats.spentCents)} spent this week · {view.stats.hoursSaved} hours saved
      </p>
      <p className="mt-5 max-w-prose whitespace-pre-line text-[15px] leading-relaxed">{introText}</p>

      <Section title="Pay first">
        {view.payFirst.length === 0 ? (
          <p className="py-4 text-sm text-muted">Nothing late or due in the next 7 days.</p>
        ) : (
          <ol>
            {view.payFirst.map((r, i) => {
              const late = r.bucket === "late";
              return (
                <li key={r.id} className="flex items-center gap-3 border-b border-line py-3">
                  <span className="w-5 font-bold text-gold">{i + 1}.</span>
                  {box(r.billId, r.vendor)}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.vendor}</div>
                    <div className={`text-xs ${late ? "font-bold text-late" : "text-muted"}`}>
                      {late ? `Late, was due ${fmtDay(r.dueDate)}` : `Due ${fmtDay(r.dueDate, { weekday: true })}`} · {r.category}
                    </div>
                  </div>
                  <div className={`font-semibold tabular-nums ${late ? "text-late" : ""}`}>{usd(r.amountCents)}</div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <Section title="Coming up">
        {view.comingUp.length === 0 ? (
          <p className="py-4 text-sm text-muted">Nothing due in days 8 to 30.</p>
        ) : (
          <ul>
            {view.comingUp.map((r) => (
              <li key={r.id} className="flex items-center gap-3 border-b border-line py-3">
                <span className="w-20 shrink-0 text-xs text-muted">{fmtDay(r.dueDate, { weekday: true })}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.vendor}</div>
                  <div className="text-xs text-muted">
                    {r.category}
                    {r.expected ? " · expected monthly" : ""}
                  </div>
                </div>
                <div className="font-semibold tabular-nums">{usd(r.amountCents)}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Page 2 */}
      <div className="mt-14 border-t border-dashed border-line pt-2 text-right text-[11px] text-muted">Page 2</div>

      <Section title="Needs your eyes">
        {view.needsEyes.length === 0 ? (
          <p className="py-4 text-sm text-muted">No questions this week.</p>
        ) : (
          <ul>
            {view.needsEyes.map((q) => (
              <li key={q.questionId} className="flex gap-3 border-b border-line py-3 text-sm">
                <span className="flex-1">{q.body}</span>
                {q.amountCents != null && <span className="font-semibold tabular-nums">{usd(q.amountCents)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Worth a second look">
        {view.secondLook.length === 0 ? (
          <p className="py-4 text-sm text-muted">No flagged charges this week.</p>
        ) : (
          <ul>
            {view.secondLook.map((s, i) => (
              <li key={i} className="border-b border-line py-3">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{s.vendor}</span>
                  <span className="font-semibold tabular-nums">{usd(s.amountCents)}</span>
                </div>
                <div className="text-xs text-muted">{s.message}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Spending this week">
        <ul>
          {view.stats.spending.map((s) => {
            const max = Math.max(1, ...view.stats.spending.map((x) => x.cents));
            return (
              <li key={s.category} className="grid grid-cols-[1fr_auto] items-center gap-x-3 border-b border-line py-2.5 text-sm sm:grid-cols-[12rem_1fr_auto]">
                <span>{s.category}</span>
                <span className="hidden h-1.5 sm:block">
                  <span className="block h-1.5 bg-gold" style={{ width: `${Math.max(2, (s.cents / max) * 100)}%` }} />
                </span>
                <span className="font-semibold tabular-nums">{usd(s.cents)}</span>
              </li>
            );
          })}
          <li className="flex justify-between py-2.5 text-sm font-bold">
            <span>Total spent</span>
            <span className="tabular-nums">{usd(view.stats.spentCents)}</span>
          </li>
        </ul>
      </Section>

      <footer className="mt-12 border-t border-line pt-4 text-xs text-muted">
        I never contact your vendors. Not accounting, tax or legal advice.
      </footer>
    </article>
  );
}
