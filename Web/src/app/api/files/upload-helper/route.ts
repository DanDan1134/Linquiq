import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import { genPresignedUrl } from "@/lib/server/s3/module.genPresignedUrl";
import { logSafeError } from "@/lib/safeLog";
import { NextRequest, NextResponse } from "next/server";
import {
  isValidUploadCount,
  MAX_UPLOAD_COUNT,
  validateUploadMeta,
  type UploadFileMeta,
} from "@/lib/server/uploadValidation";

/**
 * Issue bounded S3 PUT URLs.
 * Clients must POST file metadata so Content-Type and Content-Length are signed.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { okay: false, error: "Bad request", message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const filesRaw = (body as { files?: unknown })?.files;
  if (!Array.isArray(filesRaw) || !isValidUploadCount(filesRaw.length)) {
    return NextResponse.json(
      {
        okay: false,
        error: "Bad request",
        message: `files must be an array of length 1..${MAX_UPLOAD_COUNT}`,
      },
      { status: 400 }
    );
  }

  let metas: UploadFileMeta[];
  try {
    metas = filesRaw.map((row) => validateUploadMeta(row));
  } catch (err) {
    const message = err instanceof Error ? err.message : "INVALID_UPLOAD_META";
    return NextResponse.json(
      {
        okay: false,
        error: "Bad request",
        message,
      },
      { status: 400 }
    );
  }

  const urls: string[] = [];
  const keys: string[] = [];
  const contentTypes: string[] = [];
  const contentLengths: number[] = [];

  try {
    for (const meta of metas) {
      const key = crypto.randomBytes(16).toString("hex");
      urls.push(
        await genPresignedUrl({
          profile_id: userId,
          key,
          method: "PUT",
          expirationInSec: 300,
          contentType: meta.contentType,
          contentLength: meta.contentLength,
        })
      );
      keys.push(key);
      contentTypes.push(meta.contentType);
      contentLengths.push(meta.contentLength);
    }

    return NextResponse.json(
      {
        okay: true,
        urls,
        keys,
        contentTypes,
        contentLengths,
      },
      { status: 200 }
    );
  } catch (err) {
    logSafeError("upload-helper presign", err);
    return new Response(
      "Encountered an unknown condition. Either failed to generate presignedUrl or something far worse :(",
      { status: 500 }
    );
  }
}
