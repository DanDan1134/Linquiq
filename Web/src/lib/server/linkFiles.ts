import { db } from "@/db";
import { linkTable } from "@/db/schema";
import { isFileOwner } from "./getFileOwnership";

export const linkFiles = async (
    to_ids: string[],
    from_id: string,
    userId: string
): Promise<typeof linkTable.$inferSelect[]> => {
    if (!(await isFileOwner(from_id, userId))) {
        throw new Error("FORBIDDEN");
    }

    for (const to_id of to_ids) {
        if (!(await isFileOwner(to_id, userId))) {
            throw new Error("FORBIDDEN");
        }
    }

    const links: typeof linkTable.$inferSelect[] = [];
    for (const to_id of to_ids) {
        const link = await db
            .insert(linkTable)
            .values({
                to_id,
                from_id,
            })
            .returning();
        links.push(link[0]);
    }

    return links;
};
