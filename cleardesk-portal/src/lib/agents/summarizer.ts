import { db } from "../db";
import { addDays, dayFromIso, daysBetween, fmtRange, isoDay, weekday } from "../dates";
import { usd } from "../money";
import { bucketOf } from "../buckets";
import { logEvent } from "./pipeline";

export type SummaryStats = {
  receiptsSorted: number;
  spentCents: number;
  hoursSaved: number;
  spending: { category: string; cents: number }[]; // top 5 + "Everything else"
};
export type SecondLook = { vendor: string; amountCents: number; date: string | null; message: string };
export type NeedsEyes = { questionId: string; body: string; amountCents: number | null };

/** Monday-to-run-day window. A Monday run covers the previous week. */
export function weekWindow(asOfIso: string): { startIso: string; endIso: string } {
  const wd = weekday(asOfIso); // 0 Sun … 6 Sat
  let back = (wd + 6) % 7; // days since Monday
  if (back === 0) back = 7;
  return { startIso: addDays(asOfIso, -back), endIso: asOfIso };
}

/** Each receipt saves ~24 minutes of sorting and entry, rounded to the half hour. */
export function hoursSavedFor(docs: number): number {
  return Math.round(docs * 0.4 * 2) / 2;
}

export function topSpending(receipts: { category: string; amountCents: number }[]) {
  const byCat = new Map<string, number>();
  for (const r of receipts) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amountCents);
  const sorted = [...byCat.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((s, x) => s + x.cents, 0);
  if (rest > 0) top.push({ category: "Everything else", cents: rest });
  return top;
}

/**
 * The Summarizer agent: builds the week's draft summary and spreadsheet for a
 * client. The draft waits for Richard; nothing reaches the client until he
 * approves it. Rebuilding replaces an unapproved draft for the same day.
 */
export async function buildDraft(clientId: string, asOfIso: string, opts: { introText?: string } = {}) {
  const client = await db.client.findUniqueOrThrow({ where: { id: clientId } });
  const asOf = dayFromIso(asOfIso);
  const existing = await db.summary.findFirst({ where: { clientId, asOf } });
  if (existing?.status === "approved") return existing;

  const { startIso, endIso } = weekWindow(asOfIso);
  const horizon = dayFromIso(addDays(asOfIso, 30));

  const owed = await db.bill.findMany({
    where: { clientId, isPaid: false, kind: { in: ["bill", "expected"] }, dueDate: { not: null, lte: horizon } },
    orderBy: { dueDate: "asc" },
  });
  const receipts = await db.bill.findMany({
    where: { clientId, kind: "receipt", docDate: { gte: dayFromIso(startIso), lte: dayFromIso(endIso) } },
    include: { flags: true },
  });
  const weekFlags = await db.flag.findMany({
    where: {
      clientId,
      type: { in: ["double_charge", "over_usual", "new_vendor"] },
      bill: { docDate: { gte: dayFromIso(startIso), lte: dayFromIso(endIso) } },
    },
    include: { bill: true },
    orderBy: { createdAt: "asc" },
  });
  const questions = await db.question.findMany({
    where: { clientId, status: { in: ["draft", "open"] } },
    orderBy: { createdAt: "asc" },
  });

  const spentCents = receipts.reduce((s, r) => s + r.amountCents, 0);
  const stats: SummaryStats = {
    receiptsSorted: receipts.length,
    spentCents,
    hoursSaved: hoursSavedFor(receipts.length),
    spending: topSpending(receipts),
  };
  // One entry per flagged charge (a double charge flags the second copy only).
  const secondLook: SecondLook[] = weekFlags.map((f) => ({
    vendor: f.bill?.vendor ?? "",
    amountCents: f.bill?.amountCents ?? 0,
    date: f.bill?.docDate ? isoDay(f.bill.docDate) : null,
    message: f.message,
  }));
  const needsEyes: NeedsEyes[] = questions.map((q) => ({ questionId: q.id, body: q.body, amountCents: q.amountCents }));

  const late = owed.filter((b) => b.dueDate && bucketOf(b.dueDate, asOfIso) === "late");
  const soon = owed.filter((b) => b.dueDate && bucketOf(b.dueDate, asOfIso) === "next7");
  const introText =
    opts.introText ??
    defaultIntro({
      business: client.name,
      lateCount: late.length,
      lateCents: late.reduce((s, b) => s + b.amountCents, 0),
      soonCount: soon.length,
      receipts: receipts.length,
      questions: questions.length,
      flagged: secondLook.length,
    });

  const data = {
    clientId,
    weekStart: dayFromIso(startIso),
    weekEnd: dayFromIso(endIso),
    asOf,
    status: "awaiting_review",
    introText,
    statsJson: JSON.stringify(stats),
    secondLookJson: JSON.stringify(secondLook),
    needsEyesJson: JSON.stringify(needsEyes),
  };
  const rows = owed.map((b, i) => ({
    billId: b.id,
    vendor: b.vendor,
    category: b.category,
    invoiceNumber: b.invoiceNumber,
    amountCents: b.amountCents,
    dueDate: b.dueDate!,
    expected: b.kind === "expected",
    position: i,
  }));

  const summary = await db.$transaction(async (tx) => {
    if (existing) {
      await tx.summaryRow.deleteMany({ where: { summaryId: existing.id } });
      return tx.summary.update({ where: { id: existing.id }, data: { ...data, rows: { create: rows } } });
    }
    return tx.summary.create({ data: { ...data, rows: { create: rows } } });
  });

  await logEvent(
    clientId,
    "Summarizer",
    "drafted",
    `${existing ? "Rebuilt" : "Drafted"} summary for ${fmtRange(data.weekStart, data.weekEnd)}: ${rows.length} bills, ${usd(spentCents)} spent. Awaiting Richard's review.`,
  );
  return summary;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function defaultIntro(x: {
  business: string;
  lateCount: number;
  lateCents: number;
  soonCount: number;
  receipts: number;
  questions: number;
  flagged: number;
}): string {
  const parts: string[] = [];
  if (x.lateCount > 0) {
    parts.push(
      `${plural(x.lateCount, "bill is", "bills are")} past due (${usd(x.lateCents)}). If you've already paid, tick it and I'll take it off the list.`,
    );
  }
  if (x.soonCount > 0) parts.push(`${plural(x.soonCount, "more bill is", "more bills are")} due in the next 7 days.`);
  if (x.flagged > 0) parts.push(`I flagged ${plural(x.flagged, "charge", "charges")} worth a second look on page 2.`);
  if (x.questions > 0) parts.push(`I have ${plural(x.questions, "question", "questions")} for you.`);
  if (parts.length === 0) parts.push("Nothing urgent this week.");
  return `Here's your week. ${parts.join(" ")}`;
}

export { daysBetween };
