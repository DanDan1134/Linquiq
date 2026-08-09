"use server"
import { auth } from "@clerk/nextjs/server"
import { genPresignedUrl } from "./s3/module.genPresignedUrl"
import { getBundle } from "./getBundle";
import { isFileOwner } from "./getFileOwnership";

/** Minimal shape for presign + bundle branching; accepts DB rows or client file objects */
export type FileUrlSource = {
    id: string
    file_id: string | null
    type: string
}

export type FileUrlResult = { url: string | undefined; data: unknown }

export const getFileUrl = async (file: FileUrlSource, is_bundle: boolean): Promise<FileUrlResult[] | undefined> => {
    const {userId} = await auth()

    if(!userId) {
        return undefined;
    }

    if (!(await isFileOwner(file.id, userId))) {
        return undefined;
    }

    if (file.type.toLowerCase() === "bundle" && !is_bundle) {
        const bundle_contents = await getBundle(file.id)
        return bundle_contents
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