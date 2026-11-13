import type { Summary, SummaryRow } from "@prisma/client";
import { bucketOf, computeBuckets, type Buckets } from "./buckets";
import { isoDay } from "./dates";
import type { NeedsEyes, SecondLook, SummaryStats } from "./agents/summarizer";

export type ViewRow = SummaryRow & { bucket: "late" | "next7" | "next8to30" | "later" };

export type SummaryView = {
  asOfIso: string;
  buckets: Buckets;
  payFirst: ViewRow[];
  comingUp: ViewRow[];
  stats: SummaryStats;
  secondLook: SecondLook[];
  needsEyes: NeedsEyes[];
};

/**
 * Turns a stored summary + its (possibly edited) rows into the weekly layout.
 * Sections are derived from each row's due date, so if Richard edits a date
 * the row moves to the right section automatically.
 */
export function buildSummaryView(summary: Summary & { rows: SummaryRow[] }): SummaryView {
  const asOfIso = isoDay(summary.asOf);
  const rows: ViewRow[] = [...summary.rows]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.position - b.position)
    .map((r) => ({ ...r, bucket: bucketOf(r.dueDate, asOfIso) }));
  return {
    asOfIso,
    buckets: computeBuckets(
      rows.map((r) => ({ amountCents: r.amountCents, dueDate: r.dueDate, isPaid: false })),
      asOfIso,
    ),
    payFirst: rows.filter((r) => r.bucket === "late" || r.bucket === "next7"),
    comingUp: rows.filter((r) => r.bucket === "next8to30"),
    stats: JSON.parse(summary.statsJson) as SummaryStats,
    secondLook: JSON.parse(summary.secondLookJson) as SecondLook[],
    needsEyes: JSON.parse(summary.needsEyesJson) as NeedsEyes[],
  };
}
