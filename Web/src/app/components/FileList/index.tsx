"use client"
import { useEffect, useMemo, useRef, useCallback, useState } from "react"
import { useFileStore } from "../State Manager/appManager"
import { VerticalDiv } from "../UILayout"
import { FileItem } from "@/app/components/FileItem"
import { ChevronUp, ChevronDown, X } from "lucide-react"
import Box from "@mui/material/Box"
import LinearProgress from "@mui/material/LinearProgress"
import { getFileType, getDisplayFileName } from "@/lib/client/getFileType"
import {
    FILE_TYPE_OPTIONS,
    TIME_OPTIONS,
    getTimeStart,
    useFileListFilters,
} from "./fileListFilterContext"
import { LinqButton } from "@/app/components/LinqButton"

const SEARCH_SUMMARY_CAP = 5

export const FilesList = () => {
    const files = useFileStore((state)=>state.files)
    const SetFiles = useFileStore((state)=>state.SetFiles)
    const layout = useFileStore((state)=>state.layoutState)

    const searchQuery = useFileStore((state)=>state.searchQuery)
    const searchResults = useFileStore((state)=>state.searchResults)
    const searchLoading = useFileStore((state)=>state.searchLoading)
    const actionLoading = useFileStore((state)=>state.actionLoading)
    const actionLabel = useFileStore((state)=>state.actionLabel)
    const SetPreviewedFile = useFileStore((state) => state.SetPreviewedFile)
    const SetLayoutState = useFileStore((state) => state.SetLayoutState)

    const {
        filterTypes,
        filterTime,
        filterOpen,
        toggleType,
        setFilterTime,
        hasActiveFilters,
    } = useFileListFilters()

    /** Last row clicked without Shift — anchor for shift+click range selection */
    const selectionAnchorRef = useRef<string | null>(null)

    // asc = oldest at top → newest at bottom (ChevronDown active); desc = newest at top (ChevronUp active)
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
    const [searchSummaryExpanded, setSearchSummaryExpanded] = useState(false)

    useEffect(() => {
        setSearchSummaryExpanded(false)
    }, [searchQuery, searchResults])

    useEffect(()=>{
        const getFiles = async () => {
            const response = await fetch("/api/files/")
            const {data} = await response.json()
            SetFiles(data)
            console.log(data)
        }

        getFiles()
    }, [SetFiles])

    const sortedFiles = useMemo(() => {
        return Array.from(files.values()).sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime()
            const dateB = new Date(b.createdAt).getTime()
            return sortOrder === "asc" ? dateA - dateB : dateB - dateA
        })
    }, [files, sortOrder])

    const isSearchActive = searchQuery.trim().length > 0

    // base list: search results or all sorted files (null results while query is changing = show nothing, not stale rows)
    const baseFiles = useMemo(() => {
        if (!isSearchActive) return sortedFiles
        if (searchResults === null) return []
        const fromSearch = searchResults.map((r) => r.file)
        return [...fromSearch].sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime()
            const dateB = new Date(b.createdAt).getTime()
            return sortOrder === "asc" ? dateA - dateB : dateB - dateA
        })
    }, [isSearchActive, searchResults, sortedFiles, sortOrder])

    // apply type + time filters on top of base list
    const displayFiles = useMemo(() => {
        let result = baseFiles
        if (filterTypes.size > 0) {
            result = result.filter(f => filterTypes.has(getFileType(f.type)))
        }
        if (filterTime) {
            const cutoff = getTimeStart(filterTime).getTime()
            result = result.filter(f => new Date(f.createdAt).getTime() >= cutoff)
        }
        return result
    }, [baseFiles, filterTypes, filterTime])

    const searchSummaryRows = useMemo(() => {
        if (!searchResults?.length) return []
        if (searchSummaryExpanded || searchResults.length <= SEARCH_SUMMARY_CAP) return searchResults
        return searchResults.slice(0, SEARCH_SUMMARY_CAP)
    }, [searchResults, searchSummaryExpanded])

    const searchSummaryHasMore = (searchResults?.length ?? 0) > SEARCH_SUMMARY_CAP
    const searchSummaryHiddenCount =
        searchResults && searchResults.length > SEARCH_SUMMARY_CAP
            ? searchResults.length - SEARCH_SUMMARY_CAP
            : 0

    const handleListCheckboxChange = useCallback(
        (payload: { fileId: string; rowIndex: number; shiftKey: boolean; checked: boolean }) => {
            const { fileId, rowIndex, shiftKey, checked } = payload
            const { SelectFile, SetSelectionForIds } = useFileStore.getState()

            if (shiftKey && selectionAnchorRef.current !== null) {
                const anchorId = selectionAnchorRef.current
                const anchorIndex = displayFiles.findIndex((f) => f.id === anchorId)
                if (anchorIndex === -1) {
                    SelectFile(fileId, checked)
                    selectionAnchorRef.current = fileId
                    return
                }
                const lo = Math.min(anchorIndex, rowIndex)
                const hi = Math.max(anchorIndex, rowIndex)
                const ids = displayFiles.slice(lo, hi + 1).map((f) => f.id)
                SetSelectionForIds(ids, checked)
            } else {
                SelectFile(fileId, checked)
                selectionAnchorRef.current = fileId
            }
        },
        [displayFiles]
    )

    return(
        <VerticalDiv
            style={{
                padding: "1rem",
                height: "100%",
                minHeight: 0,
                minWidth: 0,
                flex: "1 1 auto",
                overscrollBehaviorY: "none",
                scrollbarGutter: "stable",
            }}
            color="var(--accent-color)"
            padding="0rem"
            gap="0.5rem"
        >

            {/* search status */}
            {searchLoading && <span className="filelist-search-meta">Searching…</span>}
            {isSearchActive && searchResults && searchResults.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", marginBottom: "0.4rem" }}>
                    {searchSummaryRows.map((r) => {
                        const displayName = getDisplayFileName(r.file.name, r.file.type)
                        return (
                            <div
                                key={`${r.file.id}-${r.matchedIn}-${r.matchedChildName ?? ""}-${r.snippet ?? ""}`}
                                className="filelist-search-hit-row"
                            >
                                <span className="filelist-search-hit-query">
                                    &quot;{searchQuery.trim()}&quot; in{" "}
                                </span>
                                <button
                                    type="button"
                                    className="filelist-search-hit-name"
                                    onClick={() => {
                                        SetPreviewedFile(r.file)
                                        SetLayoutState(1)
                                    }}
                                    aria-label={`Open preview for ${displayName ?? "file"}`}
                                >
                                    {displayName}
                                </button>
                            </div>
                        )
                    })}
                    {searchSummaryHasMore && (
                        <button
                            type="button"
                            className="filelist-search-more"
                            onClick={() => setSearchSummaryExpanded((v) => !v)}
                            aria-label={
                                searchSummaryExpanded
                                    ? "Show fewer search results"
                                    : `Show ${searchSummaryHiddenCount} more search results`
                            }
                        >
                            {searchSummaryExpanded ? "see less" : `see ${searchSummaryHiddenCount} more`}
                        </button>
                    )}
                </div>
            )}

            {/* empty search state */}
            {isSearchActive && searchResults && searchResults.length === 0 && !searchLoading && (
                <div className="filelist-search-meta" style={{ padding: "0.25rem 0" }}>
                    No matches for &quot;{searchQuery.trim()}&quot;.
                </div>
            )}

            {/* active filter summary */}
            {hasActiveFilters && !filterOpen && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", alignItems: "center" }}>
                    {Array.from(filterTypes).map(t => (
                        <span key={t} style={{
                            display: "inline-flex", alignItems: "center", gap: "0.25rem",
                            fontSize: "0.75rem", padding: "0.15rem 0.45rem",
                            borderRadius: "999px", background: "rgba(255,255,255,0.1)",
                            border: "1px solid var(--bundle-color-2)",
                            color: "var(--bundle-color-2)",
                        }}>
                            {FILE_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t}
                            <button onClick={() => toggleType(t)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, lineHeight: 1, display: "flex" }}><X size={10} /></button>
                        </span>
                    ))}
                    {filterTime && (
                        <span style={{
                            display: "inline-flex", alignItems: "center", gap: "0.25rem",
                            fontSize: "0.75rem", padding: "0.15rem 0.45rem",
                            borderRadius: "999px", background: "rgba(255,255,255,0.1)",
                            border: "1px solid var(--bundle-color-2)",
                            color: "var(--bundle-color-2)",
                        }}>
                            {TIME_OPTIONS.find(o => o.value === filterTime)?.label}
                            <button onClick={() => setFilterTime(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, lineHeight: 1, display: "flex" }}><X size={10} /></button>
                        </span>
                    )}
                </div>
            )}

            <div className={"row header"}>
                <div className={"column header"} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <LinqButton compact />
                </div>
                <div className={"column header"}>View:</div>
                <div
                    className={"column header"}
                    onClick={() => setSortOrder(o => o === "desc" ? "asc" : "desc")}
                    style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: "0.25rem" }}
                >
                    When:
                    <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                        <ChevronUp
                            size={11}
                            aria-hidden
                            style={{
                                marginBottom: "-2px",
                                color: sortOrder === "desc" ? "var(--bundle-color-2)" : "var(--foreground)",
                                opacity: sortOrder === "desc" ? 1 : 0.55,
                            }}
                        />
                        <ChevronDown
                            size={11}
                            aria-hidden
                            style={{
                                color: sortOrder === "asc" ? "var(--bundle-color-2)" : "var(--foreground)",
                                opacity: sortOrder === "asc" ? 1 : 0.55,
                            }}
                        />
                    </span>
                </div>
                <div className={"column header"} style={{ display : "flex", flex : "row"}}><div className={layout == 0 ? "spacer" : "spacer small"}/><span>Type:</span></div>
                <div className={"column header"}>Who:</div>
                <div className={"column header"}>What:</div>
            </div>

            <VerticalDiv style={{gap: "0.25rem"}} padding="0rem">
                {displayFiles.map((file, rowIndex) => (
                    <FileItem
                        key={file.id}
                        file={file}
                        rowIndex={rowIndex}
                        onCheckboxChange={handleListCheckboxChange}
                    />
                ))}
            </VerticalDiv>
            {actionLoading && (
                <div style={{ width: "100%", marginTop: "0.25rem" }}>
                    <Box sx={{ width: "100%" }}>
                        <LinearProgress
                            sx={{
                                height: 4,
                                borderRadius: 0,
                                backgroundColor: "rgba(255,255,255,0.08)",
                                "& .MuiLinearProgress-bar": {
                                    backgroundColor: "var(--bundle-color-2)",
                                },
                            }}
                        />
                    </Box>
                    {actionLabel && (
                        <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>{actionLabel}</span>
                    )}
                </div>
            )}
        </VerticalDiv>
    )
}
