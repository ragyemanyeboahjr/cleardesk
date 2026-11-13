export function Wordmark({ byline = false, size = "lg" }: { byline?: boolean; size?: "sm" | "lg" }) {
  return (
    <div className="leading-tight">
      <div className={`font-serif font-semibold tracking-tight text-navy ${size === "lg" ? "text-3xl" : "text-lg"}`}>
        Clear Desk Dallas
      </div>
      {byline && <div className="mt-1 text-xs text-muted">by Richard Agyeman-Yeboah Jr.</div>}
    </div>
  );
}
