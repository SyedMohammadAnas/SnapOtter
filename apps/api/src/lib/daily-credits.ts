// Per-account daily allowance (credits), enforced before a job is queued.
//
// Limits come from env so they can change without a rebuild:
//   DAILY_FILE_LIMIT  files per UTC day   (default 200)
//   DAILY_BYTE_LIMIT  bytes per UTC day   (default 2 GiB)
// The anonymous synthetic user (AUTH_ENABLED=false instances) is not limited.

import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { ANONYMOUS_USER_ID } from "./anonymous-user.js";

const FILE_LIMIT = Number(process.env.DAILY_FILE_LIMIT ?? 200);
const BYTE_LIMIT = Number(process.env.DAILY_BYTE_LIMIT ?? 2 * 1024 * 1024 * 1024);

export interface CreditCheck {
  allowed: boolean;
  limit: { files: number; bytes: number };
}

/**
 * Atomically reserve one file and `bytes` against today's allowance.
 * Returns allowed=false (and reserves nothing) when either limit would be
 * exceeded. A single upsert keeps concurrent requests from overshooting.
 */
export async function reserveDailyCredit(userId: string, bytes: number): Promise<CreditCheck> {
  const limit = { files: FILE_LIMIT, bytes: BYTE_LIMIT };
  if (!userId || userId === ANONYMOUS_USER_ID) return { allowed: true, limit };

  const safeBytes = Math.max(0, Math.floor(bytes));
  const rows = await db.execute(sql`
    INSERT INTO daily_usage (user_id, day, files, bytes)
    VALUES (${userId}, (now() at time zone 'utc')::date, 1, ${safeBytes})
    ON CONFLICT (user_id, day) DO UPDATE
      SET files = daily_usage.files + 1,
          bytes = daily_usage.bytes + EXCLUDED.bytes
      WHERE daily_usage.files < ${FILE_LIMIT}
        AND daily_usage.bytes + EXCLUDED.bytes <= ${BYTE_LIMIT}
    RETURNING files
  `);
  return { allowed: rows.rows.length > 0, limit };
}
