import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { entryTable } from "@/db/schema";
import { s3Client, bucketName } from "@/lib/server/s3/module.s3client";
import { logSafeWarn } from "@/lib/safeLog";

/** Invite-test caps. Existing files still open; new creates are rejected past these. */
export const MAX_OWNED_FILES = 200;
export const MAX_OWNED_BYTES = 500 * 1024 * 1024;
export const MAX_LINK_BATCH = 50;
export const MAX_CONNECT_MEMBERS = 50;
export const MAX_SEARCH_CONTENT_JOBS = 50;

export class QuotaExceededError extends Error {
  constructor() {
    super("QUOTA_EXCEEDED");
    this.name = "QuotaExceededError";
  }
}

async function countOwnedEntries(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entryTable)
    .where(eq(entryTable.owner_id, userId));
  return Number(row?.count ?? 0);
}

async function sumOwnedObjectBytes(userId: string): Promise<number | null> {
  if (!bucketName) return null;
  let total = 0;
  let token: string | undefined;
  try {
    do {
      const page = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: `${userId}/`,
          ContinuationToken: token,
        })
      );
      for (const obj of page.Contents ?? []) {
        total += Number(obj.Size ?? 0);
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return total;
  } catch (err) {
    logSafeWarn("quota list prefix", err);
    return null;
  }
}

/** Throws QuotaExceededError when the user is over invite-test storage limits. */
export async function assertCanAddFiles(
  userId: string,
  additionalCount: number,
  additionalBytes = 0
): Promise<void> {
  const extra = Math.max(0, additionalCount);
  if (extra === 0 && additionalBytes <= 0) return;

  const owned = await countOwnedEntries(userId);
  if (owned + extra > MAX_OWNED_FILES) {
    throw new QuotaExceededError();
  }

  if (additionalBytes <= 0) return;
  const used = await sumOwnedObjectBytes(userId);
  if (used == null) return;
  if (used + additionalBytes > MAX_OWNED_BYTES) {
    throw new QuotaExceededError();
  }
}

export function quotaExceededResponse() {
  return {
    okay: false as const,
    error: "Quota exceeded",
    message: "Account storage limit reached for this test",
  };
}
