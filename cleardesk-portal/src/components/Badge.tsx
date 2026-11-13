const TONES = {
  red: "border-late/30 bg-late/5 text-late",
  gold: "border-gold/40 bg-gold/10 text-[#7d6224]",
  navy: "border-navy/20 bg-navy/5 text-navy",
  muted: "border-line bg-white text-muted",
  green: "border-[#2f6b4f]/30 bg-[#2f6b4f]/5 text-[#2f6b4f]",
} as const;

export function Badge({ tone = "muted", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export const JOB_BADGE: Record<string, { tone: keyof typeof TONES; label: string }> = {
  queued: { tone: "muted", label: "Queued" },
  reading: { tone: "navy", label: "Reading…" },
  sorted: { tone: "green", label: "Sorted" },
  needs_eyes: { tone: "gold", label: "Needs your eyes" },
  failed: { tone: "red", label: "Failed" },
};

export const STATUS_BADGE: Record<string, { tone: keyof typeof TONES; label: string }> = {
  awaiting_review: { tone: "gold", label: "Awaiting Richard's review" },
  sent_back: { tone: "red", label: "Sent back" },
  approved: { tone: "green", label: "Approved" },
};

