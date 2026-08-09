import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import { genPresignedUrl } from "@/lib/server/s3/module.genPresignedUrl";
import { NextRequest, NextResponse } from "next/server";
import { isValidUploadCount, MAX_UPLOAD_COUNT } from "@/lib/server/uploadValidation";

export async function GET(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const count = params.get("count");

  if (!count || !isValidUploadCount(count)) {
    return NextResponse.json(
      {
        okay: false,
        error: "Bad request",
        message: `count must be an integer between 1 and ${MAX_UPLOAD_COUNT}`,
      },
      { status: 400 }
    );
  }

  const fileCount = parseInt(count, 10);
  const urls: string[] = [];
  const keys: string[] = [];

  try {
    for (let i = 0; i < fileCount; i++) {
      const key = crypto.randomBytes(16).toString("hex");
      urls.push(
        await genPresignedUrl({
          profile_id: userId,
          key,
          method: "PUT",
          expirationInSec: 300,
        })
      );
      keys.push(key);
    }

    return NextResponse.json(
      {
        okay: true,
        urls: urls,
        keys: keys,
      },
      { status: 200 }
    );
  } catch (err) {
    console.log("upload-helper failed to generate presigned URLs");
    console.log(err);
    return new Response(
      "Encountered an unknown condition. Either failed to generate presignedUrl or something far worse :(",
      { status: 500 }
    );
  }
}
