import { db } from "@/db"
import { entryTable } from "@/db/schema"
import { and, eq } from "drizzle-orm"
import { isEntryUuid } from "@/lib/linqType"

/** Row only if `file_id` exists and `owner_id` matches (for auth-aware reads). */
export const getFileDataForUser = async (file_id: string, user_id: string) => {
    const id = String(file_id ?? "").trim()
    if (!isEntryUuid(id)) return null
    try {
        const file = await db
            .select()
            .from(entryTable)
            .where(and(eq(entryTable.id, id), eq(entryTable.owner_id, user_id)))
            .limit(1)
            .then((res) => res[0]);

        return file ?? null;
    } catch {
        return null
    }
};

export const getFileData = async (file_id : string) => {
    const id = String(file_id ?? "").trim()
    if (!isEntryUuid(id)) return null
    try {
        const file = await db
            .select()
            .from(entryTable)
            .where(eq(entryTable.id, id))
            .limit(1)
            .then(res => res[0]);

        return file || null;
    } catch {
        return null
    }
}