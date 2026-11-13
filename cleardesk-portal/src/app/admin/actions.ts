"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dayFromIso, isoDay, todayIso } from "@/lib/dates";
import { parseUsd } from "@/lib/money";
import { buildDraft } from "@/lib/agents/summarizer";
import { approveSummary, sendBackSummary } from "@/lib/delivery";
import { runDueSummaries } from "@/lib/scheduler";
import { logEvent } from "@/lib/agents/pipeline";

// Every admin action calls requireAdmin() itself. Server actions are public
// HTTP endpoints, so the page-level check alone would not be enough.

async function editableSummary(summaryId: string) {
  const s = await db.summary.findUnique({ where: { id: summaryId } });
  if (!s || s.status === "approved") throw new Error("This summary is already approved and can't be edited.");
  return s;
}

export async function updateRowAction(form: FormData) {
  await requireAdmin();
  const rowId = String(form.get("rowId") ?? "");
  const row = await db.summaryRow.findUnique({ where: { id: rowId } });
  if (!row) return; // row was replaced by a rebuild; the page refresh shows the new rows
  await editableSummary(row.summaryId);
  const amount = parseUsd(String(form.get("amount") ?? ""));
  const due = String(form.get("dueDate") ?? "");
  await db.summaryRow.update({
    where: { id: rowId },
    data: {
      vendor: String(form.get("vendor") ?? row.vendor).trim() || row.vendor,
      category: String(form.get("category") ?? row.category).trim() || row.category,
      invoiceNumber: String(form.get("invoiceNumber") ?? "").trim() || null,
      amountCents: amount ?? row.amountCents,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? dayFromIso(due) : row.dueDate,
    },
  });
  revalidatePath(`/admin/review/${row.summaryId}`);
}

export async function deleteRowAction(form: FormData) {
  await requireAdmin();
  const rowId = String(form.get("rowId") ?? "");
  const row = await db.summaryRow.findUnique({ where: { id: rowId } });
  if (!row) return;
  await editableSummary(row.summaryId);
  await db.summaryRow.delete({ where: { id: rowId } });
  revalidatePath(`/admin/review/${row.summaryId}`);
}

export async function updateIntroAction(form: FormData) {
  await requireAdmin();
  const summaryId = String(form.get("summaryId") ?? "");
  await editableSummary(summaryId);
  const introText = String(form.get("introText") ?? "").trim().slice(0, 2000);
  await db.summary.update({ where: { id: summaryId }, data: { introText } });
  revalidatePath(`/admin/review/${summaryId}`);
}

export async function approveAction(form: FormData) {
  const admin = await requireAdmin();
  const summaryId = String(form.get("summaryId") ?? "");
  await editableSummary(summaryId);
  await approveSummary(summaryId, admin.id);
  revalidatePath("/admin", "layout");
  redirect(`/admin?approved=${summaryId}`);
}

export async function sendBackAction(form: FormData) {
  await requireAdmin();
  const summaryId = String(form.get("summaryId") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  await editableSummary(summaryId);
  if (!note) redirect(`/admin/review/${summaryId}?needNote=1`);
  await sendBackSummary(summaryId, note);
  revalidatePath("/admin", "layout");
  redirect(`/admin/review/${summaryId}`);
}

export async function rebuildAction(form: FormData) {
  await requireAdmin();
  const summaryId = String(form.get("summaryId") ?? "");
  const s = await editableSummary(summaryId);
  const rebuilt = await buildDraft(s.clientId, isoDay(s.asOf), { introText: s.introText });
  if (s.reviewNote) await db.summary.update({ where: { id: rebuilt.id }, data: { reviewNote: s.reviewNote } });
  revalidatePath(`/admin/review/${summaryId}`);
}

export async function runSchedulerAction() {
  await requireAdmin();
  const n = await runDueSummaries();
  revalidatePath("/admin", "layout");
  redirect(`/admin?scheduled=${n}`);
}

export async function draftNowAction(form: FormData) {
  await requireAdmin();
  const clientId = String(form.get("clientId") ?? "");
  const existing = await db.summary.findFirst({ where: { clientId, asOf: dayFromIso(todayIso()) } });
  if (existing?.status === "approved") redirect(`/admin/clients?already=${clientId}`);
  const s = await buildDraft(clientId, todayIso(), existing ? { introText: existing.introText } : {});
  revalidatePath("/admin", "layout");
  redirect(`/admin/review/${s.id}`);
}

export async function adminReplyAction(form: FormData) {
  const admin = await requireAdmin();
  const questionId = String(form.get("questionId") ?? "");
  const back = String(form.get("back") ?? "/admin");
  const body = String(form.get("body") ?? "").trim().slice(0, 2000);
  const q = await db.question.findUnique({ where: { id: questionId } });
  if (!q || !body) return;
  await db.questionMessage.create({ data: { questionId, authorId: admin.id, body } });
  await db.question.update({ where: { id: questionId }, data: { status: q.status === "draft" ? "draft" : "open" } });
  await logEvent(q.clientId, "Inbox", "reply", `Richard replied: "${body.slice(0, 120)}"`);
  revalidatePath(back);
}

export async function resolveQuestionAction(form: FormData) {
  await requireAdmin();
  const questionId = String(form.get("questionId") ?? "");
  const back = String(form.get("back") ?? "/admin");
  await db.question.update({ where: { id: questionId }, data: { status: "resolved" } });
  revalidatePath(back);
}
