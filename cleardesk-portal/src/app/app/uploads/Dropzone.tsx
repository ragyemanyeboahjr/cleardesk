"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export function Dropzone() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 20));
    setMessage(null);
  };

  const submit = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setMessage(null);
    const body = new FormData();
    files.forEach((f) => body.append("files", f));
    body.append("note", note);
    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = (await res.json()) as { uploaded?: number; errors?: string[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Upload failed");
      const errs = json.errors ?? [];
      setMessage({
        ok: errs.length === 0,
        text: `${json.uploaded} file${json.uploaded === 1 ? "" : "s"} sent to the sorting queue.${errs.length ? " " + errs.join(" ") : ""}`,
      });
      setFiles([]);
      setNote("");
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition ${
          over ? "border-gold bg-gold/5" : "border-line hover:border-gold/60"
        }`}
      >
        <div className="font-serif text-lg">Drop bills, invoices or receipts here</div>
        <div className="mt-1 text-sm text-muted">PDFs or phone photos (JPG, PNG, HEIC), up to 15 MB each. Or tap to choose.</div>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-md border border-line text-sm">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="text-xs font-semibold text-muted hover:text-navy"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-4 block">
        <span className="text-sm font-semibold">Note (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. The Costco one was for the break room"
          className="input mt-1"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="button" onClick={submit} disabled={busy || files.length === 0} className="btn">
          {busy ? "Uploading…" : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
        </button>
        {message && <span className={`text-sm ${message.ok ? "text-[#2f6b4f]" : "text-late"}`}>{message.text}</span>}
      </div>
    </div>
  );
}
