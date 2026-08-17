"use server"
import { auth } from "@clerk/nextjs/server";
import { createFile } from "../createFile";
import type { FileData } from "../../Types/Types";
import { linkFiles } from "../linkFiles";
import { isFileOwner } from "../getFileOwnership";

const Bundle = async (file_ids: string[], name?: string) => {
    const { userId } = await auth();

    if (!userId) {
        throw new Error("Unauthorized");
    }

    const ids = Array.isArray(file_ids) ? file_ids : [];
    const folderName = String(name ?? "").trim().slice(0, 80) || "Untitled linq";

    for (const fileId of ids) {
        if (typeof fileId !== "string" || !(await isFileOwner(fileId, userId))) {
            throw new Error("Forbidden");
        }
    }

    const newBundle: FileData = {
        owner_id: userId,
        creator_id: userId,
        name: folderName,
        type: "Link",
    };

    const createdEntries = await createFile([newBundle], userId);
    const links =
        ids.length > 0 ? await linkFiles(ids, createdEntries[0].id, userId) : [];

    return {
        bundle: createdEntries[0],
        links: links,
    } as {
        bundle: FileData;
        links: {
            to_id: string;
            from_id: string;
        }[];
    };
};

export default Bundle;
