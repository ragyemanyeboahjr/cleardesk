"use server";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

export type LoginState = { error?: string; email?: string };

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };
  const user = await signIn(email, password);
  if (!user) return { error: "That email and password don't match.", email };
  redirect(user.role === "admin" ? "/admin" : "/app");
}
