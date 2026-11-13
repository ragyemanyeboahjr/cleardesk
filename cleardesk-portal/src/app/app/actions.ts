"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireClient } from "@/lib/auth";
import { logEvent } from "@/lib/agents/pipeline";

// Every action re-checks the session and scopes writes to the caller's own
// business, so a client can never touch another client's data.

export async function setPaidAction(billId: string, paid: boolean) {
  const user = await requireClient();
  await db.bill.updateMany({
    where: { id: billId, clientId: user.clientId, kind: { in: ["bill", "expected"] } },
    data: { isPaid: paid, paidAt: paid ? new Date() : null },
  });
  revalidatePath("/app", "layout");
}

export async function confirmStillOwedAction(form: FormData) {
  const user = await requireClient();
  const billId = String(form.get("billId") ?? "");
  await db.bill.updateMany({
    where: { id: billId, clientId: user.clientId, isPaid: false },
    data: { lateConfirmedAt: new Date() },
  });
  revalidatePath("/app", "layout");
}

export async function replyAction(form: FormData) {
  const user = await requireClient();
  const questionId = String(form.get("questionId") ?? "");
  const body = String(form.get("body") ?? "").trim().slice(0, 2000);
  if (!body) return;
  const q = await db.question.findFirst({
    where: { id: questionId, clientId: user.clientId, status: { in: ["open", "answered"] } },
  });
  if (!q) return;
  await db.questionMessage.create({ data: { questionId: q.id, authorId: user.id, body } });
  await db.question.update({ where: { id: q.id }, data: { status: "answered" } });
  await logEvent(user.clientId, "Inbox", "reply", `Client replied: "${body.slice(0, 120)}"`);
  revalidatePath("/app/questions");
}

export async function saveSettingsAction(form: FormData) {
  const user = await requireClient();
  const day = parseInt(String(form.get("summaryDay") ?? "5"), 10);
  const time = String(form.get("summaryTime") ?? "09:00");
  const email = String(form.get("deliveryEmail") ?? "").trim().toLowerCase();
  const plan = String(form.get("plan") ?? "");
  const welcome = form.get("welcome") === "1";

  if (!(day >= 0 && day <= 6) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/app/settings?error=1");
  }
  const current = await db.client.findUniqueOrThrow({ where: { id: user.clientId } });
  await db.client.update({
    where: { id: user.clientId },
    data: {
      summaryDay: day,
      summaryTime: time,
      deliveryEmail: email,
      scheduleSetAt: new Date(),
      ...(plan === "ongoing" && current.plan === "pilot" ? { plan: "ongoing", pilotEndsAt: null } : {}),
    },
  });
  revalidatePath("/app", "layout");
  redirect(welcome ? "/app/uploads?welcome=1" : "/app/settings?saved=1");
}
