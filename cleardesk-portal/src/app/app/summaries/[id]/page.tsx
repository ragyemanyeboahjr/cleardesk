import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildSummaryView } from "@/lib/summary-view";
import { SummaryDocument } from "@/components/SummaryDocument";

export const metadata = { title: "Summary" };

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const summary = await db.summary.findFirst({
    where: { id, clientId: user.clientId, status: "approved" },
    include: { rows: true, client: true },
  });
  if (!summary) notFound();
  const billIds = summary.rows.map((r) => r.billId).filter((x): x is string => Boolean(x));
  const paid = await db.bill.findMany({ where: { id: { in: billIds }, isPaid: true }, select: { id: true } });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/summaries" className="text-sm font-semibold text-muted hover:text-navy">
          ← All summaries
        </Link>
        <a href={`/api/summaries/${summary.id}/pdf`} className="btn-quiet">
          Download PDF
        </a>
      </div>
      <SummaryDocument
        businessName={summary.client.name}
        weekStart={summary.weekStart}
        weekEnd={summary.weekEnd}
        introText={summary.introText}
        view={buildSummaryView(summary)}
        paidBillIds={new Set(paid.map((p) => p.id))}
        interactive
      />
    </div>
  );
}
