import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  const [client, openQuestions] = await Promise.all([
    db.client.findUniqueOrThrow({ where: { id: user.clientId } }),
    db.question.count({ where: { clientId: user.clientId, status: "open" } }),
  ]);
  return (
    <>
      <TopBar
        who={client.name}
        links={[
          { href: "/app", label: "Dashboard" },
          { href: "/app/bills", label: "Bills" },
          { href: "/app/uploads", label: "Uploads" },
          { href: "/app/summaries", label: "Summaries" },
          { href: "/app/questions", label: "Needs your eyes", badge: openQuestions },
          { href: "/app/settings", label: "Settings" },
        ]}
      />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </>
  );
}
