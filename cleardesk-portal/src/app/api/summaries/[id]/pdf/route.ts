import { NextResponse } from "next/server";
import { currentUserOrNull } from "@/lib/auth";
import { db } from "@/lib/db";
import { isoDay } from "@/lib/dates";
import { buildSummaryView } from "@/lib/summary-view";
import { renderSummaryPdf } from "@/lib/pdf/summary-pdf";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserOrNull();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const summary = await db.summary.findUnique({ where: { id }, include: { rows: true, client: true } });
  // Clients: only their own, only approved. Admins: anything (draft preview).
  const allowed =
    summary && (user.role === "admin" || (summary.clientId === user.clientId && summary.status === "approved"));
  if (!summary || !allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const billIds = summary.rows.map((r) => r.billId).filter((x): x is string => Boolean(x));
  const paid = await db.bill.findMany({ where: { id: { in: billIds }, isPaid: true }, select: { id: true } });
  const bytes = await renderSummaryPdf({
    businessName: summary.client.name,
    weekStart: summary.weekStart,
    weekEnd: summary.weekEnd,
    introText: summary.introText,
    view: buildSummaryView(summary),
    paidBillIds: new Set(paid.map((p) => p.id)),
    draft: summary.status !== "approved",
  });
  const name = `clear-desk-summary-${isoDay(summary.weekEnd)}${summary.status !== "approved" ? "-draft" : ""}.pdf`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
