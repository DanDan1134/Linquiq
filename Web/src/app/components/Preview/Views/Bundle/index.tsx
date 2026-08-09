"use client"

import type { CSSProperties } from "react"
import type { entryTable } from "@/db/schema";
import type { FileUrlResult } from "@/lib/server/getFileUrl";
import { useFileStore } from "@/app/components/State Manager/appManager";
import { getFileType, getDisplayFileName } from "@/lib/client/getFileType";
import { FileType } from "@/app/components/TypeTags";
import { useEffect, useMemo, useRef, useState } from "react";
import { getViewerDetails } from "docviewhelper";
import { Copy, Check } from "lucide-react";
import { sanitizeHtml } from "@/lib/client/sanitizeHtml";

const formatCreatedAt = (value: unknown) => {
    if (!value) return "Unknown"
    const d = new Date(String(value))
    return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleString()
}

const formatCreatedUtc = (value: unknown) => {
    if (!value) return "Unknown"
    const d = new Date(String(value))
    return Number.isNaN(d.getTime()) ? "Unknown" : d.toISOString()
}

type EntryRow = typeof entryTable.$inferSelect

const NoteView = ({fileUrl}: {fileUrl: string}) => {
    const [fileSrc, setFileSrc] = useState<string | undefined>(undefined)
    useEffect(()=>{
        const GetFileSrc = async () => {
            const text = await (await fetch(fileUrl)).text()
            setFileSrc(sanitizeHtml(text))
        }
        GetFileSrc()
    }, [fileUrl])

    if (!fileSrc) return <div style={{ fontSize: "0.8rem", opacity: 0.6 }}>Loading...</div>
    return (
        <div
            dangerouslySetInnerHTML={{ __html: fileSrc }}
            style={{ fontSize: "0.9rem", background: "#1f2937", borderRadius: "var(--border-rad)", padding: "0.75rem", width: "100%", boxSizing: "border-box", overflowWrap: "anywhere" }}
        />
    )
}


// renders inline content for a single linked file based on its type
const documentIframeStyle: CSSProperties = {
    width: "100%",
    aspectRatio: "1/1.1",
    borderRadius: "var(--border-rad)",
    objectFit: "contain",
    border: "none",
}

const InlineContent = ({ file, url }: { file: EntryRow; url?: string }) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const safeUrl = typeof url === "string" && url.trim() !== "" ? url : undefined
    const googleViewerSrc = useMemo(() => {
        if (!safeUrl) return null
        const { url: viewerUrl, externalViewer } = getViewerDetails(safeUrl, "google", "hl=Nl", "")
        return externalViewer && viewerUrl.trim() !== "" ? viewerUrl : null
    }, [safeUrl])

    switch (getFileType(file.type)) {
        case "Document":
            if (!safeUrl || !googleViewerSrc) {
                return <div style={{ fontSize: "0.8rem", opacity: 0.6 }}>Loading...</div>
            }
            return (
                <iframe
                    title="Document preview"
                    src={googleViewerSrc}
                    style={documentIframeStyle}
                />
            )
        case "Image":
            if (!safeUrl) return <div style={{ fontSize: "0.8rem", opacity: 0.6 }}>Loading...</div>
            return <img src={safeUrl} width="100%" alt="" style={{ borderRadius: "var(--border-rad)", objectFit: "contain" }} />
        case "Recording":
            if (!safeUrl) return <div style={{ fontSize: "0.8rem", opacity: 0.6 }}>Loading...</div>
            return <video ref={videoRef} src={safeUrl} controls width="100%" style={{ borderRadius: "var(--border-rad)" }} />
        case "Note":
            if (!safeUrl) return <div style={{ fontSize: "0.8rem", opacity: 0.6 }}>Loading...</div>
            return <NoteView fileUrl={safeUrl} />
        default:
            return null
    }
}


// card for a single linked file, showing metadata + inline content
const LinkedFileCard = ({ file, url }: { file: EntryRow; url?: string }) => {
    const [copied, setCopied] = useState(false)
    const previewPath = `/preview/${file.id}`
    const previewUrl = typeof window !== "undefined"
        ? `${window.location.origin}${previewPath}`
        : previewPath
    const displayName = getDisplayFileName(file.name, file.type)

    const copyUrl = async () => {
        await navigator.clipboard.writeText(previewUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <div style={{
            background: "#374151",
            borderRadius: "var(--border-rad)",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            boxSizing: "border-box",
            overflow: "hidden",
        }}>
            {/* type badge + name */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", minWidth: 0 }}>
                {FileType(file.type, true, false)}
                <span style={{ fontWeight: "bold", fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                    {displayName}
                </span>
            </div>

            {/* metadata */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.8rem", opacity: 0.85, width: "100%", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0, width: "100%" }}>
                    <strong style={{ flexShrink: 0 }}>URL:</strong>
                    <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--foreground)", opacity: 0.75, minWidth: 0, flex: 1 }}
                    >
                        {previewUrl}
                    </a>
                    <button
                        onClick={copyUrl}
                        title="Copy URL"
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--foreground)", padding: "0.1rem 0.3rem", display: "flex", alignItems: "center", flexShrink: 0 }}
                    >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                </div>
                <span><strong>Created:</strong> {formatCreatedAt(file.createdAt)}</span>
                <span><strong>UTC:</strong> {formatCreatedUtc(file.createdAt)}</span>
                <span style={{ overflowWrap: "anywhere" }}><strong>Creator:</strong> {file.creator_email}</span>
                <span style={{ overflowWrap: "anywhere" }}><strong>ID:</strong> {file.id}</span>
            </div>

            {/* inline content preview */}
            <InlineContent file={file} url={url} />
        </div>
    )
}


function isEntryRow(data: unknown): data is EntryRow {
    return typeof data === "object" && data !== null && "id" in data && "type" in data
}

const Bundle = ({ bundle_data }: { bundle_data: FileUrlResult[] | undefined }) => {
    // layoutState kept in scope for future video play/pause logic per card
    useFileStore((state)=>state.layoutState)

    return (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {bundle_data?.map((item, index) => (
                isEntryRow(item.data)
                    ? <LinkedFileCard key={item.data.id ?? index} file={item.data} url={item.url} />
                    : null
            ))}
        </div>
    )
}

export default Bundle;
