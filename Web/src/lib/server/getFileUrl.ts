"use server"
import { auth } from "@clerk/nextjs/server"
import { genPresignedUrl } from "./s3/module.genPresignedUrl"
import { getLinq } from "./getLinq";
import { isFileOwner } from "./getFileOwnership";
import { isLinqType } from "@/lib/linqType";

/** Minimal shape for presign + linq branching; accepts DB rows or client file objects */
export type FileUrlSource = {
    id: string
    file_id: string | null
    type: string
}

export type FileUrlResult = { url: string | undefined; data: unknown; children?: FileUrlResult[] }

export const getFileUrl = async (file: FileUrlSource, is_linq_child: boolean): Promise<FileUrlResult[] | undefined> => {
    const {userId} = await auth()

    if(!userId) {
        return undefined;
    }

    if (!(await isFileOwner(file.id, userId))) {
        return undefined;
    }

    if (isLinqType(file.type) && !is_linq_child) {
        const linq_contents = await getLinq(file.id)
        return linq_contents
    }

    if (!file.file_id) {
        return undefined
    }

    const url = await genPresignedUrl({profile_id: userId, key: file.file_id, method: "GET", expirationInSec: 300});

    if(url){
        return [{url: url, data: file}];
    }

    return undefined;
}
