import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Wordmark byline />
      <hr className="rule my-8" />
      <h1 className="h1">Get your desk clear</h1>
      <p className="mt-2 max-w-prose text-muted">
        Send us your bills, invoices and receipts. We sort them, track every due date and remind you before bills are due.
        You pay them yourself.
      </p>
      <div className="mt-8">
        <SignupForm />
      </div>
      <p className="mt-8 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-navy underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
