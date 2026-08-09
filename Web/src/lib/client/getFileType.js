"use client"

export const getFileType = (fileType) => {
    if (!fileType) return "Bundle";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(fileType)) return "Image";
    if (["mp4", "webm", "ogg", "mp3", "wav"].includes(fileType)) return "Recording";
    if (["pdf", "doc", "docx", "xls", "xlsx", "pptx"].includes(fileType))
        return "Document";
    if (["txt", "text", "md"].includes(fileType)) return "Note";
    return "Bundle";
};

/** Title shown in lists and previews: linq for bundles, no extension for notes. */
export const getDisplayFileName = (name, type) => {
    if (name == null || name === "") return name;
    if (name === "Bundle") return "linq";
    if (getFileType(type) === "Note") return name.replace(/\.(txt|md|text)$/i, "");
    return name;
};
