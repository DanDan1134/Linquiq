import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { entryTable, linkTable } from "@/db/schema";
import { s3Client, bucketName } from "@/lib/server/s3/module.s3client";
import { logSafeError } from "@/lib/safeLog";

async function deleteS3Prefix(userId: string): Promise<void> {
  if (!bucketName) return;
  let token: string | undefined;
  do {
    const page = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `${userId}/`,
        ContinuationToken: token,
      })
    );
    const objects = (page.Contents ?? [])
      .map((obj) => obj.Key)
      .filter((key): key is string => Boolean(key))
      .map((Key) => ({ Key }));
    if (objects.length > 0) {
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: objects },
        })
      );
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

/** Deletes this user's files, S3 objects, and Clerk account. */
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select({ id: entryTable.id })
      .from(entryTable)
      .where(eq(entryTable.owner_id, userId));
    const ids = rows.map((r) => r.id);

    if (ids.length > 0) {
      await db
        .delete(linkTable)
        .where(
          inArray(linkTable.from_id, ids)
        );
      await db.delete(linkTable).where(inArray(linkTable.to_id, ids));
      await db.delete(entryTable).where(eq(entryTable.owner_id, userId));
    }

    await deleteS3Prefix(userId);

    const client = await clerkClient();
    await client.users.deleteUser(userId);

    return NextResponse.json({ okay: true }, { status: 200 });
  } catch (err) {
    logSafeError("account delete", err);
    return NextResponse.json(
      { message: "Could not delete account" },
      { status: 500 }
    );
  }
}
