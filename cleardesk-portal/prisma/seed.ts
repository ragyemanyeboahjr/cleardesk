/* Seed: demo accounts + Maple Ridge Family Dental, week of Nov 9–13, 2026.
 * Everything here is made up. Run with `npm run seed` (wipes demo data first). */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { promises as fs } from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildDraft } from "../src/lib/agents/summarizer";

const db = new PrismaClient();
const STORAGE = path.resolve(process.cwd(), process.env.STORAGE_DIR || "./storage");
const PASSWORD = "demo1234";
const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
// Seeded timestamps are Dallas time (CST). If the seed runs before the demo
// week's last event has happened in real time, shift everything back so new
// activity always sorts above seeded activity.
const LAST_SEEDED = new Date("2026-11-13T09:00:00-06:00").getTime();
const SHIFT = Math.max(0, LAST_SEEDED - (Date.now() - 10 * 60_000));
const at = (iso: string, hhmm: string) => new Date(new Date(`${iso}T${hhmm}:00-06:00`).getTime() - SHIFT);

type Doc = {
  file: string;
  kind: "bill" | "receipt" | "expected";
  vendor: string;
  category: string;
  invoice?: string;
  cents: number;
  docDate: string;
  due?: string;
  uploadedAt?: Date;
  confidence?: number;
};

// --- Bills still owed (late, next 7 days, 8–30 days) ----------------------
const OWED: Doc[] = [
  { file: "safehaul-oct.pdf", kind: "bill", vendor: "SafeHaul Medical Waste", category: "Medical waste", invoice: "SH-20931", cents: 14500, docDate: "2026-10-23", due: "2026-11-06" },
  { file: "clearview-service.pdf", kind: "bill", vendor: "ClearView Imaging Service", category: "Imaging service", invoice: "CVI-6612", cents: 38000, docDate: "2026-10-27", due: "2026-11-10" },
  { file: "trinity-lab-nov.pdf", kind: "bill", vendor: "Trinity Dental Lab", category: "Lab fees", invoice: "TDL-77102", cents: 114000, docDate: "2026-11-03", due: "2026-11-17" },
  { file: "bright-power-nov.pdf", kind: "bill", vendor: "Bright Power Electric", category: "Utilities", invoice: "BPE-2026-11", cents: 41260, docDate: "2026-11-05", due: "2026-11-20" },
  { file: "lonestar-48011.pdf", kind: "bill", vendor: "Lone Star Dental Supply", category: "Dental supplies", invoice: "LSDS-48011", cents: 48630, docDate: "2026-10-24", due: "2026-11-23" },
  { file: "lonestar-48044.pdf", kind: "bill", vendor: "Lone Star Dental Supply", category: "Dental supplies", invoice: "LSDS-48044", cents: 21275, docDate: "2026-10-25", due: "2026-11-24" },
  { file: "lonestar-48090.pdf", kind: "bill", vendor: "Lone Star Dental Supply", category: "Dental supplies", invoice: "LSDS-48090", cents: 121540, docDate: "2026-10-27", due: "2026-11-26" },
  { file: "", kind: "expected", vendor: "Elm St. Property Group", category: "Rent", cents: 520000, docDate: "2026-11-01", due: "2026-12-01" },
  { file: "metroplex-repair.pdf", kind: "bill", vendor: "Metroplex Dental Repair", category: "Equipment repair", invoice: "MDR-5481", cents: 27500, docDate: "2026-11-03", due: "2026-12-03" },
  { file: "spectrum-dec.pdf", kind: "bill", vendor: "Spectrum Business", category: "Internet & phone", invoice: "SB-1162-11", cents: 18999, docDate: "2026-11-05", due: "2026-12-05" },
];

