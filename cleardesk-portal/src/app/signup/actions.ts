"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, startSession } from "@/lib/auth";
import { addDays, dayFromIso, todayIso } from "@/lib/dates";

export type SignupState = { error?: string; values?: Record<string, string> };

const TYPES = ["dental", "salon", "home_services", "property_management", "other"];

export async function signupAction(_prev: SignupState, form: FormData): Promise<SignupState> {
  const v = {
    plan: String(form.get("plan") ?? ""),
    businessName: String(form.get("businessName") ?? "").trim(),
    businessType: String(form.get("businessType") ?? ""),
    name: String(form.get("name") ?? "").trim(),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
  };
  const password = String(form.get("password") ?? "");
  const fail = (error: string): SignupState => ({ error, values: v });

  if (!["pilot", "ongoing"].includes(v.plan)) return fail("Pick Pilot or Ongoing service.");
  if (v.businessName.length < 2) return fail("Enter your business name.");
  if (!TYPES.includes(v.businessType)) return fail("Pick your business type.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return fail("Enter a valid email.");
  if (password.length < 8) return fail("Use a password of at least 8 characters.");
  for (const t of ["termsVendors", "termsPay", "termsRecords"]) {
    if (form.get(t) !== "on") return fail("Please agree to all three terms to continue.");
  }
  if (await db.user.findUnique({ where: { email: v.email } })) return fail("An account with that email already exists.");

  const today = todayIso();
  const client = await db.client.create({
    data: {
      name: v.businessName,
      businessType: v.businessType,
      plan: v.plan,
      pilotEndsAt: v.plan === "pilot" ? dayFromIso(addDays(today, 7)) : null,
      termsAcceptedAt: new Date(),
      deliveryEmail: v.email,
    },
  });
  const user = await db.user.create({
    data: {
      email: v.email,
      name: v.name || v.businessName,
      role: "client",
      clientId: client.id,
      passwordHash: await hashPassword(password),
    },
  });
  await startSession(user.id);
  redirect("/app/settings?welcome=1");
}
