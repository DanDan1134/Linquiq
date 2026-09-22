import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createFile } from "@/lib/server/createFile";
import type { FileData } from "@/lib/Types/Types";
import { linkFiles } from "@/lib/server/linkFiles";
import { isFileOwner } from "@/lib/server/getFileOwnership";
import { EntryIdConflictError } from "@/lib/server/entryIdConflict";
import { sanitizeDisplayName } from "@/lib/server/uploadValidation";
import { LINQ_TYPE, DEFAULT_LINQ_NAME, isEntryUuid } from "@/lib/linqType";
import {
    MAX_CONNECT_MEMBERS,
    QuotaExceededError,
    assertCanAddFiles,
    quotaExceededResponse,
} from "@/lib/server/userQuota";

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

    const body = await request.json().catch(() => ({}));
    const file_ids = Array.isArray(body?.file_ids) ? body.file_ids : [];
    if (file_ids.length > MAX_CONNECT_MEMBERS) {
        return NextResponse.json(
            {
                okay: false,
                error: "Bad request",
                message: `file_ids must have at most ${MAX_CONNECT_MEMBERS} items`,
            },
            { status: 400 }
        );
    }
    const folderName = sanitizeDisplayName(String(body?.name ?? "")) || DEFAULT_LINQ_NAME;
    const clientBundleId =
        typeof body?.bundle_id === "string" ? body.bundle_id.trim() : "";

    for (const fileId of file_ids) {
        if (typeof fileId !== "string" || !isEntryUuid(fileId)) {
            return NextResponse.json(
                {
                    okay: false,
                    error: "Bad request",
                    message: "file_ids must be valid file ids",
                },
                { status: 400 }
            );
        }
        if (!(await isFileOwner(fileId, userId))) {
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

    const newLinq: FileData = {
        owner_id: userId,
        creator_id: userId,
        name: folderName,
        type: LINQ_TYPE,
        ...(clientBundleId ? { id: clientBundleId } : {}),
    };

    try {
        await assertCanAddFiles(userId, 1);
        const createdEntries = await createFile([newLinq], userId);
        const linqId = createdEntries[0].id;
        const links =
            file_ids.length > 0 ? await linkFiles(file_ids, linqId, userId) : [];

        return NextResponse.json(
            {
                okay: true,
                message: "Linq created",
                data: {
                    linq: createdEntries[0],
                    bundle: createdEntries[0],
                    links: links,
                },
            },
            { status: 200 }
        );
    } catch (err) {
        if (err instanceof QuotaExceededError) {
            return NextResponse.json(quotaExceededResponse(), { status: 429 });
        }
        if (err instanceof EntryIdConflictError) {
            return NextResponse.json(
                { okay: false, error: "Conflict", message: "Entry id already exists" },
                { status: 409 }
            );
        }
        throw err;
    }
}
