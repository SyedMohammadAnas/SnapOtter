-- Per-account daily allowance (credits). One row per user per UTC day.
-- Enforced in tool-factory before a job is queued.
CREATE TABLE IF NOT EXISTS "daily_usage" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "files" integer NOT NULL DEFAULT 0,
  "bytes" bigint NOT NULL DEFAULT 0,
  PRIMARY KEY ("user_id", "day")
);
