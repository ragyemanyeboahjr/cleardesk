import { NextResponse, after } from "next/server";
import { currentUserOrNull } from "@/lib/auth";
import { db } from "@/lib/db";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, putFile } from "@/lib/storage";
import { logEvent, processJob } from "@/lib/agents/pipeline";

export const runtime = "nodejs";

const EXT_TYPES: Record<string, string> = { heic: "image/heic", heif: "image/heif" };

export async function POST(req: Request) {
  const user = await currentUserOrNull();
  if (!user || user.role !== "client" || !user.clientId) {
    return NextResponse.json({ error: "Sign in as a client to upload." }, { status: 401 });
  }
  const form = await req.formData();
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files received." }, { status: 400 });
  if (files.length > 20) return NextResponse.json({ error: "Upload at most 20 files at a time." }, { status: 400 });

  const errors: string[] = [];
  const jobIds: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const type = file.type || EXT_TYPES[ext] || "";
    if (!ALLOWED_TYPES[type]) {
      errors.push(`${file.name}: only PDFs and photos (JPG, PNG, HEIC) are accepted.`);
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push(`${file.name}: larger than 15 MB.`);
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const storageKey = await putFile(user.clientId, ALLOWED_TYPES[type], bytes);
    const upload = await db.upload.create({
      data: {
        clientId: user.clientId,
        uploadedById: user.id,
        fileName: file.name.slice(0, 200),
        mimeType: type,
        sizeBytes: file.size,
        storageKey,
        note,
      },
    });
    const job = await db.agentJob.create({ data: { uploadId: upload.id, clientId: user.clientId } });
    await logEvent(user.clientId, "Reader", "queued", `Queued ${upload.fileName}`, job.id);
    jobIds.push(job.id);
  }

  // Process after the response is sent. In production this would be a queue.
  after(async () => {
    for (const id of jobIds) await processJob(id);
  });

  return NextResponse.json({ uploaded: jobIds.length, errors });
}
