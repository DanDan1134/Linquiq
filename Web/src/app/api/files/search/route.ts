import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { entryTable, linkTable } from "@/db/schema"
import { s3Client, bucketName } from "@/lib/server/s3/module.s3client"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import {
  MAX_SEARCH_QUERY_CHARS,
  SEARCH_EXTRACT_MAX_CHARS,
} from "@/lib/server/uploadValidation"
import { MAX_SEARCH_CONTENT_JOBS } from "@/lib/server/userQuota"
import { isLinqType } from "@/lib/linqType"

// text-searchable file extensions
const TEXT_TYPES = ["txt", "text", "md"]
const MAX_CONCURRENT_S3_READS = 4

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

/** Prefer DB search extract; otherwise read at most SEARCH_EXTRACT_MAX_CHARS from S3. */
const fetchFileText = async (
    userId: string,
    fileKey: string,
    description: string | null | undefined
): Promise<string | null> => {
    if (description && String(description).trim() !== "") {
        return stripHtml(String(description)).slice(0, SEARCH_EXTRACT_MAX_CHARS)
    }
    try {
        const result = await s3Client.send(
            new GetObjectCommand({
                Bucket: bucketName,
                Key: `${userId}/${fileKey}`,
                Range: `bytes=0-${SEARCH_EXTRACT_MAX_CHARS - 1}`,
            })
        )
        if (!result.Body) return null
        const text = await result.Body.transformToString("utf-8")
        return stripHtml(text).slice(0, SEARCH_EXTRACT_MAX_CHARS)
    } catch {
        return null
    }
}

/** Simple concurrency pool for S3 reads. */
async function mapPool<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let next = 0
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (next < items.length) {
            const i = next++
            results[i] = await fn(items[i])
        }
    })
    await Promise.all(workers)
    return results
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

    if (q.length > MAX_SEARCH_QUERY_CHARS) {
        return NextResponse.json(
            {
                message: `Search query must be at most ${MAX_SEARCH_QUERY_CHARS} characters`,
            },
            { status: 400 }
        )
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

    // Collect text files that need content search (after name miss)
    type TextJob = {
        file: typeof allFiles[0]
        kind: "self" | "linq"
        child?: typeof allFiles[0]
    }
    const textJobs: TextJob[] = []

    for (const file of allFiles) {
        // 1) check file name
        if (file.name.toLowerCase().includes(queryLower)) {
            results.push({ file, matchedIn: "name", snippet: file.name })
            matchedIds.add(file.id)
            continue
        }

        // 2) queue text content check
        if (TEXT_TYPES.includes(file.type) && file.file_id) {
            textJobs.push({ file, kind: "self" })
            continue
        }

        // 3) check linq linked files (names first; queue text)
        if (isLinqType(file.type)) {
            const links = await db
                .select()
                .from(linkTable)
                .where(eq(linkTable.from_id, file.id))
                .innerJoin(entryTable, eq(linkTable.to_id, entryTable.id))

            let nameHit = false
            for (const link of links) {
                const child = link.entries
                if (child.name.toLowerCase().includes(queryLower)) {
                    results.push({
                        file,
                        matchedIn: "linked-content",
                        snippet: child.name,
                        matchedChildName: child.name,
                    })
                    matchedIds.add(file.id)
                    nameHit = true
                    break
                }
            }
            if (nameHit) continue

            for (const link of links) {
                const child = link.entries
                if (TEXT_TYPES.includes(child.type) && child.file_id) {
                    textJobs.push({ file, kind: "linq", child })
                }
            }
        }
    }

    // Cap concurrent S3 reads; prefer description extracts inside fetchFileText.
    const contentJobs = textJobs.slice(0, MAX_SEARCH_CONTENT_JOBS)
    const textHits = await mapPool(contentJobs, MAX_CONCURRENT_S3_READS, async (job) => {
        if (matchedIds.has(job.file.id)) return null
        if (job.kind === "self") {
            if (!job.file.file_id) return null
            const text = await fetchFileText(userId, job.file.file_id, job.file.description)
            if (!text) return null
            const snippet = getSnippet(text, q)
            if (!snippet) return null
            return {
                file: job.file,
                matchedIn: "content" as const,
                snippet,
            }
        }
        const child = job.child
        if (!child?.file_id) return null
        const text = await fetchFileText(userId, child.file_id, child.description)
        if (!text) return null
        const snippet = getSnippet(text, q)
        if (!snippet) return null
        return {
            file: job.file,
            matchedIn: "linked-content" as const,
            snippet,
            matchedChildName: child.name,
        }
    })

    for (const hit of textHits) {
        if (!hit) continue
        if (matchedIds.has(hit.file.id)) continue
        results.push(hit)
        matchedIds.add(hit.file.id)
    }

    return NextResponse.json({ data: results }, { status: 200 })
}
