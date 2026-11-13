import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { runDueSummaries } from "@/lib/scheduler";
import { db } from "@/lib/db";
import { fmtDay, fmtTime, fmtTimestamp, WEEKDAYS } from "@/lib/dates";
import { nextRunDay } from "@/lib/scheduler";
import { Badge, STATUS_BADGE } from "@/components/Badge";
import { draftNowAction } from "../actions";

export const metadata = { title: "Clients" };

const TYPE_LABEL: Record<string, string> = {
  dental: "Dental",
  salon: "Salon",
  home_services: "Home services",
  property_management: "Property mgmt",
  other: "Other",
};

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ already?: string }> }) {
  await requireAdmin();
  // Demo scheduler: build any summary drafts that are due before listing them.
  await runDueSummaries();
  const { already } = await searchParams;
  const clients = await db.client.findMany({
    orderBy: { name: "asc" },
    include: {
      uploads: { orderBy: { uploadedAt: "desc" }, take: 1 },
      summaries: { orderBy: { asOf: "desc" }, take: 1 },
      _count: { select: { questions: { where: { status: "open" } } } },
    },
  });

  return (
    <div>
      <h1 className="h1">Clients</h1>
      {already && <p className="mt-4 text-sm text-muted">Today's summary for that client is already approved.</p>}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead>
            <tr className="border-b border-gold text-[11px] uppercase tracking-wider text-muted">
              <th className="py-2 pr-3 font-bold">Client</th>
              <th className="py-2 pr-3 font-bold">Plan</th>
              <th className="py-2 pr-3 font-bold">Last upload</th>
              <th className="py-2 pr-3 font-bold">Next summary</th>
              <th className="py-2 pr-3 font-bold">Latest summary</th>
              <th className="py-2 font-bold"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const latest = c.summaries[0];
              return (
                <tr key={c.id} className="border-b border-line align-top">
                  <td className="py-3 pr-3">
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-muted">
                      {TYPE_LABEL[c.businessType] ?? c.businessType} · {c.deliveryEmail}
                      {c._count.questions > 0 && ` · ${c._count.questions} open question${c._count.questions === 1 ? "" : "s"}`}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    {c.plan === "pilot" ? (
                      <>
                        Pilot
                        {c.pilotEndsAt && <div className="text-xs text-muted">ends {fmtDay(c.pilotEndsAt)}</div>}
                      </>
                    ) : (
                      "Ongoing"
                    )}
                  </td>
                  <td className="py-3 pr-3">{c.uploads[0] ? fmtTimestamp(c.uploads[0].uploadedAt) : <span className="text-muted">None yet</span>}</td>
                  <td className="py-3 pr-3">
                    {fmtDay(nextRunDay(c.summaryDay, c.summaryTime), { weekday: true })}
                    <div className="text-xs text-muted">
                      {WEEKDAYS[c.summaryDay]}s, {fmtTime(c.summaryTime)}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    {latest ? (
                      <Link href={`/admin/review/${latest.id}`} className="hover:underline">
                        <Badge tone={STATUS_BADGE[latest.status].tone}>{STATUS_BADGE[latest.status].label}</Badge>
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <form action={draftNowAction}>
                      <input type="hidden" name="clientId" value={c.id} />
                      <button className="btn-quiet whitespace-nowrap text-xs">Draft summary now</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
