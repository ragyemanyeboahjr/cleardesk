import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const waiting = await db.summary.count({ where: { status: { in: ["awaiting_review", "sent_back"] } } });
  return (
    <>
      <TopBar
        who={`${admin.name} · admin`}
        links={[
          { href: "/admin", label: "Review queue", badge: waiting },
          { href: "/admin/activity", label: "Agent activity" },
          { href: "/admin/clients", label: "Clients" },
        ]}
      />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </>
  );
}
