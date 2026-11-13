import { db } from "../db";
import { readFile } from "../storage";
import { dayFromIso, todayIso } from "../dates";
import { usd } from "../money";
import { extractDocument, resolveMode, type Extraction } from "./extract";
import { checkDocument } from "./checker";

// Upload -> AgentJob lifecycle:  queued -> reading -> sorted | needs_eyes
// Each step writes to AgentEvent, which drives the admin "Agent activity" feed.

const stepMs = () => Math.max(0, Number(process.env.AGENT_STEP_SECONDS ?? 2)) * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function logEvent(clientId: string, agent: string, action: string, detail: string, jobId?: string) {
  await db.agentEvent.create({ data: { clientId, agent, action, detail, jobId } });
}

// Shared across Next.js module instances in the same process.
const g = globalThis as unknown as { __cdRunningJobs?: Set<string> };
const running = (g.__cdRunningJobs ??= new Set<string>());

export async function processJob(jobId: string): Promise<void> {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    await runJob(jobId);
  } finally {
    running.delete(jobId);
  }
}

function needsEyes(x: Extraction): boolean {
  return x.confidence < 0.6 || !x.vendor || x.amountCents == null;
}

async function runJob(jobId: string) {
  const job = await db.agentJob.findUnique({ where: { id: jobId }, include: { upload: true } });
  if (!job || job.status === "sorted" || job.status === "needs_eyes") return;
  const { upload, clientId } = job;
  const { mode, fellBack } = resolveMode();

  await sleep(stepMs() / 2);
  await db.agentJob.update({ where: { id: jobId }, data: { status: "reading", startedAt: new Date(), mode } });
  await logEvent(clientId, "Reader", "read", `Reading ${upload.fileName}${mode === "claude" ? " with Claude" : ""}`, jobId);
  if (fellBack) {
    await logEvent(clientId, "Reader", "error", "EXTRACTOR_MODE=claude but ANTHROPIC_API_KEY is not set. Using mock data.", jobId);
  }
  await sleep(stepMs());

  let x: Extraction;
  try {
    const bytes = await readFile(upload.storageKey);
    x = await extractDocument({ bytes, mimeType: upload.mimeType, fileName: upload.fileName, note: upload.note }, mode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.question.create({
      data: {
        clientId,
        uploadId: upload.id,
        body: `We couldn't read "${upload.fileName}". Could you send a clearer copy or tell us what it was for?`,
      },
    });
    await db.agentJob.update({
      where: { id: jobId },
      data: { status: "needs_eyes", error: message, finishedAt: new Date() },
    });
    await logEvent(clientId, "Reader", "error", `Couldn't read ${upload.fileName}: ${message}`, jobId);
    return;
  }

  const today = todayIso();
  const unreadable = needsEyes(x);
  const kind = x.kind === "bill" && !x.isPaid ? "bill" : "receipt";

  const bill = await db.bill.create({
    data: {
      clientId,
      uploadId: upload.id,
      kind,
      vendor: x.vendor ?? "Unreadable receipt",
      category: x.category ?? "Uncategorized",
      invoiceNumber: x.invoiceNumber,
      amountCents: x.amountCents ?? 0,
      docDate: dayFromIso(x.docDate ?? today),
      dueDate: kind === "bill" && x.dueDate ? dayFromIso(x.dueDate) : null,
      isPaid: kind === "receipt",
      paidAt: kind === "receipt" ? dayFromIso(x.docDate ?? today) : null,
      confidence: x.confidence,
    },
  });

  const summaryBits = [
    bill.vendor,
    bill.category,
    x.amountCents != null ? usd(x.amountCents) : "amount unknown",
    kind === "bill" && x.dueDate ? `due ${x.dueDate}` : "paid",
  ];

  if (unreadable) {
    await db.question.create({
      data: {
        clientId,
        uploadId: upload.id,
        amountCents: x.amountCents,
        body:
          x.readerNote && x.amountCents != null
            ? `This receipt is hard to read (${x.readerNote.replace(/\.$/, "")}). It looks like ${usd(x.amountCents)}. What was it for?`
            : `We couldn't make out "${upload.fileName}". What was it for, and how much was it?`,
      },
    });
    await db.agentJob.update({ where: { id: jobId }, data: { status: "needs_eyes", finishedAt: new Date() } });
    await logEvent(clientId, "Sorter", "flagged", `Needs your eyes: ${upload.fileName}. ${x.readerNote ?? "Low confidence."}`, jobId);
    return;
  }

  await logEvent(clientId, "Sorter", "sorted", `Sorted: ${summaryBits.join(" · ")}`, jobId);

  const history = await db.bill.findMany({
    where: { clientId, id: { not: bill.id }, vendor: { not: "Unreadable receipt" } },
    select: { id: true, vendor: true, amountCents: true, invoiceNumber: true, docDate: true, dueDate: true },
  });
  const flags = checkDocument(bill, history);
  for (const f of flags) {
    await db.flag.create({ data: { clientId, billId: bill.id, type: f.type, message: f.message } });
    await logEvent(clientId, "Checker", "flagged", f.message, jobId);
  }
  if (flags.length === 0) await logEvent(clientId, "Checker", "checked", `No issues with ${bill.vendor}`, jobId);

  await db.agentJob.update({ where: { id: jobId }, data: { status: "sorted", finishedAt: new Date() } });
}

/** Re-run jobs that were interrupted (e.g. the dev server restarted). */
export async function resumeStuckJobs(clientId?: string) {
  const cutoff = new Date(Date.now() - 30_000);
  const stuck = await db.agentJob.findMany({
    where: { status: { in: ["queued", "reading"] }, createdAt: { lt: cutoff }, ...(clientId ? { clientId } : {}) },
    select: { id: true },
  });
  for (const j of stuck) {
    if (!running.has(j.id)) {
      await db.agentJob.update({ where: { id: j.id }, data: { status: "queued" } });
      void processJob(j.id);
    }
  }
}
