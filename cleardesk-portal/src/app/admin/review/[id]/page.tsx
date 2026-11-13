import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDay, fmtRange, fmtTimestamp, isoDay } from "@/lib/dates";
import { usd } from "@/lib/money";
import { buildSummaryView } from "@/lib/summary-view";
import { Badge, JOB_BADGE, STATUS_BADGE } from "@/components/Badge";
import { SummaryDocument } from "@/components/SummaryDocument";
import {
  adminReplyAction,
  approveAction,
  deleteRowAction,
  rebuildAction,
  resolveQuestionAction,
  sendBackAction,
  updateIntroAction,
  updateRowAction,
} from "../../actions";

export const metadata = { title: "Review draft" };

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ file?: string; needNote?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const summary = await db.summary.findUnique({ where: { id }, include: { rows: true, client: true } });
  if (!summary) notFound();

  const view = buildSummaryView(summary);
  const editable = summary.status !== "approved";
  const back = `/admin/review/${summary.id}`;

  // Source files: everything uploaded during the summary week, plus the
  // documents behind each row.
  const rowBillIds = summary.rows.map((r) => r.billId).filter((x): x is string => Boolean(x));
  const uploads = await db.upload.findMany({
    where: {
      clientId: summary.clientId,
      OR: [
        { uploadedAt: { gte: new Date(summary.weekStart.getTime() - 12 * 3600_000) } },
        { bills: { some: { id: { in: rowBillIds } } } },
      ],
    },
    orderBy: { uploadedAt: "desc" },
    include: { jobs: { take: 1, orderBy: { createdAt: "desc" } }, bills: { take: 1, include: { flags: true } } },
  });
  const selected = uploads.find((u) => u.id === sp.file) ?? uploads[0];
  const rowUpload = new Map<string, string>();
  for (const u of uploads) for (const b of u.bills) rowUpload.set(b.id, u.id);

  const questions = await db.question.findMany({
    where: { clientId: summary.clientId, status: { in: ["draft", "open", "answered"] } },
    orderBy: { createdAt: "asc" },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { author: true } } },
  });
  const paid = await db.bill.findMany({ where: { id: { in: rowBillIds }, isPaid: true }, select: { id: true } });
  const badge = STATUS_BADGE[summary.status];

  return (
    <div>
      <Link href="/admin" className="text-sm font-semibold text-muted hover:text-navy">
        ← Review queue
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="h1">{summary.client.name}</h1>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">
        Week of {fmtRange(summary.weekStart, summary.weekEnd)}, {summary.weekEnd.getUTCFullYear()} · as of {fmtDay(summary.asOf, { weekday: true })} ·
        delivers to {summary.client.deliveryEmail}
      </p>
      {summary.reviewNote && (
        <p className="mt-3 rounded-md border border-late/30 bg-late/5 px-4 py-2 text-sm text-late">Sent back: “{summary.reviewNote}”</p>
      )}

      <div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ---------------- Left: the draft ---------------- */}
        <div className="min-w-0 space-y-10">
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
            {[
              ["Owed 30 days", view.buckets.total30Cents, ""],
              ["Late", view.buckets.lateCents, "text-late"],
              ["Next 7 days", view.buckets.next7Cents, ""],
              ["Days 8–30", view.buckets.next8to30Cents, ""],
            ].map(([l, c, cls]) => (
              <div key={l as string} className="bg-white p-3">
                <div className={`label ${cls ? "!text-late" : ""}`}>{l as string}</div>
                <div className={`font-serif text-lg ${cls}`}>{usd(c as number)}</div>
              </div>
            ))}
          </section>

          <section>
            <h2 className="h2 border-b border-gold pb-2">Summary text</h2>
            {editable ? (
              <form action={updateIntroAction} className="mt-3">
                <input type="hidden" name="summaryId" value={summary.id} />
                <textarea name="introText" defaultValue={summary.introText} rows={5} className="input leading-relaxed" />
                <button className="btn-quiet mt-2">Save text</button>
              </form>
            ) : (
              <p className="mt-3 whitespace-pre-line text-sm">{summary.introText}</p>
            )}
          </section>

          <section>
            <div className="flex items-end justify-between gap-3 border-b border-gold pb-2">
              <h2 className="h2">Spreadsheet rows</h2>
              {editable && (
                <form action={rebuildAction}>
                  <input type="hidden" name="summaryId" value={summary.id} />
                  <button className="text-xs font-semibold text-muted underline underline-offset-2 hover:text-navy">
                    Rebuild from latest uploads (resets row edits)
                  </button>
                </form>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">
              Sections follow the due date: late and next 7 days go in Pay first, days 8–30 in Coming up. Edits are copied to
              the client's bills when you approve.
            </p>
            <ul className="mt-2">
              {view.payFirst.concat(view.comingUp).map((r) => {
                const uploadId = r.billId ? rowUpload.get(r.billId) : undefined;
                return (
                  <li key={r.id} className="border-b border-line py-3">
                    <div className="mb-2 flex items-center gap-2 text-xs">
                      <Badge tone={r.bucket === "late" ? "red" : r.bucket === "next7" ? "gold" : "muted"}>
                        {r.bucket === "late" ? "Late" : r.bucket === "next7" ? "Pay first" : "Coming up"}
                      </Badge>
                      {r.expected && <Badge>Expected monthly</Badge>}
                      {r.invoiceNumber && <span className="text-muted">#{r.invoiceNumber}</span>}
                      {uploadId && (
                        <Link href={`${back}?file=${uploadId}`} className="font-semibold text-muted underline underline-offset-2" scroll={false}>
                          View source
                        </Link>
                      )}
                    </div>
                    {editable ? (
                      <form action={updateRowAction} className="grid grid-cols-6 gap-2">
                        <input type="hidden" name="rowId" value={r.id} />
                        <input name="vendor" defaultValue={r.vendor} aria-label="Vendor" className="input col-span-6 font-semibold sm:col-span-4" />
                        <input name="category" defaultValue={r.category} aria-label="Category" className="input col-span-6 sm:col-span-2" />
                        <input name="amount" defaultValue={(r.amountCents / 100).toFixed(2)} aria-label="Amount ($)" inputMode="decimal" className="input col-span-3 text-right tabular-nums sm:col-span-2" />
                        <input name="dueDate" type="date" defaultValue={isoDay(r.dueDate)} aria-label="Due date" className="input col-span-3 sm:col-span-2" />
                        <input type="hidden" name="invoiceNumber" value={r.invoiceNumber ?? ""} />
                        <div className="col-span-6 flex items-center gap-2 sm:col-span-2">
                          <button className="btn-quiet px-3 py-1.5 text-xs">Save</button>
                          <button formAction={deleteRowAction} className="px-2 text-xs font-semibold text-late">
                            Remove
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex justify-between text-sm">
                        <span>
                          <strong>{r.vendor}</strong> · {r.category} · due {fmtDay(r.dueDate)}
                        </span>
                        <span className="font-semibold">{usd(r.amountCents)}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2 className="h2 border-b border-gold pb-2">Worth a second look</h2>
            {view.secondLook.length === 0 && <p className="py-3 text-sm text-muted">No flags.</p>}
            <ul>
              {view.secondLook.map((s, i) => (
                <li key={i} className="border-b border-line py-3 text-sm">
                  <span className="font-semibold">{s.vendor}</span> {usd(s.amountCents)} · <span className="text-muted">{s.message}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="h2 border-b border-gold pb-2">Needs your eyes (questions)</h2>
            <p className="mt-2 text-xs text-muted">Draft questions are sent to the client when you approve this summary.</p>
            {questions.length === 0 && <p className="py-3 text-sm text-muted">No questions.</p>}
            <ul>
              {questions.map((q) => (
                <li key={q.id} className="border-b border-line py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span>{q.body}</span>
                    <Badge tone={q.status === "draft" ? "gold" : q.status === "answered" ? "green" : "muted"}>
                      {q.status === "draft" ? "Draft" : q.status === "answered" ? "Client replied" : "Open"}
                    </Badge>
                  </div>
                  {q.messages.map((m) => (
                    <div key={m.id} className="mt-1 border-l-2 border-gold pl-3 text-xs">
                      <strong>{m.author.role === "admin" ? "Richard" : "Client"}:</strong> {m.body}{" "}
                      <span className="text-muted">{fmtTimestamp(m.createdAt)}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={adminReplyAction} className="flex flex-1 gap-2">
                      <input type="hidden" name="questionId" value={q.id} />
                      <input type="hidden" name="back" value={back} />
                      <input name="body" placeholder="Reply to client" className="input py-1.5 text-xs" />
                      <button className="btn-quiet px-3 py-1.5 text-xs">Reply</button>
                    </form>
                    {q.status === "answered" && (
                      <form action={resolveQuestionAction}>
                        <input type="hidden" name="questionId" value={q.id} />
                        <input type="hidden" name="back" value={back} />
                        <button className="btn-quiet px-3 py-1.5 text-xs">Mark resolved</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {editable ? (
            <section className="rounded-lg border border-gold p-5">
              <h2 className="h2">Decision</h2>
              <form action={approveAction} className="mt-4">
                <input type="hidden" name="summaryId" value={summary.id} />
                <button className="btn w-full sm:w-auto">Approve and deliver to client</button>
              </form>
              <form action={sendBackAction} className="mt-5 space-y-2">
                <input type="hidden" name="summaryId" value={summary.id} />
                <label className="block text-sm font-semibold" htmlFor="note">
                  Or send back to the agent with a note
                </label>
                <textarea id="note" name="note" rows={2} className="input" placeholder="e.g. Check the Lone Star invoice dates against the PDFs" />
                {sp.needNote && <p className="text-xs text-late">Add a note so the agent knows what to fix.</p>}
                <button className="btn-quiet">Send back</button>
              </form>
            </section>
          ) : (
            <p className="text-sm text-muted">
              Approved {summary.approvedAt ? fmtTimestamp(summary.approvedAt) : ""}. The client can see this summary.
            </p>
          )}

          <details className="rounded-lg border border-line p-5">
            <summary className="cursor-pointer text-sm font-semibold">Preview as the client will see it</summary>
            <div className="mt-6">
              <a href={`/api/summaries/${summary.id}/pdf`} className="btn-quiet mb-6">
                Download {editable ? "draft " : ""}PDF
              </a>
              <SummaryDocument
                businessName={summary.client.name}
                weekStart={summary.weekStart}
                weekEnd={summary.weekEnd}
                introText={summary.introText}
                view={view}
                paidBillIds={new Set(paid.map((p) => p.id))}
                interactive={false}
              />
            </div>
          </details>
        </div>

        {/* ---------------- Right: source files ---------------- */}
        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <h2 className="h2 border-b border-gold pb-2">Source files</h2>
          {uploads.length === 0 ? (
            <p className="py-3 text-sm text-muted">No files for this week.</p>
          ) : (
            <>
              <ul className="mt-2 max-h-56 overflow-y-auto text-sm">
                {uploads.map((u) => {
                  const b = u.bills[0];
                  const jb = JOB_BADGE[u.jobs[0]?.status ?? "queued"];
                  return (
                    <li key={u.id}>
                      <Link
                        href={`${back}?file=${u.id}`}
                        scroll={false}
                        className={`flex items-center justify-between gap-2 border-b border-line px-2 py-2 ${
                          selected?.id === u.id ? "bg-gold/10" : "hover:bg-line/40"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{u.fileName}</span>
                          <span className="block truncate text-xs text-muted">
                            {b ? `${b.vendor} · ${usd(b.amountCents)}` : "not sorted yet"}
                            {b?.flags.length ? " · flagged" : ""}
                          </span>
                        </span>
                        <Badge tone={jb.tone}>{jb.label}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {selected && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted">
                    <span className="truncate">{selected.fileName}</span>
                    <a href={`/api/files/${selected.id}`} target="_blank" className="font-semibold underline">
                      Open
                    </a>
                  </div>
                  {selected.note && <p className="mb-2 text-xs">Client note: “{selected.note}”</p>}
                  {selected.mimeType === "application/pdf" ? (
                    <iframe src={`/api/files/${selected.id}`} title={selected.fileName} className="h-[36rem] w-full rounded-md border border-line" />
                  ) : selected.mimeType.startsWith("image/") && !selected.mimeType.includes("hei") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${selected.id}`} alt={selected.fileName} className="w-full rounded-md border border-line" />
                  ) : (
                    <p className="rounded-md border border-line p-4 text-sm text-muted">No preview for this file type. Use Open.</p>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
