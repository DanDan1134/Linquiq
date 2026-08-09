"use server"
import { auth } from "@clerk/nextjs/server";
import { createFile } from "../createFile";
import type { FileData } from "../../Types/Types";
import { linkFiles } from "../linkFiles";
import { isFileOwner } from "../getFileOwnership";

const Bundle = async (file_ids: string[]) => {
    const { userId } = await auth();

    if (!userId) {
        throw new Error("Unauthorized");
    }

    if (!Array.isArray(file_ids) || file_ids.length === 0) {
        throw new Error("Bad request");
    }

    for (const fileId of file_ids) {
        if (typeof fileId !== "string" || !(await isFileOwner(fileId, userId))) {
            throw new Error("Forbidden");
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
