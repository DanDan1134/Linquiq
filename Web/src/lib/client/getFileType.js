"use client"

import { isLinqType, isGenericLinqName, resolveLinqDisplayName } from "@/lib/linqType";

export const getFileType = (fileType) => {
    if (!fileType) return "Linq";
    const raw = String(fileType).toLowerCase();
    if (isLinqType(raw)) return "Linq";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(raw)) return "Image";
    if (["mp4", "webm", "ogg", "mp3", "wav"].includes(raw)) return "Recording";
    if (["pdf", "doc", "docx", "xls", "xlsx", "pptx"].includes(raw))
        return "Document";
    if (["txt", "text", "md"].includes(raw)) return "Note";
    return "Linq";
};

/** Title shown in lists and previews: linq for linq rows, no extension for notes. */
export const getDisplayFileName = (name, type) => {
    if (name == null || name === "") return name;
    if (isLinqType(type) || isGenericLinqName(name)) return resolveLinqDisplayName(name);
    if (getFileType(type) === "Note") return name.replace(/\.(txt|md|text)$/i, "");
    return name;
};

export { isLinqType, isGenericLinqName, resolveLinqDisplayName, DEFAULT_LINQ_NAME };
