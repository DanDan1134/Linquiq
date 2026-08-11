import { NextRequest, NextResponse } from "next/server";
import { s3Client, bucketName } from "@/lib/server/s3/module.s3client";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { createFile } from "@/lib/server/createFile";
import type { FileData } from "@/lib/Types/Types";
import {
  getFileExtension,
  isAllowedFileName,
  isAllowedFileSize,
  isContentTypeAllowedForFileName,
  isTextSearchableExtension,
  isValidUploadCount,
  matchesMagicBytes,
  MAX_UPLOAD_COUNT,
  SEARCH_EXTRACT_MAX_CHARS,
} from "@/lib/server/uploadValidation";

interface RequestBody {
  keys: string[];
  fileNames: string[];
  /** Optional client UUIDs (parallel to keys) so offline preview URLs stay stable. */
  clientIds?: string[];
}

const CLIENT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseClientId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const id = raw.trim();
  return CLIENT_ID_RE.test(id) ? id : undefined;
}

type HeadResult =
  | { ok: true; contentLength: number; contentType: string | null }
  | {
      ok: false;
      reason: "missing" | "oversized" | "type_mismatch" | "magic_mismatch" | "error";
    };

const s3Key = (profileId: string, key: string) => `${profileId}/${key}`;

const deleteObjectQuietly = async (profileId: string, key: string) => {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: s3Key(profileId, key),
      })
    );
  } catch (err) {
    console.warn("Failed to delete orphan S3 object", key, err);
  }
};

const readObjectHeaderBytes = async (
  profileId: string,
  key: string,
  maxBytes = 16
): Promise<Uint8Array | null> => {
  try {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key(profileId, key),
        Range: `bytes=0-${Math.max(0, maxBytes - 1)}`,
      })
    );
    if (!result.Body) return null;
    const buf = Buffer.from(await result.Body.transformToByteArray());
    return new Uint8Array(buf);
  } catch {
    return null;
  }
};

const readTextExtract = async (
  profileId: string,
  key: string
): Promise<string | null> => {
  try {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key(profileId, key),
        Range: `bytes=0-${SEARCH_EXTRACT_MAX_CHARS - 1}`,
      })
    );
    if (!result.Body) return null;
    const text = await result.Body.transformToString("utf-8");
    return text.replace(/<[^>]*>/g, " ").slice(0, SEARCH_EXTRACT_MAX_CHARS);
  } catch {
    return null;
  }
};

const headObjectMeta = async (
  profileId: string,
  key: string,
  fileName: string
): Promise<HeadResult> => {
  if (typeof key !== "string") {
    throw new TypeError("All values within keys must be strings");
  }

  const command = new HeadObjectCommand({
    Bucket: bucketName,
    Key: s3Key(profileId, key),
  });

  try {
    const result = await s3Client.send(command);
    const contentLength = result.ContentLength ?? 0;
    const contentType = result.ContentType ?? null;

    if (!isAllowedFileSize(contentLength)) {
      return { ok: false, reason: "oversized" };
    }
    if (!isContentTypeAllowedForFileName(fileName, contentType)) {
      return { ok: false, reason: "type_mismatch" };
    }

    const header = await readObjectHeaderBytes(profileId, key);
    if (!matchesMagicBytes(fileName, header)) {
      return { ok: false, reason: "magic_mismatch" };
    }

    return { ok: true, contentLength, contentType };
  } catch (err: unknown) {
    if (!(err instanceof S3ServiceException)) {
      return { ok: false, reason: "missing" };
    }

    if (
      err.$metadata?.httpStatusCode === 404 ||
      err.$metadata?.httpStatusCode === 403
    ) {
      return { ok: false, reason: "missing" };
    }

    console.log("Couldn't check objects existence");
    throw new Error("Couldn't check objects existence");
  }
};

