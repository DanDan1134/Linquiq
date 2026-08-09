"use client"

import { Filter } from "lucide-react"
import {
    FILE_TYPE_OPTIONS,
    TIME_OPTIONS,
    useFileListFilters,
} from "./fileListFilterContext"

/** Filter control for the dashboard header (to the right of search). */
export function DashboardFilterButton() {
    const {
        filterTypes,
        filterTime,
        filterOpen,
        setFilterOpen,
        toggleType,
        setFilterTime,
        clearFilters,
        hasActiveFilters,
        filterRef,
    } = useFileListFilters()

    return (
        <div ref={filterRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
                type="button"
                aria-label={filterOpen ? "Close filters" : "Open filters"}
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((v) => !v)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.25rem",
                    padding: "0.25rem",
                    border: "none",
                    background: "transparent",
                    color: hasActiveFilters ? "var(--bundle-color-2)" : "var(--foreground)",
                    cursor: "pointer",
                    outline: "none",
                }}
            >
                <Filter size={18} strokeWidth={2} aria-hidden />
                {hasActiveFilters && (
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: "var(--bundle-color-2)",
                            color: "var(--background)",
                            fontSize: "0.65rem",
                            fontWeight: "bold",
                        }}
                    >
                        {filterTypes.size + (filterTime ? 1 : 0)}
                    </span>
                )}
            </button>

            {filterOpen && (
                <div
                    style={{
                        position: "absolute",
                        top: "calc(100% + 0.4rem)",
                        right: 0,
                        zIndex: 1200,
                        background: "var(--accent-color)",
                        border: "1px solid var(--foreground)",
                        borderRadius: "var(--border-rad)",
                        padding: "0.75rem",
                        minWidth: "180px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.6rem",
                        boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
                    }}
                >
                    <div
                        style={{
                            fontSize: "0.75rem",
                            opacity: 0.55,
                            fontWeight: "bold",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                        }}
                    >
                        File Type
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        {FILE_TYPE_OPTIONS.map((opt) => (
                            <label
                                key={opt.value}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    cursor: "pointer",
                                    fontSize: "0.9rem",
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={filterTypes.has(opt.value)}
                                    onChange={() => toggleType(opt.value)}
                                    style={{ accentColor: "var(--bundle-color-2)", cursor: "pointer" }}
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>

                    <div style={{ height: "1px", background: "rgba(255,255,255,0.12)" }} />

                    <div
                        style={{
                            fontSize: "0.75rem",
                            opacity: 0.55,
                            fontWeight: "bold",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                        }}
                    >
                        Time Range
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        {TIME_OPTIONS.map((opt) => (
                            <label
                                key={opt.value}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    cursor: "pointer",
                                    fontSize: "0.9rem",
                                }}
                            >
                                <input
                                    type="radio"
                                    name="filter-time-dashboard"
                                    checked={filterTime === opt.value}
                                    onChange={() =>
                                        setFilterTime(filterTime === opt.value ? null : opt.value)
                                    }
                                    onClick={() => {
                                        if (filterTime === opt.value) setFilterTime(null)
                                    }}
                                    style={{ accentColor: "var(--bundle-color-2)", cursor: "pointer" }}
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>

                    {hasActiveFilters && (
                        <>
                            <div style={{ height: "1px", background: "rgba(255,255,255,0.12)" }} />
                            <button
                                type="button"
                                onClick={clearFilters}
                                style={{
                                    background: "transparent",
                                    border: "1px solid var(--foreground)",
                                    color: "var(--foreground)",
                                    borderRadius: "var(--border-rad)",
                                    padding: "0.3rem 0.5rem",
                                    cursor: "pointer",
                                    fontSize: "0.8rem",
                                    opacity: 0.7,
                                }}
                            >
                                Clear filters
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
