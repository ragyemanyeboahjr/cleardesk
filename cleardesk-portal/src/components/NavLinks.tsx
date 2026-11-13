"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string; badge?: number }[] }) {
  const path = usePathname();
  const active = (href: string) =>
    href === "/app" || href === "/admin" ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <nav className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6">
      <ul className="flex gap-5 whitespace-nowrap text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className={`inline-flex items-center gap-1.5 border-b-2 py-3 font-semibold transition ${
                active(l.href) ? "border-gold text-navy" : "border-transparent text-muted hover:text-navy"
              }`}
            >
              {l.label}
              {l.badge ? (
                <span className="rounded-full bg-gold px-1.5 text-[10px] font-bold leading-4 text-white">{l.badge}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
