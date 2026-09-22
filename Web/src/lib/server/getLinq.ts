"use server";
import { auth } from "@clerk/nextjs/server";
import type { entryTable } from "@/db/schema";
import { isLinqType } from "@/lib/linqType";
import { getFileDataForUser } from "./getFileData";
import { getFileUrl } from "./getFileUrl";
import { getLinks } from "./getLinks";

type EntryRow = typeof entryTable.$inferSelect;

export type LinqMember = {
  url: string | undefined;
  data: EntryRow | null;
  /** Present when `data` is itself a linq — its members, resolved recursively. */
  children?: LinqMember[];
};

/**
 * Linq members for the authenticated session user only.
 * Recurses into nested linqs so one call resolves the whole tree.
 */
export const getLinq = async (
  file_id: string,
  _visited: Set<string> = new Set()
): Promise<LinqMember[]> => {
  const { userId } = await auth();
  if (!userId) {
    return [];
  }
  if (_visited.has(file_id)) {
    return [];
  }
  _visited.add(file_id);

  const linked_files = await getLinks(file_id);
  const files_data: LinqMember[] = [];

  await Promise.all(
    linked_files.map(async (file: { entries: EntryRow }) => {
      const owned = await getFileDataForUser(file.entries.id, userId);
      if (!owned) return;

      if (isLinqType(owned.type)) {
        const children = await getLinq(owned.id, _visited);
        files_data.push({ url: undefined, data: owned, children });
        return;
      }

      const file_url = await getFileUrl(owned, true);
      files_data.push({
        url: file_url?.[0]?.url,
        data: owned,
      });
    })
  );
  return files_data;
};

/** @deprecated Use getLinq */
export const getBundle = getLinq;
