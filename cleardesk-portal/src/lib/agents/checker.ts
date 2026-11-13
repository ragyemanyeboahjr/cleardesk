import type { Bill } from "@prisma/client";
import { usd } from "../money";
import { daysBetween, isoDay } from "../dates";

export type FlagDraft = { type: "double_charge" | "over_usual" | "new_vendor"; message: string };

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The Checker agent. Compares a newly sorted document with the client's
 * history and returns anything worth a second look:
 *  - possible double charge: same vendor and amount within 14 days, or the
 *    same invoice number seen before
 *  - over 2x the vendor's usual (median) amount
 *  - a vendor we have never seen for this client
 */
export function checkDocument(
  doc: Pick<Bill, "vendor" | "amountCents" | "invoiceNumber" | "docDate" | "dueDate">,
  history: Pick<Bill, "id" | "vendor" | "amountCents" | "invoiceNumber" | "docDate" | "dueDate">[],
): FlagDraft[] {
  const flags: FlagDraft[] = [];
  const sameVendor = history.filter((h) => norm(h.vendor) === norm(doc.vendor));

  if (sameVendor.length === 0) {
    flags.push({ type: "new_vendor", message: `New vendor: ${doc.vendor}. First document we've seen from them.` });
    return flags;
  }

  const docDay = isoDay(doc.docDate ?? doc.dueDate ?? new Date());
  const dupe = sameVendor.find((h) => {
    if (doc.invoiceNumber && h.invoiceNumber && h.invoiceNumber === doc.invoiceNumber) return true;
    const hDay = isoDay(h.docDate ?? h.dueDate ?? new Date());
    return h.amountCents === doc.amountCents && Math.abs(daysBetween(hDay, docDay)) <= 14;
  });
  if (dupe) {
    flags.push({
      type: "double_charge",
      message: `Possible double charge: ${doc.vendor} ${usd(doc.amountCents)} appears twice.`,
    });
  }

  const usual = median(sameVendor.map((h) => h.amountCents));
  if (usual > 0 && doc.amountCents > usual * 2) {
    flags.push({
      type: "over_usual",
      message: `${doc.vendor} charged ${usd(doc.amountCents)}, more than 2x their usual ${usd(usual)}.`,
    });
  }
  return flags;
}
