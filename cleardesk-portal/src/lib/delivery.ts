import { db } from "./db";
import { fmtDay, fmtRange } from "./dates";
import { usd } from "./money";
import { buildSummaryView } from "./summary-view";
import { logEvent } from "./agents/pipeline";

// Approval + delivery. The demo never sends email: each delivery is written to
// the OutboxEmail table. A real provider (Postmark, SES, Resend…) would read
// "logged" rows from there and send them.

export async function approveSummary(summaryId: string, adminId: string) {
  const summary = await db.summary.findUniqueOrThrow({
    where: { id: summaryId },
    include: { rows: true, client: true },
  });
  if (summary.status === "approved") return summary;

  const view = buildSummaryView(summary);
  const range = fmtRange(summary.weekStart, summary.weekEnd);

  await db.$transaction(async (tx) => {
    // Richard's row edits become the client's bill record.
    for (const r of summary.rows) {
      if (!r.billId) continue;
      await tx.bill.updateMany({
        where: { id: r.billId, clientId: summary.clientId },
        data: {
          vendor: r.vendor,
          category: r.category,
          invoiceNumber: r.invoiceNumber,
          amountCents: r.amountCents,
          dueDate: r.dueDate,
        },
      });
    }
    // Questions the agent drafted go out with the approved summary.
    await tx.question.updateMany({
      where: { clientId: summary.clientId, status: "draft" },
      data: { status: "open", publishedAt: new Date() },
    });
    await tx.summary.update({
      where: { id: summary.id },
      data: { status: "approved", approvedAt: new Date(), approvedById: adminId, reviewNote: null },
    });

    const lines = [
      "Clear Desk Dallas",
      "by Richard Agyeman-Yeboah Jr.",
      "",
      `Your weekly summary for ${range} is ready.`,
      "",
      `Total you owe, next 30 days: ${usd(view.buckets.total30Cents)}`,
      `Late: ${usd(view.buckets.lateCents)}   Due next 7 days: ${usd(view.buckets.next7Cents)}   Due in 8 to 30 days: ${usd(view.buckets.next8to30Cents)}`,
      "",
      "Pay first:",
      ...view.payFirst.map(
        (r, i) => `  ${i + 1}. ${r.vendor} — ${usd(r.amountCents)} — ${r.bucket === "late" ? "LATE, was due" : "due"} ${fmtDay(r.dueDate)}`,
      ),
      "",
      summary.introText,
      "",
      "Open it in your portal to tick bills paid or download the PDF.",
      "",
      "I never contact your vendors. Not accounting, tax or legal advice.",
    ];
    await tx.outboxEmail.create({
      data: {
        clientId: summary.clientId,
        summaryId: summary.id,
        to: summary.client.deliveryEmail,
        subject: `Your Clear Desk summary — week of ${range}`,
        body: lines.join("\n"),
      },
    });
  });

  await logEvent(summary.clientId, "Summarizer", "approved", `Richard approved the summary for ${range}.`);
  await logEvent(
    summary.clientId,
    "Delivery",
    "logged",
    `Summary email for ${range} logged to outbox for ${summary.client.deliveryEmail} (demo: not sent).`,
  );
}

export async function sendBackSummary(summaryId: string, note: string) {
  const s = await db.summary.update({
    where: { id: summaryId },
    data: { status: "sent_back", reviewNote: note },
  });
  await logEvent(s.clientId, "Summarizer", "sent_back", `Sent back by Richard: "${note}"`);
}
