import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, bucketName } from "@/lib/server/s3/module.s3client";
import { getFileDataForUser } from "@/lib/server/getFileData";
import {
  mimeForFileName,
  normalizeMimeType,
} from "@/lib/server/uploadValidation";

/**
 * Authenticated same-origin content stream.
 * Used for private PDF preview so the browser never sends S3 URLs to Google.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ file_id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { file_id } = await params;
  const fileData = await getFileDataForUser(file_id, userId);
  if (!fileData?.file_id) {
    return NextResponse.json({ message: "File not found" }, { status: 404 });
  }

  try {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: `${userId}/${fileData.file_id}`,
      })
    );

    if (!result.Body) {
      return NextResponse.json({ message: "Empty object" }, { status: 404 });
    }

    const bytes = await result.Body.transformToByteArray();
    const fallbackMime =
      mimeForFileName(fileData.name) || "application/octet-stream";
    const contentType =
      normalizeMimeType(result.ContentType) || fallbackMime;

    const safeName = String(fileData.name || "file").replace(/"/g, "");

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("content stream failed", err);
    return NextResponse.json(
      { message: "Error reading file content" },
      { status: 500 }
    );
  }
}
