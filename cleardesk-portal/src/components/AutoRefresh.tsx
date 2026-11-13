"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the server component tree every `seconds` while `active`. */
export function AutoRefresh({ seconds = 2, active = true }: { seconds?: number; active?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, active]);
  return null;
}
