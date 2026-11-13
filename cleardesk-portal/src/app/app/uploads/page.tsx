import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtTimestamp, fmtDay } from "@/lib/dates";
import { usd } from "@/lib/money";
import { resumeStuckJobs } from "@/lib/agents/pipeline";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Badge, JOB_BADGE } from "@/components/Badge";
import { Dropzone } from "./Dropzone";

export const metadata = { title: "Uploads" };

export default async function UploadsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireClient();
  const { welcome } = await searchParams;
  await resumeStuckJobs(user.clientId);
  const uploads = await db.upload.findMany({
    where: { clientId: user.clientId },
    orderBy: { uploadedAt: "desc" },
    take: 50,
    include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 }, bills: { take: 1 } },
  });
  const pending = uploads.some((u) => ["queued", "reading"].includes(u.jobs[0]?.status ?? ""));

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
      <AutoRefresh active={pending} seconds={1.5} />
      <section>
        {welcome && (
          <p className="mb-6 rounded-md border border-gold/40 bg-gold/5 px-4 py-3 text-sm">
            Your schedule is set. Last step: send us your first bills and receipts.
          </p>
        )}
        <h1 className="h1">Uploads</h1>
        <p className="mt-2 text-sm text-muted">Send paperwork any day of the week. We sort it and Richard checks it before it reaches you.</p>
        <div className="mt-4 rounded-md border border-late/25 bg-late/5 px-4 py-3 text-sm text-late">
          Please don't upload patient information, card numbers or bank logins. Cover them up before taking a photo.
        </div>
        <div className="mt-6">
          <Dropzone />
        </div>
      </section>

      <section>
        <h2 className="h2 border-b border-gold pb-2">Your files</h2>
        {uploads.length === 0 ? (
          <p className="py-4 text-sm text-muted">No files yet.</p>
        ) : (
          <ul>
            {uploads.map((u) => {
              const job = u.jobs[0];
              const badge = JOB_BADGE[job?.status ?? "queued"];
              const bill = u.bills[0];
              return (
                <li key={u.id} className="flex items-start justify-between gap-3 border-b border-line py-3">
                  <div className="min-w-0">
                    <a href={`/api/files/${u.id}`} target="_blank" className="block truncate font-semibold hover:underline">
                      {u.fileName}
                    </a>
                    <div className="text-xs text-muted">
                      {fmtTimestamp(u.uploadedAt)}
                      {u.note ? ` · “${u.note}”` : ""}
                    </div>
                    {bill && job?.status === "sorted" && (
                      <div className="mt-1 text-xs">
                        {bill.vendor} · {usd(bill.amountCents)} · {bill.kind === "receipt" ? "paid" : `due ${fmtDay(bill.dueDate)}`}
                      </div>
                    )}
                  </div>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
