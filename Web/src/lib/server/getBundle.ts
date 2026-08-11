"use server"
import { auth } from "@clerk/nextjs/server"
import type { entryTable } from "@/db/schema"
import { getFileDataForUser } from "./getFileData"
import { getFileUrl } from "./getFileUrl"
import { getLinks } from "./getLinks"

type EntryRow = typeof entryTable.$inferSelect

export type BundleMember = {
    url: string | undefined
    data: EntryRow | null
    /** Present only when `data` is itself a Linq — its own members, resolved the same way. */
    children?: BundleMember[]
}

/**
 * Bundle members for the authenticated session user only.
 * Recurses into nested Linqs (Linq -> Linq -> Linq, unlimited depth) so a
 * single call resolves the whole tree — matches the mobile app's recursive
 * `runPhaseB` hydration instead of stopping after one level.
 * `_visited` guards against a Linq accidentally linking back to an ancestor.
 */
export const getBundle = async (
    file_id: string,
    _visited: Set<string> = new Set()
): Promise<BundleMember[]> => {
    const { userId } = await auth()
    if (!userId) {
        return []
    }
    if (_visited.has(file_id)) {
        return []
    }
    _visited.add(file_id)

    const linked_files = await getLinks(file_id)

    const files_data: BundleMember[] = []

    await Promise.all(
        linked_files.map(async (file: { entries: EntryRow }) => {
            const owned = await getFileDataForUser(file.entries.id, userId)
            if (!owned) return

            if (String(owned.type ?? "").toLowerCase() === "bundle") {
                const children = await getBundle(owned.id, _visited)
                files_data.push({ url: undefined, data: owned, children })
                return
            }

            const file_url = await getFileUrl(owned, true)
            files_data.push({
                url: file_url?.[0]?.url,
                data: owned,
            })
        })
    )
    return files_data
}
