"use client";
import { useOptimistic, useTransition } from "react";
import { setPaidAction } from "@/app/app/actions";

export function PaidCheckbox({ billId, paid, label }: { billId: string; paid: boolean; label: string }) {
  const [optimistic, setOptimistic] = useOptimistic(paid);
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      aria-label={`Mark ${label} as paid`}
      checked={optimistic}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.checked;
        start(async () => {
          setOptimistic(next);
          await setPaidAction(billId, next);
        });
      }}
      className="h-4 w-4 cursor-pointer accent-[#0f2340]"
    />
  );
}
