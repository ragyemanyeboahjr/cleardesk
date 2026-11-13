import { promises as fs } from "fs";
import path from "path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { fmtDay, fmtRange } from "../dates";
import { usd } from "../money";
import type { SummaryView } from "../summary-view";

// Weekly summary PDF, laid out to match the portal view:
// page 1 — big number, three numbers, quiet line, Pay first, Coming up
// page 2 — Needs your eyes, Worth a second look, Spending this week

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const NAVY = hex("#0f2340");
const GOLD = hex("#c29a3a");
const MUTED = hex("#4a5873");
const LINE = hex("#e3e6ee");
const RED = hex("#a8322d");

const W = 612;
const H = 792;
const M = 56;
const FOOTER = "I never contact your vendors. Not accounting, tax or legal advice.";

type Fonts = { serif: PDFFont; serifBold: PDFFont; sans: PDFFont; sansSemi: PDFFont; sansBold: PDFFont };

async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  pdf.registerFontkit(fontkit);
  const dir = path.join(process.cwd(), "assets", "fonts");
  const load = async (f: string) => pdf.embedFont(await fs.readFile(path.join(dir, f)), { subset: true });
  return {
    serif: await load("Fraunces-Regular.ttf"),
    serifBold: await load("Fraunces-SemiBold.ttf"),
    sans: await load("Manrope-Regular.ttf"),
    sansSemi: await load("Manrope-SemiBold.ttf"),
    sansBold: await load("Manrope-Bold.ttf"),
  };
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t}…`;
}

export type PdfInput = {
  businessName: string;
  weekStart: Date;
  weekEnd: Date;
  introText: string;
  view: SummaryView;
  paidBillIds: Set<string>;
  draft?: boolean;
};

export async function renderSummaryPdf(input: PdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Clear Desk Dallas — ${input.businessName} — week of ${fmtRange(input.weekStart, input.weekEnd)}`);
  pdf.setAuthor("Clear Desk Dallas");
  const f = await loadFonts(pdf);
  const { view } = input;

  const right = (p: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = NAVY) =>
    p.drawText(text, { x: x - font.widthOfTextAtSize(text, size), y, size, font, color });

  const header = (p: PDFPage) => {
    p.drawText("Clear Desk Dallas", { x: M, y: H - 70, size: 20, font: f.serifBold, color: NAVY });
    p.drawText("by Richard Agyeman-Yeboah Jr.", { x: M, y: H - 84, size: 8, font: f.sans, color: MUTED });
    right(p, input.businessName, W - M, H - 64, f.sansSemi, 10);
    right(p, `Week of ${fmtRange(input.weekStart, input.weekEnd)}, ${input.weekEnd.getUTCFullYear()}`, W - M, H - 78, f.sans, 9, MUTED);
    right(p, input.draft ? "DRAFT — awaiting review · Demo – sample data" : "Demo – sample data", W - M, H - 91, f.sans, 7, GOLD);
    p.drawLine({ start: { x: M, y: H - 102 }, end: { x: W - M, y: H - 102 }, thickness: 0.75, color: GOLD });
  };
  const footer = (p: PDFPage, n: number) => {
    p.drawLine({ start: { x: M, y: 58 }, end: { x: W - M, y: 58 }, thickness: 0.5, color: LINE });
    p.drawText(FOOTER, { x: M, y: 42, size: 8, font: f.sans, color: MUTED });
    right(p, `Page ${n} of 2`, W - M, 42, f.sans, 8, MUTED);
  };
  const sectionTitle = (p: PDFPage, title: string, y: number) => {
    p.drawText(title, { x: M, y, size: 14, font: f.serifBold, color: NAVY });
    p.drawLine({ start: { x: M, y: y - 8 }, end: { x: W - M, y: y - 8 }, thickness: 0.5, color: GOLD });
    return y - 26;
  };
  const checkbox = (p: PDFPage, x: number, y: number, checked: boolean) => {
    p.drawRectangle({ x, y: y - 2, width: 10, height: 10, borderColor: NAVY, borderWidth: 0.75 });
    if (checked) {
      p.drawLine({ start: { x: x + 2, y: y + 3 }, end: { x: x + 4.5, y: y }, thickness: 1.2, color: NAVY });
      p.drawLine({ start: { x: x + 4.5, y }, end: { x: x + 8.5, y: y + 7 }, thickness: 1.2, color: NAVY });
    }
  };

  // ---------------- Page 1 ----------------
  const p1 = pdf.addPage([W, H]);
  header(p1);
  let y = H - 140;
  p1.drawText("TOTAL YOU OWE, NEXT 30 DAYS", { x: M, y, size: 8, font: f.sansBold, color: MUTED });
  y -= 44;
  p1.drawText(usd(view.buckets.total30Cents), { x: M, y, size: 44, font: f.serifBold, color: NAVY });
  y -= 40;

  const colW = (W - 2 * M) / 3;
  const three: [string, number, typeof NAVY][] = [
    ["Late", view.buckets.lateCents, RED],
    ["Due next 7 days", view.buckets.next7Cents, NAVY],
    ["Due in 8 to 30 days", view.buckets.next8to30Cents, NAVY],
  ];
  three.forEach(([label, cents, color], i) => {
    const x = M + i * colW;
    if (i > 0) p1.drawLine({ start: { x: x - 10, y: y - 30 }, end: { x: x - 10, y: y + 12 }, thickness: 0.5, color: LINE });
    p1.drawText(label.toUpperCase(), { x, y, size: 7.5, font: f.sansBold, color: i === 0 ? RED : MUTED });
    p1.drawText(usd(cents), { x, y: y - 26, size: 20, font: f.serif, color });
  });
  y -= 56;
  p1.drawText(
    `${view.stats.receiptsSorted} receipts sorted   ·   ${usd(view.stats.spentCents)} spent this week   ·   ${view.stats.hoursSaved} hours saved`,
    { x: M, y, size: 9, font: f.sans, color: MUTED },
  );
  y -= 26;
  for (const line of wrap(input.introText, f.sans, 9.5, W - 2 * M).slice(0, 5)) {
    p1.drawText(line, { x: M, y, size: 9.5, font: f.sans, color: NAVY });
    y -= 13.5;
  }
  y -= 18;

  y = sectionTitle(p1, "Pay first", y);
  view.payFirst.forEach((r, i) => {
    const late = r.bucket === "late";
    p1.drawText(`${i + 1}.`, { x: M, y, size: 10, font: f.sansBold, color: GOLD });
    checkbox(p1, M + 20, y, Boolean(r.billId && input.paidBillIds.has(r.billId)));
    p1.drawText(fit(r.vendor, f.sansSemi, 10, 190), { x: M + 40, y, size: 10, font: f.sansSemi, color: NAVY });
    p1.drawText(fit(r.category, f.sans, 8.5, 90), { x: M + 240, y, size: 8.5, font: f.sans, color: MUTED });
    p1.drawText(late ? `Late, was due ${fmtDay(r.dueDate)}` : `Due ${fmtDay(r.dueDate, { weekday: true })}`, {
      x: M + 340,
      y,
      size: 8.5,
      font: late ? f.sansBold : f.sans,
      color: late ? RED : MUTED,
    });
    right(p1, usd(r.amountCents), W - M, y, f.sansSemi, 10, late ? RED : NAVY);
    p1.drawLine({ start: { x: M, y: y - 8 }, end: { x: W - M, y: y - 8 }, thickness: 0.4, color: LINE });
    y -= 24;
  });
  if (view.payFirst.length === 0) {
    p1.drawText("Nothing late or due in the next 7 days.", { x: M, y, size: 9.5, font: f.sans, color: MUTED });
    y -= 24;
  }
  y -= 14;

  y = sectionTitle(p1, "Coming up", y);
  for (const r of view.comingUp) {
    if (y < 90) break;
    p1.drawText(fmtDay(r.dueDate, { weekday: true }), { x: M, y, size: 9, font: f.sans, color: MUTED });
    p1.drawText(fit(r.vendor, f.sansSemi, 10, 220), { x: M + 80, y, size: 10, font: f.sansSemi, color: NAVY });
    p1.drawText(fit(r.expected ? `${r.category} · expected monthly` : r.category, f.sans, 8.5, 140), {
      x: M + 310,
      y,
      size: 8.5,
      font: f.sans,
      color: MUTED,
    });
    right(p1, usd(r.amountCents), W - M, y, f.sansSemi, 10);
    p1.drawLine({ start: { x: M, y: y - 8 }, end: { x: W - M, y: y - 8 }, thickness: 0.4, color: LINE });
    y -= 22;
  }
  if (view.comingUp.length === 0) p1.drawText("Nothing due in days 8 to 30.", { x: M, y, size: 9.5, font: f.sans, color: MUTED });
  footer(p1, 1);

  // ---------------- Page 2 ----------------
  const p2 = pdf.addPage([W, H]);
  header(p2);
  y = H - 140;
  y = sectionTitle(p2, "Needs your eyes", y);
  if (view.needsEyes.length === 0) {
    p2.drawText("No questions this week.", { x: M, y, size: 9.5, font: f.sans, color: MUTED });
    y -= 20;
  }
  for (const q of view.needsEyes) {
    const lines = wrap(q.body, f.sans, 9.5, W - 2 * M - 90);
    lines.forEach((l, i) => p2.drawText(l, { x: M, y: y - i * 13, size: 9.5, font: f.sans, color: NAVY }));
    if (q.amountCents != null) right(p2, usd(q.amountCents), W - M, y, f.sansSemi, 10);
    y -= lines.length * 13 + 12;
  }
  y -= 18;

  y = sectionTitle(p2, "Worth a second look", y);
  if (view.secondLook.length === 0) {
    p2.drawText("No flagged charges this week.", { x: M, y, size: 9.5, font: f.sans, color: MUTED });
    y -= 20;
  }
  for (const s of view.secondLook) {
    p2.drawText(fit(s.vendor, f.sansSemi, 10, 260), { x: M, y, size: 10, font: f.sansSemi, color: NAVY });
    right(p2, usd(s.amountCents), W - M, y, f.sansSemi, 10);
    p2.drawText(fit(s.message, f.sans, 8.5, W - 2 * M), { x: M, y: y - 13, size: 8.5, font: f.sans, color: MUTED });
    y -= 36;
  }
  y -= 18;

  y = sectionTitle(p2, "Spending this week", y);
  const max = Math.max(1, ...view.stats.spending.map((s) => s.cents));
  for (const s of view.stats.spending) {
    p2.drawText(s.category, { x: M, y, size: 9.5, font: f.sans, color: NAVY });
    p2.drawRectangle({ x: M + 170, y: y - 1, width: Math.max(2, (s.cents / max) * 220), height: 7, color: GOLD });
    right(p2, usd(s.cents), W - M, y, f.sansSemi, 10);
    y -= 22;
  }
  p2.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.4, color: LINE });
  p2.drawText("Total spent", { x: M, y: y - 6, size: 9.5, font: f.sansBold, color: NAVY });
  right(p2, usd(view.stats.spentCents), W - M, y - 6, f.sansBold, 10);
  footer(p2, 2);

  return pdf.save();
}
