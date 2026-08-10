import { clerkClient } from "@clerk/nextjs/server";
import { entryTable } from "@/db/schema";
import { db } from "@/db";
import type { FileData } from "../Types/Types";
import { inArray } from "drizzle-orm";

const CLIENT_ENTRY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createFile = async (
  files: FileData[],
  userId: string
): Promise<(typeof entryTable.$inferSelect)[]> => {
  const sentFiles: (typeof entryTable.$inferInsert)[] = [];

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress ?? "oops, no email here";

  for (const file of files) {
    const row: typeof entryTable.$inferInsert = {
      owner_id: userId,
      creator_id: userId,
      name: file.name,
      type: file.name.split(".").pop() || "unknown",
      file_id: file.file_id,
      creator_email: email,
    };

    // Honor offline-generated UUIDs so mobile preview URLs stay stable across sync.
    const clientId = typeof file.id === "string" ? file.id.trim() : "";
    if (clientId && CLIENT_ENTRY_ID_RE.test(clientId)) {
      row.id = clientId;
    }

    sentFiles.push(row);
  }

  try {
    return await db.insert(entryTable).values(sentFiles).returning();
  } catch (err) {
    // Retry after a successful verify can hit unique(id) — return existing rows.
    const ids = sentFiles
      .map((f) => f.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length === 0) throw err;
    const existing = await db
      .select()
      .from(entryTable)
      .where(inArray(entryTable.id, ids));
    if (existing.length === sentFiles.length) return existing;
    throw err;
  }
};