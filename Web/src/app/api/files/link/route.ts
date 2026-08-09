import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { and, eq } from "drizzle-orm";
import { linkTable } from "@/db/schema";
import { isFileOwner } from "@/lib/server/getFileOwnership";

type FileLinkRequest = {
    file_to: string;
    file_from: string;
};

export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { links } = await request.json();
    const linksArray: FileLinkRequest[] = links;

    if (!Array.isArray(linksArray)) {
        return NextResponse.json({ error: "Bad request", message: "links must be an array" }, { status: 400 });
    }

    for (const link of linksArray) {
        const { file_to, file_from } = link;
        if (typeof file_to !== "string" || typeof file_from !== "string") {
            return NextResponse.json(
                { error: "Bad request", message: "file_to and file_from must be strings" },
                { status: 400 }
            );
        }

        const ownsTo = await isFileOwner(file_to, userId);
        const ownsFrom = await isFileOwner(file_from, userId);
        if (!ownsTo || !ownsFrom) {
            return NextResponse.json(
                { error: "Forbidden", message: "You do not own one or more of the linked files" },
                { status: 403 }
            );
        }

        const existingLink = await db
            .select()
            .from(linkTable)
            .where(and(eq(linkTable.to_id, file_to), eq(linkTable.from_id, file_from)));
        if (existingLink.length > 0) {
            continue;
        }
        await db.insert(linkTable).values({
            to_id: file_to,
            from_id: file_from,
        });
    }

    return NextResponse.json(
        { message: `Successfully linked ${linksArray.length} files` },
        { status: 200 }
    );
}
