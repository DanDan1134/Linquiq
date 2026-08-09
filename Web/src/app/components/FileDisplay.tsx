"use client"
import { useState } from "react";
import { FileType } from "@/app/components/TypeTags";
import type { entryTable } from "@/db/schema";
import { getDisplayFileName } from "@/lib/client/getFileType";

// type for the file data 
type EntryRow = typeof entryTable.$inferSelect;

// ensures that the file data is displayed correctly in the preview page by importing the file data from the database
export const FileData = ({ fileData }: { fileData: EntryRow | null | undefined }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const createdAt = fileData?.createdAt ? new Date(fileData.createdAt) : null
    const createdLocal = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleString() : "Unknown"
    const createdUtc = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString() : "Unknown"
    return (<div style={{display : "flex", flexDirection : "column", gap : isExpanded ? "1rem" : "0.5rem", width : "100%", padding : "0.75rem 1rem", boxSizing : "border-box", borderBottomLeftRadius : "var(--border-rad)", borderBottomRightRadius : "var(--border-rad)"}}>
        <div style={{display : "flex", flexDirection : "row", width : "100%", justifyContent : "space-between", alignItems : "center", gap: "0.5rem"}}>
                <div style={{fontSize : "2rem", whiteSpace : "nowrap", overflow : "hidden", textOverflow : "ellipsis"}}>{getDisplayFileName(fileData?.name, fileData?.type)}</div>
                <button
                    type="button"
                    onClick={() => setIsExpanded((prev) => !prev)}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? "Collapse file details" : "Expand file details"}
                    style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--foreground)",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                        padding: "0.35rem 0.5rem",
                        borderRadius: "0.5rem",
                        flexShrink: 0,
                    }}
                >
                    {isExpanded ? "Hide details" : "Show details"}
                </button>
            </div>
            {isExpanded && <div style={{display : "flex", flexDirection : "column", gap : "0.5rem"}}>
                {FileType(fileData?.type, true)}
                <span><span style={{fontWeight : "bold"}}>ID:</span> {fileData?.id}</span>
                <span><span style={{fontWeight : "bold"}}>Created:</span> {createdLocal}</span>
                <span><span style={{fontWeight : "bold"}}>UTC:</span> {createdUtc}</span>
                <span><span style={{fontWeight : "bold"}}>Creator:</span> {fileData?.creator_email}</span>
            </div>}
        </div>
    )}
