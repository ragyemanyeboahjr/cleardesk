import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Wordmark } from "@/components/Wordmark";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/app");
  return (
    <main className="mx-auto flex max-w-sm flex-col px-4 py-16">
      <Wordmark byline />
      <hr className="rule my-8" />
      <h1 className="h2 mb-6">Sign in to your portal</h1>
      <LoginForm />
      <p className="mt-6 text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-navy underline underline-offset-4">
          Start your pilot week
        </Link>
      </p>
      <div className="mt-10 rounded-md border border-line p-4 text-xs leading-relaxed text-muted">
        <div className="label mb-2">Demo accounts (password demo1234)</div>
        <div>Client: office@mapleridgedental.demo</div>
        <div>Admin: richard@demo.cleardesk</div>
      </div>
    </main>
  );
}
