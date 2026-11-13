import Link from "next/link";
import { signOutAction } from "@/app/auth-actions";
import { NavLinks } from "./NavLinks";

export function TopBar({
  links,
  who,
}: {
  links: { href: string; label: string; badge?: number }[];
  who: string;
}) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
        <Link href="/" className="font-serif text-lg font-semibold tracking-tight text-navy">
          Clear Desk Dallas
        </Link>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="hidden max-w-[16rem] truncate sm:inline">{who}</span>
          <form action={signOutAction}>
            <button className="font-semibold text-navy underline-offset-4 hover:underline">Sign out</button>
          </form>
        </div>
      </div>
      <NavLinks links={links} />
    </header>
  );
}
