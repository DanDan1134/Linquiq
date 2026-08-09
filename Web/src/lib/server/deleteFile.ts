import { db } from "@/db"
import { entryTable, linkTable } from "@/db/schema"
import { eq, or } from "drizzle-orm"

export const deleteFile = async (file_id: string) => {
    await db.delete(linkTable)
    .where(or(
        eq(linkTable.from_id, file_id),
        eq(linkTable.to_id, file_id),
    ));

    await db.delete(entryTable)
    .where(eq(entryTable.id, file_id));

    return;
}