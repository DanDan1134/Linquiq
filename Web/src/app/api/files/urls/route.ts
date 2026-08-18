import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { entryTable } from "@/db/schema";
import { genPresignedUrl } from "@/lib/server/s3/module.genPresignedUrl";

const MAX_IDS = 40;

/**
 * POST /api/files/urls
 * Body: { ids: string[] }
 * Returns: { urls: Record<string, string> } — missing/unauthorized ids omitted.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const idsFromBody =
    body && typeof body === "object" && "ids" in body
      ? (body as { ids?: unknown }).ids
      : undefined;
  const rawIds = Array.isArray(idsFromBody) ? idsFromBody : [];
  const ids = [
    ...new Set(
      rawIds
        .map((id: unknown) => String(id ?? "").trim())
        .filter((id: string) => id.length > 0 && !id.startsWith("opt-"))
    ),
  ].slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ urls: {} }, { status: 200 });
  }

  const rows = await db
    .select({
      id: entryTable.id,
      file_id: entryTable.file_id,
      type: entryTable.type,
    })
    .from(entryTable)
    .where(and(eq(entryTable.owner_id, userId), inArray(entryTable.id, ids)));

  const urls: Record<string, string> = {};
  await Promise.all(
    rows.map(async (row) => {
      const s3Key = String(row.file_id ?? "").trim();
      if (!s3Key) return;
      const type = String(row.type ?? "").toLowerCase();
      // Linqs have no single S3 object to presign.
      if (type === "link" || type === "bundle" || type === "linq") return;
      try {
        const url = await genPresignedUrl({
          profile_id: userId,
          key: s3Key,
          method: "GET",
          expirationInSec: 3600,
        });
        if (url) urls[String(row.id)] = url;
      } catch {
        // Omit failed ids; caller falls back to single-url fetch.
      }
    })
  );

  return NextResponse.json({ urls }, { status: 200 });
}
