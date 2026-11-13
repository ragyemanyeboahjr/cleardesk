import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { billStatus, computeBuckets, STATUS_LABEL, type BillStatus } from "@/lib/buckets";
import { fmtDay, todayIso } from "@/lib/dates";
import { usd } from "@/lib/money";
import { Badge } from "@/components/Badge";
import { PaidCheckbox } from "@/components/PaidCheckbox";
import { confirmStillOwedAction } from "../actions";

export const metadata = { title: "Bills" };

const TONE: Record<BillStatus, "red" | "gold" | "navy" | "muted" | "green"> = {
  paid: "green",
  late_confirm: "red",
  late: "red",
  due_soon: "gold",
  upcoming: "muted",
  expected: "muted",
  receipt: "muted",
};

export default async function BillsPage() {
  const user = await requireClient();
  const today = todayIso();
  const bills = await db.bill.findMany({
    where: { clientId: user.clientId, kind: { in: ["bill", "expected"] } },
    orderBy: [{ isPaid: "asc" }, { dueDate: "asc" }],
  });
  const owed = bills.filter((b) => !b.isPaid);
  const paid = bills.filter((b) => b.isPaid).reverse();
  const totals = computeBuckets(bills, today);

  const Row = ({ b }: { b: (typeof bills)[number] }) => {
    const status = billStatus(b, today);
    return (
      <tr className="border-b border-line align-middle">
        <td className="py-3 pr-3">
          <PaidCheckbox billId={b.id} paid={b.isPaid} label={b.vendor} />
        </td>
        <td className="py-3 pr-3">
          <div className="font-semibold">{b.vendor}</div>
          <div className="text-xs text-muted sm:hidden">
            {b.category} · due {fmtDay(b.dueDate)}
          </div>
        </td>
        <td className="hidden py-3 pr-3 text-sm text-muted sm:table-cell">
          {b.category}
          {b.kind === "expected" && <span className="block text-xs">expected monthly</span>}
        </td>
        <td className="hidden py-3 pr-3 text-sm text-muted md:table-cell">{b.invoiceNumber ?? "—"}</td>
        <td className="hidden py-3 pr-3 text-sm sm:table-cell">{fmtDay(b.dueDate, { weekday: true })}</td>
        <td className={`py-3 pr-3 text-right font-semibold tabular-nums ${status.startsWith("late") ? "text-late" : ""}`}>
          {usd(b.amountCents)}
        </td>
        <td className="py-3 text-right">
          <div className="flex flex-col items-end gap-1">
            <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>
            {status === "late_confirm" && (
              <form action={confirmStillOwedAction}>
                <input type="hidden" name="billId" value={b.id} />
                <button className="text-[11px] font-semibold text-late underline underline-offset-2">Still owed</button>
              </form>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <h1 className="h1">Bills</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Tick a bill once you've paid it. A late bill shows <strong className="text-late">Late, confirm</strong> until you
        tick it paid or tell us it's still owed.
      </p>

      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-y border-line py-4">
        {[
          ["Owed, next 30 days", totals.total30Cents, ""],
          ["Late", totals.lateCents, "text-late"],
          ["Next 7 days", totals.next7Cents, ""],
          ["Days 8–30", totals.next8to30Cents, ""],
        ].map(([l, c, cls]) => (
          <div key={l as string}>
            <div className={`label ${cls ? "!text-late" : ""}`}>{l as string}</div>
            <div className={`font-serif text-xl ${cls}`}>{usd(c as number)}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left">
          <thead>
            <tr className="border-b border-gold text-[11px] uppercase tracking-wider text-muted">
              <th className="py-2 pr-3 font-bold">Paid</th>
              <th className="py-2 pr-3 font-bold">Vendor</th>
              <th className="hidden py-2 pr-3 font-bold sm:table-cell">Category</th>
              <th className="hidden py-2 pr-3 font-bold md:table-cell">Invoice #</th>
              <th className="hidden py-2 pr-3 font-bold sm:table-cell">Due</th>
              <th className="py-2 pr-3 text-right font-bold">Amount</th>
              <th className="py-2 text-right font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {owed.map((b) => (
              <Row key={b.id} b={b} />
            ))}
            {owed.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-sm text-muted">
                  Nothing owed. Nice.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {paid.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm font-semibold">Paid bills ({paid.length})</summary>
          <table className="mt-2 w-full text-left">
            <tbody>
              {paid.map((b) => (
                <Row key={b.id} b={b} />
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
