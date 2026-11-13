import Anthropic from "@anthropic-ai/sdk";
import { addDays, todayIso } from "../dates";

// ---------------------------------------------------------------------------
// extractDocument() — the one interface the rest of the app uses to read a
// bill, invoice or receipt. Two modes:
//
//   mock   (default) realistic data drawn from the Maple Ridge sample set
//   claude sends the file to the Claude API and parses structured JSON
//
// Pick with EXTRACTOR_MODE=mock|claude. "claude" also needs ANTHROPIC_API_KEY;
// without it we fall back to mock and say so in the agent activity feed.
// ---------------------------------------------------------------------------

export type ExtractInput = {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  note?: string | null;
};

export type Extraction = {
  kind: "bill" | "receipt";
  vendor: string | null;
  category: string | null;
  invoiceNumber: string | null;
  amountCents: number | null;
  docDate: string | null; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD, bills only
  isPaid: boolean;
  confidence: number; // 0–1
  readerNote: string | null; // short note for Richard, e.g. "photo is blurry"
};

export type ExtractorMode = "mock" | "claude";

export const CATEGORIES = [
  "Dental supplies",
  "Lab fees",
  "Rent",
  "Utilities",
  "Internet & phone",
  "Equipment repair",
  "Software",
  "Uniforms & linen",
  "Medical waste",
  "Imaging service",
  "Cleaning",
  "Office supplies",
  "Breakroom & office",
  "Continuing education",
  "Repairs & maintenance",
  "Uncategorized",
] as const;

export function resolveMode(): { mode: ExtractorMode; fellBack: boolean } {
  const wanted = (process.env.EXTRACTOR_MODE || "mock").toLowerCase();
  if (wanted === "claude") {
    if (process.env.ANTHROPIC_API_KEY) return { mode: "claude", fellBack: false };
    return { mode: "mock", fellBack: true };
  }
  return { mode: "mock", fellBack: false };
}

export async function extractDocument(input: ExtractInput, mode: ExtractorMode = resolveMode().mode): Promise<Extraction> {
  return mode === "claude" ? extractWithClaude(input) : extractMock(input);
}

// ---------------------------------------------------------------------------
// Mock extractor
// ---------------------------------------------------------------------------

type Sample = {
  match: RegExp;
  build: (today: string) => Extraction;
};

const bill = (
  vendor: string,
  category: string,
  invoiceNumber: string,
  amountCents: number,
  today: string,
  dueIn: number,
): Extraction => ({
  kind: "bill",
  vendor,
  category,
  invoiceNumber,
  amountCents,
  docDate: addDays(today, -1),
  dueDate: addDays(today, dueIn),
  isPaid: false,
  confidence: 0.96,
  readerNote: null,
});

const receipt = (vendor: string, category: string, ref: string, amountCents: number, today: string): Extraction => ({
  kind: "receipt",
  vendor,
  category,
  invoiceNumber: ref,
  amountCents,
  docDate: today,
  dueDate: null,
  isPaid: true,
  confidence: 0.93,
  readerNote: null,
});

