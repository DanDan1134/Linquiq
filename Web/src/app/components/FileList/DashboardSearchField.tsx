"use client"

import { Search } from "lucide-react"
import { useDebouncedFileSearch } from "./useDebouncedFileSearch"

/** Search input for the top dashboard bar (Linquiq header). */
export function DashboardSearchField() {
    const { searchQuery, handleSearchChange } = useDebouncedFileSearch()

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flex: "0 1 50%",
                maxWidth: "50%",
                minWidth: 0,
            }}
        >
            <Search size={16} style={{ opacity: 0.5, flexShrink: 0 }} aria-hidden />
            <input
                type="search"
                placeholder="Search files..."
                value={searchQuery}
                onChange={handleSearchChange}
                style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "0.4rem 0.5rem",
                    border: "none",
                    borderRadius: "var(--border-rad)",
                    background: "rgba(255, 255, 255, 0.08)",
                    color: "var(--foreground)",
                    fontSize: "0.9rem",
                    outline: "none",
                }}
                autoComplete="off"
                aria-label="Search files"
            />
        </div>
    )
}
