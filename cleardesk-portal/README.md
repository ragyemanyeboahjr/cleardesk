# Clear Desk Dallas — client portal (first draft)

A local, end-to-end demo of the Clear Desk Dallas portal using made-up sample
data. Clients upload bills and receipts, AI agents sort them, Richard reviews
every result, and only approved work reaches the client.

> **Demo only.** Nothing is deployed, no email is sent, no money moves, and
> vendors are never contacted. Every page shows a "Demo – sample data" banner.

## Run it

Needs Node 20 or newer.

```bash
cd cleardesk-portal
cp .env.example .env      # defaults work as-is
npm install
npm run setup             # creates prisma/dev.db and loads the seed data
npm run dev               # http://localhost:3000
```

Demo accounts (password `demo1234` for both):

| Role   | Email                          |
| ------ | ------------------------------ |
| Admin  | `richard@demo.cleardesk`       |
| Client | `office@mapleridgedental.demo` (Maple Ridge Family Dental) |

`npm run seed` wipes the demo data and loads it again at any time.

`DEMO_TODAY=2026-11-13` in `.env` freezes "today" so the seeded week
(Nov 9–13, 2026) always gives the same numbers: $9,657.04 owed in the next 30
days, $525.00 late, $1,552.60 due in the next 7 days, $7,579.44 due in days 8–30.
Remove that line to use the real date.

## A walk through the demo

1. **Client:** sign in as the Maple Ridge office. The dashboard shows the totals.
   *Summaries* is empty because this week's draft hasn't been approved yet.
2. **Upload:** go to *Uploads* and drop in any PDF or photo. It moves from
   Queued → Reading → Sorted (or *Needs your eyes*) within a few seconds.
   The mock reader picks sample data from the file name: try a name containing
   `plumbing` (new vendor flag), `repair` (over 2x usual), `uniform` (double
   charge) or `blurry` (needs your eyes).
3. **Schedule:** set the summary day, time and delivery email in *Settings*.
4. **Admin:** sign in as Richard (use a private window to stay signed in as both).
   *Agent activity* shows the live feed. *Review queue* → **Review** opens the
   draft next to its source files. Click *Rebuild from latest uploads* to pull in
   your new file, edit rows or the summary text, then **Approve and deliver**
   (or **Send back** with a note).
5. **Client again:** the summary is now in *Summaries*, with a PDF download and a
   delivery-log entry (the email is written to the outbox table, not sent).
   Tick bills paid and the totals update. Late bills show **Late, confirm** until
   the client ticks them paid or presses *Still owed*. Any questions go to
   *Needs your eyes*, which has a reply box.
6. **Access check:** as the client, open `/admin`, `/admin/activity` or
   `/admin/clients`. You're sent back to the dashboard. Admin server actions and
   API routes check the role on the server as well.

New clients can sign up at `/signup` (Pilot or Ongoing, business type, and the
three terms).

## How it's built

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS 4.** Fraunces and
  Manrope come from Google Fonts through `next/font`. The same fonts are
  bundled in `assets/fonts` for the PDF (SIL Open Font License).
- **Prisma + SQLite** (`prisma/schema.prisma`). Built to move to Postgres:
  statuses are plain strings, money is integer cents, and snapshots are JSON
  text. To switch, change `provider` to `"postgresql"`, set `DATABASE_URL`, and
  run `prisma migrate dev`.
- **Auth** lives behind `src/lib/auth/index.ts`, which uses email + password with
  bcrypt hashes and database sessions in an httpOnly cookie. Pages, server
  actions and route handlers call only `requireUser()`, `requireClient()`,
  `requireAdmin()` and `getCurrentUser()`. Swap `local-provider.ts` for a hosted
  provider and the rest of the app stays the same. `src/middleware.ts` only
  bounces visitors with no session cookie. The real role checks run on the server
  in every admin page, every admin server action, and the file and PDF routes.
