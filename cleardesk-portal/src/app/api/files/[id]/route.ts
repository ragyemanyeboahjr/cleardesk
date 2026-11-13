import { NextResponse } from "next/server";
import { currentUserOrNull } from "@/lib/auth";
import { db } from "@/lib/db";
import { readFile } from "@/lib/storage";

export const runtime = "nodejs";

// Serves an uploaded file to its owner or to an admin. Never public.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserOrNull();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const upload = await db.upload.findUnique({ where: { id } });
  if (!upload || (user.role !== "admin" && upload.clientId !== user.clientId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bytes = await readFile(upload.storageKey);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": upload.mimeType,
      "Content-Disposition": `inline; filename="${upload.fileName.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Files are user content: never let one run scripts. (Browsers' built-in
      // PDF viewers break under a sandbox CSP, so PDFs rely on nosniff.)
      ...(upload.mimeType === "application/pdf"
        ? {}
        : { "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" }),
    },
  });
}
