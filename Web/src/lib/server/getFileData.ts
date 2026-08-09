import { db } from "@/db"
import { entryTable } from "@/db/schema"
import { and, eq } from "drizzle-orm"

/** Row only if `file_id` exists and `owner_id` matches (for auth-aware reads). */
export const getFileDataForUser = async (file_id: string, user_id: string) => {
    const file = await db
        .select()
        .from(entryTable)
        .where(and(eq(entryTable.id, file_id), eq(entryTable.owner_id, user_id)))
        .limit(1)
        .then((res) => res[0]);

    return file ?? null;
};

export const getFileData = async (file_id : string) => {
    //fetch file data from database
    //return file data

    const file = await db
        .select()
        .from(entryTable)
        .where(eq(entryTable.id, file_id))
        .limit(1)
        .then(res => res[0]);

    return file || null;
}