import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createFile } from "@/lib/server/createFile";
import type { FileData } from "@/lib/Types/Types";
import { linkFiles } from "@/lib/server/linkFiles";
import { isFileOwner } from "@/lib/server/getFileOwnership";

export async function POST(request: NextRequest) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json(
            {
                okay: false,
                error: "Unauthorized",
                message: "User not authenticated",
            },
            { status: 401 }
        );
    }

    const { file_ids } = await request.json();

    if (!Array.isArray(file_ids) || file_ids.length === 0) {
        return NextResponse.json(
            {
                okay: false,
                error: "Bad request",
                message: "file_ids must be a non-empty array",
            },
            { status: 400 }
        );
    }

    for (const fileId of file_ids) {
        if (typeof fileId !== "string" || !(await isFileOwner(fileId, userId))) {
            return NextResponse.json(
                {
                    okay: false,
                    error: "Forbidden",
                    message: "You do not own one or more of the requested files",
                },
                { status: 403 }
            );
        }
    }

    const newBunde: FileData = {
        owner_id: userId,
        creator_id: userId,
        name: "Bundle",
        type: "bundle",
    };

    const createdEntries = await createFile([newBunde], userId);

    const links = await linkFiles(file_ids, createdEntries[0].id, userId);

    return NextResponse.json(
        {
            okay: true,
            message: "Files linked successfully",
            data: {
                bundle: createdEntries[0],
                links: links,
            },
        },
        { status: 200 }
    );
}
