import { Loader2, UploadCloud } from "lucide-react";
import { useActiveUploads } from "@/lib/upload-fetch";

/**
 * Global, non-blocking indicator for tool uploads. Shows real upload progress
 * for each request started through `uploadFetch`, then a processing state
 * until the server answers.
 */
export function UploadProgressBar() {
  const uploads = useActiveUploads();
  if (uploads.length === 0) return null;

  const current = uploads[uploads.length - 1];
  const uploading = current.phase === "uploading";
  const label = uploading ? `Uploading ${current.percent}%` : "Processing";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex w-[min(92vw,360px)] flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-lg"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        {uploading ? (
          <UploadCloud className="h-4 w-4 text-primary" aria-hidden="true" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
        )}
        <span>{label}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {uploading ? (
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-150"
            style={{ width: `${current.percent}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        )}
      </div>
    </div>
  );
}
