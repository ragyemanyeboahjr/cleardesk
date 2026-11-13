import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtTimestamp } from "@/lib/dates";
import { usd } from "@/lib/money";
import { Badge } from "@/components/Badge";
import { replyAction } from "../actions";

export const metadata = { title: "Needs your eyes" };

export default async function QuestionsPage() {
  const user = await requireClient();
  // Draft questions stay hidden until Richard approves them with a summary.
  const questions = await db.question.findMany({
    where: { clientId: user.clientId, status: { in: ["open", "answered", "resolved"] } },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    include: { messages: { orderBy: { createdAt: "asc" }, include: { author: true } }, upload: true },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="h1">Needs your eyes</h1>
      <p className="mt-2 text-sm text-muted">Questions from us about your paperwork. A quick reply is all we need.</p>

      {questions.length === 0 && <p className="mt-8 text-sm text-muted">No questions right now.</p>}

      <ul className="mt-6 space-y-5">
        {questions.map((q) => (
          <li key={q.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold leading-snug">{q.body}</p>
              <Badge tone={q.status === "open" ? "gold" : "muted"}>{q.status === "open" ? "Waiting on you" : "Answered"}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted">
              {fmtTimestamp(q.publishedAt ?? q.createdAt)}
              {q.amountCents != null && ` · ${usd(q.amountCents)}`}
              {q.upload && (
                <>
                  {" · "}
                  <a href={`/api/files/${q.upload.id}`} target="_blank" className="underline">
                    {q.upload.fileName}
                  </a>
                </>
              )}
            </div>
            {q.messages.length > 0 && (
              <ul className="mt-4 space-y-2 border-l-2 border-gold pl-4 text-sm">
                {q.messages.map((m) => (
                  <li key={m.id}>
                    <span className="font-semibold">{m.author.role === "admin" ? "Richard" : "You"}:</span> {m.body}
                    <span className="ml-2 text-xs text-muted">{fmtTimestamp(m.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <form action={replyAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="questionId" value={q.id} />
              <input name="body" required maxLength={2000} placeholder="Type your reply" className="input" />
              <button className="btn shrink-0">Reply</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
