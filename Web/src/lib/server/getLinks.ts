import { db } from "@/db"
import { linkTable, entryTable } from "@/db/schema"
import { eq } from "drizzle-orm"

export const getLinks = async (file_id: string) => {
    const links = await db
        .select()
        .from(linkTable)
        .where(eq(linkTable.from_id, file_id))
        .innerJoin(entryTable, eq(linkTable.to_id, entryTable.id));
        // .innerJoin(entryTable, eq(linkTable.to_id, entryTable.id))


    return links
}