// --- Paid this week: 11 receipts, $4,481.63 --------------------------------
const PAID: Doc[] = [
  { file: "uptown-linen-1.pdf", kind: "receipt", vendor: "Uptown Uniform & Linen", category: "Uniforms & linen", invoice: "UUL-3304", cents: 16800, docDate: "2026-11-09", uploadedAt: at("2026-11-09", "08:12") },
  { file: "uptown-linen-2.pdf", kind: "receipt", vendor: "Uptown Uniform & Linen", category: "Uniforms & linen", invoice: "UUL-3317", cents: 16800, docDate: "2026-11-11", uploadedAt: at("2026-11-11", "17:40") },
  { file: "chartwell-nov.pdf", kind: "receipt", vendor: "ChartWell Practice Software", category: "Software", invoice: "CW-88120", cents: 24900, docDate: "2026-11-09", uploadedAt: at("2026-11-09", "08:13") },
  { file: "costco-1110.pdf", kind: "receipt", vendor: "Costco Business Center", category: "Breakroom & office", invoice: "R-0391", cents: 9618, docDate: "2026-11-10", uploadedAt: at("2026-11-10", "12:05") },
  { file: "receipt-photo-1112.svg", kind: "receipt", vendor: "Unreadable receipt", category: "Uncategorized", cents: 5840, docDate: "2026-11-12", uploadedAt: at("2026-11-12", "19:22"), confidence: 0.32 },
  { file: "lonestar-paid-47790.pdf", kind: "receipt", vendor: "Lone Star Dental Supply", category: "Dental supplies", invoice: "LSDS-47790", cents: 131285, docDate: "2026-11-10", uploadedAt: at("2026-11-10", "12:06") },
  { file: "trinity-lab-paid-oct.pdf", kind: "receipt", vendor: "Trinity Dental Lab", category: "Lab fees", invoice: "TDL-76988", cents: 146000, docDate: "2026-11-09", uploadedAt: at("2026-11-09", "08:14") },
  { file: "ntx-water.pdf", kind: "receipt", vendor: "North Texas Water Co.", category: "Utilities", invoice: "NTW-55102", cents: 11842, docDate: "2026-11-10", uploadedAt: at("2026-11-10", "12:07") },
  { file: "dfw-office.pdf", kind: "receipt", vendor: "DFW Office Supply", category: "Office supplies", invoice: "DOS-2211", cents: 14268, docDate: "2026-11-11", uploadedAt: at("2026-11-11", "17:41") },
  { file: "shine-bright.pdf", kind: "receipt", vendor: "Shine Bright Cleaning", category: "Cleaning", invoice: "SBC-0907", cents: 27600, docDate: "2026-11-12", uploadedAt: at("2026-11-12", "19:20") },
  { file: "study-club-ce.pdf", kind: "receipt", vendor: "Metro Dental Study Club", category: "Continuing education", invoice: "MDSC-118", cents: 43210, docDate: "2026-11-13", uploadedAt: at("2026-11-13", "07:55") },
];

// --- Older history so the Checker knows each vendor's usual amount -----------
const HISTORY: Doc[] = [
  { file: "", kind: "receipt", vendor: "SafeHaul Medical Waste", category: "Medical waste", cents: 14500, docDate: "2026-10-06" },
  { file: "", kind: "receipt", vendor: "Bright Power Electric", category: "Utilities", cents: 39870, docDate: "2026-10-20" },
  { file: "", kind: "receipt", vendor: "Spectrum Business", category: "Internet & phone", cents: 16999, docDate: "2026-11-02" },
  { file: "", kind: "receipt", vendor: "Metroplex Dental Repair", category: "Equipment repair", cents: 27500, docDate: "2026-09-03" },
  { file: "", kind: "receipt", vendor: "Elm St. Property Group", category: "Rent", cents: 520000, docDate: "2026-11-01" },
  { file: "", kind: "receipt", vendor: "Uptown Uniform & Linen", category: "Uniforms & linen", cents: 16800, docDate: "2026-10-12" },
  { file: "", kind: "receipt", vendor: "Costco Business Center", category: "Breakroom & office", cents: 8840, docDate: "2026-10-21" },
  { file: "", kind: "receipt", vendor: "ChartWell Practice Software", category: "Software", cents: 24900, docDate: "2026-10-09" },
];

const DOUBLE_CHARGE = "Possible double charge: Uptown Uniform & Linen $168.00 appears twice.";
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

