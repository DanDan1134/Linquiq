"use client"

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react"

export const FILE_TYPE_OPTIONS = [
    { label: "linq", value: "Bundle" },
    { label: "Document", value: "Document" },
    { label: "Note", value: "Note" },
    { label: "Recording", value: "Recording" },
    { label: "Image", value: "Image" },
] as const

export const TIME_OPTIONS = [
    { label: "Today", value: "today" },
    { label: "This Week", value: "week" },
    { label: "This Month", value: "month" },
    { label: "This Year", value: "year" },
] as const

export function getTimeStart(option: string): Date {
    const now = new Date()
    switch (option) {
        case "today": {
            const d = new Date(now)
            d.setHours(0, 0, 0, 0)
            return d
        }
        case "week": {
            const d = new Date(now)
            d.setDate(d.getDate() - d.getDay())
            d.setHours(0, 0, 0, 0)
            return d
        }
        case "month": {
            return new Date(now.getFullYear(), now.getMonth(), 1)
        }
        case "year": {
            return new Date(now.getFullYear(), 0, 1)
        }
        default:
            return new Date(0)
    }
}

export type FileListFilterContextValue = {
    filterTypes: Set<string>
    filterTime: string | null
    filterOpen: boolean
    setFilterOpen: (open: boolean | ((v: boolean) => boolean)) => void
    toggleType: (value: string) => void
    setFilterTime: (value: string | null) => void
    clearFilters: () => void
    hasActiveFilters: boolean
    filterRef: React.RefObject<HTMLDivElement | null>
}

const FileListFilterContext = createContext<FileListFilterContextValue | null>(null)

export function FileListFilterProvider({ children }: { children: ReactNode }) {
    const [filterTypes, setFilterTypes] = useState<Set<string>>(() => new Set())
    const [filterTime, setFilterTimeState] = useState<string | null>(null)
    const [filterOpen, setFilterOpen] = useState(false)
    const filterRef = useRef<HTMLDivElement>(null)

    const hasActiveFilters = filterTypes.size > 0 || filterTime !== null

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setFilterOpen(false)
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [])

    const toggleType = useCallback((value: string) => {
        setFilterTypes((prev) => {
            const next = new Set(prev)
            if (next.has(value)) next.delete(value)
            else next.add(value)
            return next
        })
    }, [])

    const setFilterTime = useCallback((value: string | null) => {
        setFilterTimeState(value)
    }, [])

    const clearFilters = useCallback(() => {
        setFilterTypes(new Set())
        setFilterTimeState(null)
    }, [])

    const value = useMemo<FileListFilterContextValue>(
        () => ({
            filterTypes,
            filterTime,
            filterOpen,
            setFilterOpen,
            toggleType,
            setFilterTime,
            clearFilters,
            hasActiveFilters,
            filterRef,
        }),
        [filterTypes, filterTime, filterOpen, toggleType, setFilterTime, clearFilters, hasActiveFilters]
    )

    return <FileListFilterContext.Provider value={value}>{children}</FileListFilterContext.Provider>
}

export function useFileListFilters(): FileListFilterContextValue {
    const ctx = useContext(FileListFilterContext)
    if (!ctx) {
        throw new Error("useFileListFilters must be used within FileListFilterProvider")
    }
    return ctx
}
