"use client";
import { useActionState } from "react";
import { signupAction, type SignupState } from "./actions";

const TYPES = [
  ["dental", "Dental"],
  ["salon", "Salon"],
  ["home_services", "Home services"],
  ["property_management", "Property management"],
  ["other", "Other"],
];

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signupAction, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-8">
      <fieldset>
        <legend className="label mb-3">1. Choose a plan</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["pilot", "Pilot", "One free week. We sort what you send and you get one summary."],
            ["ongoing", "Ongoing service", "Every week: sorting, due-date tracking and reminders."],
          ].map(([value, title, body]) => (
            <label key={value} className="card flex cursor-pointer gap-3 p-4 has-[:checked]:border-gold">
              <input type="radio" name="plan" value={value} defaultChecked={(v.plan ?? "pilot") === value} className="mt-1 accent-[#0f2340]" />
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="mt-1 block text-sm text-muted">{body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label mb-3">2. Your business</legend>
        <label className="block">
          <span className="text-sm font-semibold">Business name</span>
          <input name="businessName" required defaultValue={v.businessName} className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Business type</span>
          <select name="businessType" required defaultValue={v.businessType ?? ""} className="input mt-1">
            <option value="" disabled>
              Choose one
            </option>
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold">Your name</span>
            <input name="name" defaultValue={v.name} className="input mt-1" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Email</span>
            <input name="email" type="email" required autoComplete="email" defaultValue={v.email} className="input mt-1" />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-semibold">Password</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input mt-1" />
        </label>
      </fieldset>

      <fieldset>
        <legend className="label mb-3">3. How we work</legend>
        <div className="space-y-3 text-sm">
          {[
            ["termsVendors", "Clear Desk never contacts my vendors, customers or patients."],
            ["termsPay", "I pay my own bills. Clear Desk never moves money."],
            ["termsRecords", "I won't send patient records, card numbers or bank logins."],
          ].map(([name, text]) => (
            <label key={name} className="flex items-start gap-3">
              <input type="checkbox" name={name} required className="mt-0.5 h-4 w-4 accent-[#0f2340]" />
              <span>{text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && <p className="text-sm text-late">{state.error}</p>}
      <button className="btn w-full sm:w-auto" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
