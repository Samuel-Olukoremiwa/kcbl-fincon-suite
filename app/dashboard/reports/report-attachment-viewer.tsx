"use client";

import { useEffect, useState } from "react";

type Attachment = {
  title: string;
  url: string;
  kind: "pdf" | "image" | "video";
};

export default function ReportAttachmentViewer({
  attachment, onClose,
}: { attachment: Attachment | null; onClose: () => void }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attachment) {
      setObjectUrl(null); setLoading(false); setError(null); return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    const controller = new AbortController();

    async function loadAttachment() {
      setLoading(true); setError(null); setObjectUrl(null);
      try {
        const response = await fetch(attachment!.url, {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `Could not load attachment (${response.status}).`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "Could not load attachment.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadAttachment();
    return () => {
      cancelled = true; controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [attachment]);

  if (!attachment) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/80 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label={attachment.title}>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <p className="min-w-0 truncate font-semibold text-slate-900">{attachment.title}</p>
          <button type="button" onClick={onClose} className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">Close</button>
        </div>
        <div className="relative min-h-0 flex-1 bg-slate-100">
          {loading && <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-600">Loading attachment…</div>}
          {error && <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-sm text-red-700">{error}</p><button type="button" onClick={onClose} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm">Close viewer</button></div>}
          {!loading && !error && objectUrl && attachment.kind === "pdf" && <iframe title={attachment.title} src={objectUrl} className="h-full w-full border-0" />}
          {!loading && !error && objectUrl && attachment.kind === "image" && <div className="flex h-full w-full items-center justify-center overflow-auto p-2"><img src={objectUrl} alt={attachment.title} className="max-h-full max-w-full object-contain" /></div>}
          {!loading && !error && objectUrl && attachment.kind === "video" && <div className="flex h-full w-full items-center justify-center p-2"><video src={objectUrl} controls playsInline className="max-h-full max-w-full" /></div>}
        </div>
        {objectUrl && <div className="border-t border-slate-200 px-4 py-2 text-right"><a href={objectUrl} download={attachment.title} className="text-sm font-medium text-blue-700 underline">Download attachment</a></div>}
      </div>
    </div>
  );
}
