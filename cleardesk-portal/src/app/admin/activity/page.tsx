import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtTimestamp } from "@/lib/dates";
import { resumeStuckJobs } from "@/lib/agents/pipeline";
import { resolveMode } from "@/lib/agents/extract";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Badge } from "@/components/Badge";

export const metadata = { title: "Agent activity" };

const AGENT_TONE: Record<string, "navy" | "gold" | "green" | "muted" | "red"> = {
  Reader: "navy",
  Sorter: "green",
  Checker: "gold",
  Summarizer: "navy",
  Delivery: "green",
  Inbox: "muted",
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireAdmin();
  await resumeStuckJobs();
  const { client } = await searchParams;
  const [clients, events, inFlight] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.agentEvent.findMany({
      where: client ? { clientId: client } : {},
      orderBy: { createdAt: "desc" },
      take: 150,
      include: { client: { select: { name: true } }, job: { select: { uploadId: true } } },
    }),
    db.agentJob.count({ where: { status: { in: ["queued", "reading"] } } }),
  ]);
  const { mode, fellBack } = resolveMode();

  return (
    <div>
      <AutoRefresh seconds={3} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h1">Agent activity</h1>
          <p className="mt-2 text-sm text-muted">
            Live feed of what each agent read, sorted and flagged. Updates every few seconds. Reader mode:{" "}
            <strong className="text-navy">{mode}</strong>
            {fellBack && " (ANTHROPIC_API_KEY missing, using mock)"} · {inFlight} job{inFlight === 1 ? "" : "s"} in flight
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/activity" className={!client ? "btn" : "btn-quiet"}>
          All clients
        </Link>
        {clients.map((c) => (
          <Link key={c.id} href={`/admin/activity?client=${c.id}`} className={client === c.id ? "btn" : "btn-quiet"}>
            {c.name}
          </Link>
        ))}
      </div>

      <ol className="mt-6 border-t border-gold">
        {events.length === 0 && <li className="py-6 text-sm text-muted">No activity yet.</li>}
        {events.map((e) => (
          <li key={e.id} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-b border-line py-3 sm:grid-cols-[8.5rem_6.5rem_1fr]">
            <span className="text-xs tabular-nums text-muted">{fmtTimestamp(e.createdAt)}</span>
            <span>
              <Badge tone={e.action === "flagged" || e.action === "error" ? "red" : AGENT_TONE[e.agent] ?? "muted"}>{e.agent}</Badge>
            </span>
            <div className="col-span-2 text-sm sm:col-span-1">
              <span>{e.detail}</span>
              <span className="ml-2 text-xs text-muted">
                {e.client.name}
                {e.job?.uploadId && (
                  <>
                    {" · "}
                    <a href={`/api/files/${e.job.uploadId}`} target="_blank" className="underline">
                      file
                    </a>
                  </>
                )}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
