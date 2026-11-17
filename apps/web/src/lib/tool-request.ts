import { FEEDBACK_EMAIL } from "@/lib/feedback";

const MAX_QUERY_LEN = 200;

/** Collapse whitespace/newlines and clamp length so the query is URL-safe. */
function sanitizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LEN);
}

/**
 * Prefill a mailto for a missing-tool request. Public Konvertt routes product
 * feedback to email rather than the upstream SnapOtter GitHub Discussions.
 */
export function buildToolRequestDiscussionUrl(query: string): string {
  const q = sanitizeQuery(query);
  const subject = encodeURIComponent(`Konvertt tool request: ${q}`);
  const body = encodeURIComponent(
    [
      `I searched Konvertt for "${q}" and could not find a tool for it.`,
      "",
      "What I'm trying to do:",
      "",
      "(describe your use case)",
      "",
      "_Submitted from in-app search._",
    ].join("\n"),
  );
  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
}
