"use server";
import { auth } from "@clerk/nextjs/server";
import { createFile } from "../createFile";
import type { FileData } from "../../Types/Types";
import { linkFiles } from "../linkFiles";
import { isFileOwner } from "../getFileOwnership";
import { LINQ_TYPE, DEFAULT_LINQ_NAME } from "@/lib/linqType";

const createLinq = async (file_ids: string[], name?: string) => {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const ids = Array.isArray(file_ids) ? file_ids : [];
  const folderName = String(name ?? "").trim().slice(0, 80) || DEFAULT_LINQ_NAME;

  for (const fileId of ids) {
    if (typeof fileId !== "string" || !(await isFileOwner(fileId, userId))) {
      throw new Error("Forbidden");
    }
  }

  const newLinq: FileData = {
    owner_id: userId,
    creator_id: userId,
    name: folderName,
    type: LINQ_TYPE,
  };

  const createdEntries = await createFile([newLinq], userId);
  const links =
    ids.length > 0 ? await linkFiles(ids, createdEntries[0].id, userId) : [];

  const linq = createdEntries[0];
  return {
    linq,
    /** @deprecated Prefer `linq` */
    bundle: linq,
    links,
  } as {
    linq: FileData;
    bundle: FileData;
    links: {
      to_id: string;
      from_id: string;
    }[];
  };
};

export default createLinq;