async function samplePdf(d: Doc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.12, 0.12, 0.14);
  page.drawText(d.vendor, { x: 56, y: 720, size: 20, font: bold, color: ink });
  page.drawText("Dallas, TX  ·  SAMPLE DOCUMENT FOR DEMO", { x: 56, y: 700, size: 9, font: reg, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(d.kind === "receipt" ? "RECEIPT — PAID" : "INVOICE", { x: 56, y: 650, size: 14, font: bold, color: ink });
  const lines: [string, string][] = [
    ["Bill to", "Maple Ridge Family Dental"],
    [d.kind === "receipt" ? "Receipt #" : "Invoice #", d.invoice ?? "—"],
    ["Date", d.docDate],
    ...(d.due ? ([["Due date", d.due]] as [string, string][]) : []),
    ["Description", d.category],
  ];
  let y = 615;
  for (const [k, v] of lines) {
    page.drawText(k, { x: 56, y, size: 11, font: reg, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(v, { x: 200, y, size: 11, font: reg, color: ink });
    y -= 22;
  }
  page.drawLine({ start: { x: 56, y: y - 6 }, end: { x: 556, y: y - 6 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  page.drawText(d.kind === "receipt" ? "Amount paid" : "Amount due", { x: 56, y: y - 34, size: 13, font: bold, color: ink });
  page.drawText(usd(d.cents), { x: 420, y: y - 34, size: 13, font: bold, color: ink });
  page.drawText("Made-up sample data. Not a real business or invoice.", { x: 56, y: 60, size: 8, font: reg, color: rgb(0.6, 0.6, 0.6) });
  return pdf.save();
}

function blurryReceiptSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="560" viewBox="0 0 360 560">
<defs><filter id="b"><feGaussianBlur stdDeviation="3.2"/></filter></defs>
<rect width="360" height="560" fill="#d9d4c7"/>
<g filter="url(#b)" transform="rotate(-4 180 280)">
<rect x="50" y="40" width="260" height="480" fill="#f7f4ec"/>
<text x="180" y="100" font-family="monospace" font-size="22" text-anchor="middle" fill="#555">S?OR? N?ME</text>
<text x="80" y="170" font-family="monospace" font-size="16" fill="#666">ITEM ......... 12.99</text>
<text x="80" y="200" font-family="monospace" font-size="16" fill="#666">ITEM ......... 31.50</text>
<text x="80" y="230" font-family="monospace" font-size="16" fill="#666">ITEM .......... 9.75</text>
<text x="80" y="300" font-family="monospace" font-size="20" fill="#444">TOTAL   58.40</text>
<text x="80" y="360" font-family="monospace" font-size="14" fill="#777">11/12/26  CARD ****</text>
</g></svg>`;
}

async function writeFile(clientId: string, name: string, bytes: Uint8Array | string) {
  const key = `uploads/${clientId}/seed-${name}`;
  const full = path.join(STORAGE, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
  return { key, size: typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.byteLength };
}

async function main() {
  // Wipe (order matters for relations).
  await db.outboxEmail.deleteMany();
  await db.summaryRow.deleteMany();
  await db.summary.deleteMany();
  await db.agentEvent.deleteMany();
  await db.questionMessage.deleteMany();
  await db.question.deleteMany();
  await db.flag.deleteMany();
  await db.bill.deleteMany();
  await db.agentJob.deleteMany();
  await db.upload.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.client.deleteMany();
  await fs.rm(path.join(STORAGE, "uploads"), { recursive: true, force: true });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const admin = await db.user.create({
    data: { email: "richard@demo.cleardesk", name: "Richard Agyeman-Yeboah Jr.", role: "admin", passwordHash },
  });

  const maple = await db.client.create({
    data: {
      name: "Maple Ridge Family Dental",
      businessType: "dental",
      plan: "ongoing",
      termsAcceptedAt: at("2026-10-01", "10:00"),
      summaryDay: 5,
      summaryTime: "09:00",
      deliveryEmail: "office@mapleridgedental.demo",
      scheduleSetAt: at("2026-10-01", "10:05"),
      createdAt: at("2026-10-01", "10:00"),
    },
  });
  const clientUser = await db.user.create({
    data: {
      email: "office@mapleridgedental.demo",
      name: "Maple Ridge front office",
      role: "client",
      clientId: maple.id,
      passwordHash,
    },
  });

  // Owed bills + this week's receipts, each with an upload, a finished job and
  // agent activity.
  for (const d of [...OWED, ...PAID]) {
    let uploadId: string | null = null;
    if (d.file) {
      const isSvg = d.file.endsWith(".svg");
      const { key, size } = await writeFile(maple.id, d.file, isSvg ? blurryReceiptSvg() : await samplePdf(d));
      const uploadedAt = d.uploadedAt ?? at(d.docDate, "09:30");
      const upload = await db.upload.create({
        data: {
          clientId: maple.id,
          uploadedById: clientUser.id,
          fileName: d.file,
          mimeType: isSvg ? "image/svg+xml" : "application/pdf",
          sizeBytes: size,
          storageKey: key,
          uploadedAt,
          note: isSvg ? "Lunch run? Not sure, sorry it's blurry" : null,
        },
      });
      uploadId = upload.id;
      const unreadable = (d.confidence ?? 1) < 0.6;
      const finished = new Date(uploadedAt.getTime() + 9_000);
      const job = await db.agentJob.create({
        data: {
          uploadId: upload.id,
          clientId: maple.id,
          status: unreadable ? "needs_eyes" : "sorted",
          createdAt: uploadedAt,
          startedAt: new Date(uploadedAt.getTime() + 2_000),
          finishedAt: finished,
        },
      });
      const ev = (agent: string, action: string, detail: string, offset: number) =>
        db.agentEvent.create({
          data: { clientId: maple.id, jobId: job.id, agent, action, detail, createdAt: new Date(uploadedAt.getTime() + offset) },
        });
      await ev("Reader", "read", `Reading ${d.file}`, 2_000);
      if (unreadable) {
        await ev("Sorter", "flagged", `Needs your eyes: ${d.file}. Photo is blurry; total looks like ${usd(d.cents)}.`, 8_000);
      } else {
        await ev(
          "Sorter",
          "sorted",
          `Sorted: ${d.vendor} · ${d.category} · ${usd(d.cents)} · ${d.due ? `due ${d.due}` : "paid"}`,
          6_000,
        );
        if (d.file === "uptown-linen-2.pdf") await ev("Checker", "flagged", DOUBLE_CHARGE, 8_000);
        else await ev("Checker", "checked", `No issues with ${d.vendor}`, 8_000);
      }
    }
    const bill = await db.bill.create({
      data: {
        clientId: maple.id,
        uploadId,
        kind: d.kind,
        vendor: d.vendor,
        category: d.category,
        invoiceNumber: d.invoice ?? null,
        amountCents: d.cents,
        docDate: day(d.docDate),
        dueDate: d.due ? day(d.due) : null,
        isPaid: d.kind === "receipt",
        paidAt: d.kind === "receipt" ? day(d.docDate) : null,
        confidence: d.confidence ?? 0.97,
      },
    });

    if (d.file === "uptown-linen-2.pdf") {
      await db.flag.create({ data: { clientId: maple.id, billId: bill.id, type: "double_charge", message: DOUBLE_CHARGE } });
    }
    if (d.file === "receipt-photo-1112.svg") {
      await db.question.create({
        data: {
          clientId: maple.id,
          uploadId,
          amountCents: d.cents,
          body: "This receipt photo from Nov 12 is too blurry to read the store name. It looks like $58.40. What was it for?",
          createdAt: at("2026-11-12", "19:23"),
        },
      });
    }
  }

  for (const h of HISTORY) {
    await db.bill.create({
      data: {
        clientId: maple.id,
        kind: h.kind,
        vendor: h.vendor,
        category: h.category,
        amountCents: h.cents,
        docDate: day(h.docDate),
        isPaid: true,
        paidAt: day(h.docDate),
      },
    });
  }

  // An earlier question, already answered, so the reply thread has history.
  const q = await db.question.create({
    data: {
      clientId: maple.id,
      body: "Spectrum Business went from $169.99 to $189.99 this month. Should I keep tracking it at the new amount?",
      status: "answered",
      createdAt: at("2026-11-06", "09:00"),
      publishedAt: at("2026-11-06", "09:00"),
    },
  });
  await db.questionMessage.create({
    data: { questionId: q.id, authorId: clientUser.id, body: "Yes, the promo ended. New amount is right.", createdAt: at("2026-11-06", "11:42") },
  });

  // This week's draft, waiting for Richard.
  await buildDraft(maple.id, "2026-11-13", {
    introText:
      "Good morning. Two bills are past due: SafeHaul ($145.00) and ClearView ($380.00). If you've already paid either, tick it and I'll take it off the list. Trinity Dental Lab is the big one this week. I also spotted what looks like a double charge from Uptown Uniform & Linen, and one receipt I couldn't read.",
  });
  // Make the Summarizer's event look like it ran on schedule.
  await db.agentEvent.updateMany({
    where: { clientId: maple.id, agent: "Summarizer" },
    data: { createdAt: at("2026-11-13", "09:00") },
  });

  console.log("Seeded.");
  console.log(`  admin   ${admin.email} / ${PASSWORD}`);
  console.log(`  client  ${clientUser.email} / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