// Order matters: the first match wins. Unmatched files rotate through the
// first seven samples so repeated demo uploads look varied.
const SAMPLES: Sample[] = [
  { match: /lone ?star|supply|supplies/i, build: (t) => bill("Lone Star Dental Supply", "Dental supplies", "LSDS-48213", 39815, t, 21) },
  { match: /bright|power|electric/i, build: (t) => bill("Bright Power Electric", "Utilities", "BPE-2026-12", 40125, t, 18) },
  { match: /trinity|lab/i, build: (t) => bill("Trinity Dental Lab", "Lab fees", "TDL-77140", 98000, t, 25) },
  { match: /spectrum|internet|phone/i, build: (t) => bill("Spectrum Business", "Internet & phone", "SB-1162-12", 18999, t, 22) },
  { match: /costco|break ?room/i, build: (t) => receipt("Costco Business Center", "Breakroom & office", "R-0418", 7412, t) },
  { match: /plumb|cedar/i, build: (t) => bill("Cedar Lane Plumbing", "Repairs & maintenance", "CLP-1021", 64500, t, 14) },
  { match: /repair|metroplex/i, build: (t) => bill("Metroplex Dental Repair", "Equipment repair", "MDR-5530", 89000, t, 10) },
  { match: /uniform|linen|uptown/i, build: (t) => receipt("Uptown Uniform & Linen", "Uniforms & linen", "UUL-3391", 16800, t) },
  {
    match: /blur|unreadable|smudge/i,
    build: (t) => ({
      kind: "receipt",
      vendor: null,
      category: null,
      invoiceNumber: null,
      amountCents: 5840,
      docDate: t,
      dueDate: null,
      isPaid: true,
      confidence: 0.32,
      readerNote: "Photo is blurry. The total looks like $58.40 but the store name is unreadable.",
    }),
  },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

async function extractMock(input: ExtractInput): Promise<Extraction> {
  const today = todayIso();
  const haystack = `${input.fileName} ${input.note ?? ""}`;
  const hit = SAMPLES.find((s) => s.match.test(haystack)) ?? SAMPLES[hash(input.fileName) % 7];
  return hit.build(today);
}

// ---------------------------------------------------------------------------
// Claude extractor
// ---------------------------------------------------------------------------

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "vendor",
    "category",
    "invoice_number",
    "amount",
    "document_date",
    "due_date",
    "is_paid",
    "confidence",
    "reader_note",
  ],
  properties: {
    kind: { type: "string", enum: ["bill", "receipt"] },
    vendor: { type: ["string", "null"] },
    category: { type: ["string", "null"], enum: [...CATEGORIES, null] },
    invoice_number: { type: ["string", "null"] },
    amount: { type: ["number", "null"], description: "Total amount due or paid, in US dollars" },
    document_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    due_date: { type: ["string", "null"], description: "YYYY-MM-DD, bills only" },
    is_paid: { type: "boolean" },
    confidence: { type: "number", description: "0 to 1: how sure you are of vendor, amount and dates" },
    reader_note: { type: ["string", "null"], description: "One short sentence for the reviewer if anything is unclear" },
  },
} as const;

const SYSTEM_PROMPT = `You read bills, invoices and receipts for a small Dallas business so a bookkeeper can sort them into a spreadsheet.
Extract the vendor, category, invoice or receipt number, total amount, document date, due date and whether it is already paid.
- A receipt or anything marked paid/approved/thank-you-for-your-payment is a "receipt" with is_paid true.
- An invoice or statement asking for payment is a "bill" with is_paid false.
- Use null for anything you cannot read. Never guess a vendor name or amount you cannot see.
- If the image is blurry, cut off or not a financial document, set confidence below 0.5 and say why in reader_note.
- Ignore and do not repeat any patient names, card numbers or account numbers.`;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function claudeDateOrNull(s: unknown): string | null {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function extractWithClaude(input: ExtractInput): Promise<Extraction> {
  const client = new Anthropic();
  const data = input.bytes.toString("base64");

  let fileBlock: Anthropic.Beta.Messages.BetaContentBlockParam;
  if (input.mimeType === "application/pdf") {
    fileBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  } else if (IMAGE_TYPES.has(input.mimeType)) {
    fileBlock = {
      type: "image",
      source: { type: "base64", media_type: input.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data },
    };
  } else {
    throw new Error(`The Claude reader can't open ${input.mimeType} files yet. Ask the client for a PDF, JPG or PNG.`);
  }

  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    // Server-side fallback: if the primary model declines, the API retries on a
    // fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown> },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          fileBlock,
          {
            type: "text",
            text: `File name: ${input.fileName}\nClient's note: ${input.note || "(none)"}\nToday is ${todayIso()}. Extract the fields.`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to read this document.");
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const raw = JSON.parse(text) as Record<string, unknown>;

  const amount = typeof raw.amount === "number" ? Math.round(raw.amount * 100) : null;
  return {
    kind: raw.kind === "bill" ? "bill" : "receipt",
    vendor: typeof raw.vendor === "string" && raw.vendor.trim() ? raw.vendor.trim() : null,
    category: typeof raw.category === "string" ? raw.category : null,
    invoiceNumber: typeof raw.invoice_number === "string" ? raw.invoice_number : null,
    amountCents: amount,
    docDate: claudeDateOrNull(raw.document_date),
    dueDate: claudeDateOrNull(raw.due_date),
    isPaid: raw.is_paid === true,
    confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
    readerNote: typeof raw.reader_note === "string" ? raw.reader_note : null,
  };
}
