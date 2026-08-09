"use client"

import { useCallback, useRef } from "react"
import { useFileStore } from "../State Manager/appManager"

/** Owns debounced /api/files/search — mount in exactly one place (e.g. dashboard header). */
export function useDebouncedFileSearch() {
    const searchQuery = useFileStore((state) => state.searchQuery)
    const SetSearchQuery = useFileStore((state) => state.SetSearchQuery)
    const SetSearchResults = useFileStore((state) => state.SetSearchResults)

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const searchGenRef = useRef(0)

    const runSearch = useCallback(
        (query: string) => {
            if (debounceRef.current) clearTimeout(debounceRef.current)

            if (!query.trim()) {
                SetSearchResults(null)
                return
            }

            debounceRef.current = setTimeout(async () => {
                const g = searchGenRef.current
                const q = query.trim()
                useFileStore.setState({ searchLoading: true })
                try {
                    const res = await fetch(`/api/files/search?q=${encodeURIComponent(q)}`)
                    const { data } = await res.json()
                    if (g !== searchGenRef.current) return
                    const current = useFileStore.getState().searchQuery.trim()
                    if (current !== q) return
                    SetSearchResults(data)
                } catch {
                    if (g !== searchGenRef.current) return
                    const current = useFileStore.getState().searchQuery.trim()
                    if (current !== q) return
                    SetSearchResults(null)
                } finally {
                    if (g === searchGenRef.current) {
                        useFileStore.setState({ searchLoading: false })
                    }
                }
            }, 400)
        },
        [SetSearchResults]
    )

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        searchGenRef.current += 1
        SetSearchQuery(val)
        if (val.trim()) {
            SetSearchResults(null)
            useFileStore.setState({ searchLoading: false })
        }
        runSearch(val)
    }

    const clearSearch = () => {
        SetSearchQuery("")
        SetSearchResults(null)
    }

    return { searchQuery, handleSearchChange, clearSearch }
}