- **Agents** (`src/lib/agents/`):
  - `extract.ts`: **`extractDocument()`**, the Reader (mock or Claude)
  - `pipeline.ts`: the job lifecycle (`queued → reading → sorted | needs_eyes`) plus the activity log
  - `checker.ts`: flags possible double charges, charges over 2x a vendor's usual (median) amount, and new vendors
  - `summarizer.ts`: builds the weekly draft (status *Awaiting Richard's review*)
- **Scheduler** (`src/lib/scheduler.ts`): `runDueSummaries()` drafts the summary
  for any client whose summary day and time has passed. In the demo it runs when
  the admin review queue or clients page loads, or from *Run scheduler now*.
- **Delivery** (`src/lib/delivery.ts`): approving copies Richard's row edits to
  the client's bills, publishes draft questions, and writes the email to the
  `OutboxEmail` table.
- **Storage** (`src/lib/storage.ts`): uploads go to `./storage` on local disk,
  behind `putFile` / `readFile`.
- **PDF** (`src/lib/pdf/summary-pdf.ts`): a two-page weekly summary made with
  pdf-lib, with the same layout as the portal view.

## Switching `extractDocument()` from mock to Claude

The Reader has two modes, set in `.env`:

```bash
EXTRACTOR_MODE="claude"
ANTHROPIC_API_KEY="sk-ant-..."
# optional, defaults to claude-opus-5-5
CLAUDE_MODEL="claude-opus-5-5"
```

Restart `npm run dev`. Each upload is then sent to the Claude Messages API
(PDFs as `document` blocks, JPG/PNG/WebP as `image` blocks) with a JSON schema
in `output_config.format`. The result is parsed into vendor, category, invoice
number, amount, document date, due date, paid/unpaid and a confidence score.
Anything under 0.6 confidence, or missing a vendor or amount, goes to *Needs
your eyes*.

Notes:

- The request turns on server-side fallback (`fallbacks: "default"`): if the
  model declines a document, the API retries it on a fallback model in the same
  call. A refusal that still gets through marks the job *Needs your eyes*.
- If `EXTRACTOR_MODE=claude` but there's no key, the app uses mock data and
  says so in *Agent activity*.
- HEIC photos (iPhone default) are accepted for upload, but Claude mode can't
  read them yet. Convert them to JPEG first; that's on the to-do list for hosting.
- Mock mode is the default so the demo works offline and costs nothing.

## What real hosting would need

This draft is local only. Before any real client data goes in, it needs:

1. **Real auth.** Replace `src/lib/auth/local-provider.ts` with a managed
   provider (Auth.js with email links, Clerk, Cognito…), and add MFA for the admin
   account, password reset, email verification, rate limits on sign-in, and
   session revocation.
2. **File storage.** Replace `src/lib/storage.ts` with private object storage
   (S3, R2 or GCS): encrypted at rest, signed short-lived URLs, a retention
   policy, virus scanning on upload, and HEIC → JPEG conversion.
3. **Email sending.** A transactional provider (Postmark, SES, Resend) that sends
   `OutboxEmail` rows with status `logged`, with SPF/DKIM set up, bounce handling
   and an unsubscribe path. Reminders before due dates would use the same outbox.
4. **Background jobs.** Move `processJob()` and `runDueSummaries()` from
   in-process calls to a queue and a cron worker (Inngest, a Postgres queue, SQS…).
5. **Database.** Postgres with backups, migrations instead of `db push`, and
   row-level scoping by `clientId` kept in every query.
6. **A data-privacy review.** Clients are told not to upload patient records,
   card numbers or bank logins, but some will anyway. Before launch, review:
   what happens when protected health information is uploaded (dental clients
   are HIPAA-covered entities; decide whether to sign BAAs or detect, redact and
   delete); the Anthropic data-retention and processing terms for documents sent
   to the API; where data is stored and for how long; who can see what (access
   logs for admin views); deletion on request; and a written privacy policy and
   terms of service that match the "we never contact your vendors / never move
   money" promises.
7. **Operations.** HTTPS, a security headers review, error monitoring, audit logs
   for approvals and edits, and removing the demo banner and `DEMO_TODAY`.

## Scripts

| Script            | What it does                                      |
| ----------------- | ------------------------------------------------- |
| `npm run dev`     | Start the dev server on port 3000                  |
| `npm run setup`   | Create the SQLite database and seed it            |
| `npm run seed`    | Wipe and reload demo data                         |
| `npm run db:reset`| Drop and recreate the database, then seed         |
| `npm run lint`    | Type-check (`tsc --noEmit`)                       |
| `npm run build`   | Production build (local use only)                 |
