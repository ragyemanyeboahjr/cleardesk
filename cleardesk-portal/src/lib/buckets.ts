import { daysBetween, isoDay } from "./dates";

export type DueItem = { amountCents: number; dueDate: Date | null; isPaid: boolean };

export type Buckets = {
  lateCents: number;
  next7Cents: number;
  next8to30Cents: number;
  total30Cents: number;
};

/** Which bucket an unpaid bill falls in, relative to `todayIso`. */
export function bucketOf(dueDate: Date, todayIso: string): "late" | "next7" | "next8to30" | "later" {
  const d = daysBetween(todayIso, isoDay(dueDate));
  if (d < 0) return "late";
  if (d <= 7) return "next7";
  if (d <= 30) return "next8to30";
  return "later";
}

export function computeBuckets(items: DueItem[], todayIso: string): Buckets {
  const b: Buckets = { lateCents: 0, next7Cents: 0, next8to30Cents: 0, total30Cents: 0 };
  for (const it of items) {
    if (it.isPaid || !it.dueDate) continue;
    const k = bucketOf(it.dueDate, todayIso);
    if (k === "late") b.lateCents += it.amountCents;
    else if (k === "next7") b.next7Cents += it.amountCents;
    else if (k === "next8to30") b.next8to30Cents += it.amountCents;
  }
  b.total30Cents = b.lateCents + b.next7Cents + b.next8to30Cents;
  return b;
}

export type BillStatus = "paid" | "late_confirm" | "late" | "due_soon" | "upcoming" | "expected" | "receipt";

export function billStatus(
  bill: { kind: string; isPaid: boolean; dueDate: Date | null; lateConfirmedAt: Date | null },
  todayIso: string,
): BillStatus {
  if (bill.kind === "receipt") return "receipt";
  if (bill.isPaid) return "paid";
  if (bill.dueDate) {
    const k = bucketOf(bill.dueDate, todayIso);
    if (k === "late") return bill.lateConfirmedAt ? "late" : "late_confirm";
    if (k === "next7") return "due_soon";
  }
  return bill.kind === "expected" ? "expected" : "upcoming";
}

export const STATUS_LABEL: Record<BillStatus, string> = {
  paid: "Paid",
  late_confirm: "Late, confirm",
  late: "Late",
  due_soon: "Due this week",
  upcoming: "Upcoming",
  expected: "Expected",
  receipt: "Receipt",
};