export async function POST(request: NextRequest) {
  const orphanKeys: string[] = [];
  let userIdForCleanup: string | null = null;

  try {
    const { userId } = await auth();
    userIdForCleanup = userId;

    if (!userId) {
      return NextResponse.json(
        {
          okay: false,
          error: "Unauthorized",
          message: "User not authenticated",
        },
        { status: 401 }
      );
    }

    const body: RequestBody = await request.json();
    const { keys, fileNames, clientIds } = body;

    if (!Array.isArray(keys) || !Array.isArray(fileNames)) {
      throw new Error("keys and fileNames must be arrays!");
    }

    if (keys.length !== fileNames.length) {
      throw new Error("keys and fileNames must have the same length!");
    }

    if (!isValidUploadCount(keys.length)) {
      throw new Error(`Batch size must be between 1 and ${MAX_UPLOAD_COUNT}`);
    }

    const result = await db.transaction(async () => {
      const sentFiles: FileData[] = [];

      if (
        clientIds !== undefined &&
        (!Array.isArray(clientIds) || clientIds.length !== keys.length)
      ) {
        throw new Error("clientIds must be an array matching keys length!");
      }

      for (let index = 0; index < keys.length; index++) {
        const fileName = fileNames[index];
        const key = keys[index];
        if (typeof fileName !== "string") {
          throw new Error("All values within fileNames must be strings!");
        }
        if (!isAllowedFileName(fileName)) {
          orphanKeys.push(key);
          throw new Error("INVALID_FILE_NAME");
        }

        const head = await headObjectMeta(userId, key, fileName);
        if (head.ok) {
          const clientId = parseClientId(clientIds?.[index]);
          const ext = getFileExtension(fileName);
          let description: string | undefined;
          if (isTextSearchableExtension(ext)) {
            const extract = await readTextExtract(userId, key);
            if (extract) description = extract;
          }

          sentFiles.push({
            owner_id: userId,
            creator_id: userId,
            name: fileName,
            type: ext || "unknown",
            file_id: key,
            ...(clientId ? { id: clientId } : {}),
            ...(description ? { description } : {}),
          });
        } else {
          orphanKeys.push(key);
          if (head.reason === "oversized") {
            throw new Error("FILE_TOO_LARGE");
          }
          if (head.reason === "type_mismatch") {
            throw new Error("INVALID_CONTENT_TYPE");
          }
          if (head.reason === "magic_mismatch") {
            throw new Error("INVALID_FILE_CONTENT");
          }
        }
      }

      if (sentFiles.length === 0) {
        throw new Error("FILES_NOT_FOUND");
      }

      const createdEntries = await createFile(sentFiles, userId);

      return {
        createdEntries,
        totalRequested: keys.length,
        totalCreated: sentFiles.length,
      };
    });

    if (result.totalRequested === result.totalCreated) {
      return NextResponse.json(
        {
          okay: true,
          message: "All files were successfully uploaded!",
          data: result.createdEntries,
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        okay: true,
        message: "Some files did not upload successfully",
        data: result.createdEntries,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (userIdForCleanup && orphanKeys.length > 0) {
      await Promise.all(
        orphanKeys.map((key) => deleteObjectQuietly(userIdForCleanup!, key))
      );
    }

    if (!(err instanceof Error)) {
      return NextResponse.json(
        {
          okay: false,
          error: "Internal server error",
          message: "The server encountered an unexpected condition",
        },
        { status: 500 }
      );
    }

    if (
      err.message === "keys and fileNames must be arrays!" ||
      err.message === "keys and fileNames must have the same length!" ||
      err.message.startsWith("Batch size must be") ||
      err.message === "All values within fileNames must be strings!" ||
      err.message === "clientIds must be an array matching keys length!" ||
      err.message === "INVALID_FILE_NAME" ||
      err.message === "INVALID_CONTENT_TYPE" ||
      err.message === "INVALID_FILE_CONTENT"
    ) {
      return NextResponse.json(
        {
          okay: false,
          error: "Bad request",
          message: err.message,
        },
        { status: 400 }
      );
    }

    if (err.message === "FILE_TOO_LARGE") {
      return NextResponse.json(
        {
          okay: false,
          error: "Bad request",
          message: "One or more files exceed the maximum allowed size",
        },
        { status: 400 }
      );
    }

    if (err.message === "FILES_NOT_FOUND") {
      return NextResponse.json(
        {
          okay: false,
          error: "Files not found",
          message: "Files were not uploaded to the bucket",
        },
        { status: 404 }
      );
    }

    if (err instanceof TypeError) {
      return NextResponse.json(
        {
          okay: false,
          error: "Bad request",
          message: err.message,
        },
        { status: 400 }
      );
    }

    console.log(err);
    return NextResponse.json(
      {
        okay: false,
        error: "Internal server error",
        message: "The server encountered an unexpected condition",
      },
      { status: 500 }
    );
  }
}
