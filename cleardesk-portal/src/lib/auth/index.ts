import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import * as provider from "./local-provider";

// The one auth module the app talks to. To move to a hosted provider, keep
// these function signatures and change local-provider.ts.

export const SESSION_COOKIE = "cd_session";

export type Role = "client" | "admin";
export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  clientId: string | null;
};

export const hashPassword = provider.hashPassword;

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await provider.lookupSession(token);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === "admin" ? "admin" : "client",
    clientId: user.clientId,
  };
});

export async function signIn(email: string, password: string): Promise<CurrentUser | null> {
  const user = await provider.verifyCredentials(email, password);
  if (!user) return null;
  await startSession(user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === "admin" ? "admin" : "client",
    clientId: user.clientId,
  };
}

export async function startSession(userId: string) {
  const { token, expiresAt } = await provider.createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await provider.deleteSession(token);
  store.delete(SESSION_COOKIE);
}

/** Any signed-in user, or redirect to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** A client user with a business attached. Admins are sent to /admin. */
export async function requireClient(): Promise<CurrentUser & { clientId: string }> {
  const user = await requireUser();
  if (user.role !== "client" || !user.clientId) redirect("/admin");
  return user as CurrentUser & { clientId: string };
}

/**
 * Admin only. Call this at the top of every admin page, server action and
 * route handler — layouts alone are not a security boundary in Next.js.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/app?denied=admin");
  return user;
}

/** For route handlers: returns null instead of redirecting. */
export async function currentUserOrNull() {
  return getCurrentUser();
}
