import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { entryTable, linkTable } from "@/db/schema"
import { genPresignedUrl } from "@/lib/server/s3/module.genPresignedUrl"


// text-searchable file extensions
const TEXT_TYPES = ["txt", "text", "md"]

// strips HTML tags from content
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ")

// returns ~80 chars of context around the first match
const getSnippet = (content: string, query: string): string | null => {
    const lower = content.toLowerCase()
    const idx = lower.indexOf(query.toLowerCase())
    if (idx === -1) return null

    const start = Math.max(0, idx - 40)
    const end = Math.min(content.length, idx + query.length + 40)
    const prefix = start > 0 ? "..." : ""
    const suffix = end < content.length ? "..." : ""

    return prefix + content.slice(start, end) + suffix
}

// fetches text content from S3 via presigned URL
const fetchFileText = async (userId: string, fileKey: string): Promise<string | null> => {
    try {
        const url = await genPresignedUrl({ profile_id: userId, key: fileKey, method: "GET", expirationInSec: 60 })
        const res = await fetch(url)
        if (!res.ok) return null
        const text = await res.text()
        return stripHtml(text)
    } catch {
        return null
    }
}


export async function GET(request: NextRequest) {
    const { userId } = await auth()

    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    // pull query from ?q=
    const q = request.nextUrl.searchParams.get("q")?.trim()

    if (!q || q.length === 0) {
        return NextResponse.json({ message: "Missing search query" }, { status: 400 })
    }

    const queryLower = q.toLowerCase()

    // grab all files owned by this user
    const allFiles = await db.select().from(entryTable).where(
        eq(entryTable.owner_id, userId)
    )

    type SearchResult = {
        file: typeof allFiles[0],
        matchedIn: "name" | "content" | "linked-content",
        snippet: string | null,
        matchedChildName?: string
    }

    const results: SearchResult[] = []
    const matchedIds = new Set<string>()

    for (const file of allFiles) {
        // 1) check file name
        if (file.name.toLowerCase().includes(queryLower)) {
            results.push({ file, matchedIn: "name", snippet: file.name })
            matchedIds.add(file.id)
            continue
        }

        // 2) check file content (text files only)
        if (TEXT_TYPES.includes(file.type) && file.file_id) {
            const text = await fetchFileText(userId, file.file_id)
            if (text) {
                const snippet = getSnippet(text, q)
                if (snippet) {
                    results.push({ file, matchedIn: "content", snippet })
                    matchedIds.add(file.id)
                    continue
                }
            }
        }

        // 3) check bundle linked files
        if (file.type.toLowerCase() === "bundle") {
            const links = await db
                .select()
                .from(linkTable)
                .where(eq(linkTable.from_id, file.id))
                .innerJoin(entryTable, eq(linkTable.to_id, entryTable.id))

            for (const link of links) {
                const child = link.entries

                // check child name
                if (child.name.toLowerCase().includes(queryLower)) {
                    if (!matchedIds.has(file.id)) {
                        results.push({ file, matchedIn: "linked-content", snippet: child.name, matchedChildName: child.name })
                        matchedIds.add(file.id)
                    }
                    break
                }

                // check child text content
                if (TEXT_TYPES.includes(child.type) && child.file_id) {
                    const text = await fetchFileText(userId, child.file_id)
                    if (text) {
                        const snippet = getSnippet(text, q)
                        if (snippet) {
                            if (!matchedIds.has(file.id)) {
                                results.push({ file, matchedIn: "linked-content", snippet, matchedChildName: child.name })
                                matchedIds.add(file.id)
                            }
                            break
                        }
                    }
                }
            }
        }
    }

    return NextResponse.json({ data: results }, { status: 200 })
}
