import { NextRequest, NextResponse } from "next/server";
import { s3Client, bucketName } from "@/lib/server/s3/module.s3client";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { S3ServiceException } from "@aws-sdk/client-s3";
import { createFile } from "@/lib/server/createFile";
import type { FileData } from "@/lib/Types/Types";
import {
  isAllowedFileName,
  isAllowedFileSize,
  isValidUploadCount,
  MAX_UPLOAD_COUNT,
} from "@/lib/server/uploadValidation";

interface RequestBody {
  keys: string[];
  fileNames: string[];
}

type HeadResult =
  | { ok: true; contentLength: number }
  | { ok: false; reason: "missing" | "oversized" | "error" };

const headObjectMeta = async (profileId: string, key: string): Promise<HeadResult> => {
  if (typeof key !== "string") {
    throw new TypeError("All values within keys must be strings");
  }

  const command = new HeadObjectCommand({
    Bucket: bucketName,
    Key: `${profileId}/${key}`,
  });

  try {
    const result = await s3Client.send(command);
    const contentLength = result.ContentLength ?? 0;
    if (!isAllowedFileSize(contentLength)) {
      return { ok: false, reason: "oversized" };
    }
    return { ok: true, contentLength };
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
  try {
    const { userId } = await auth();

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
    const { keys, fileNames } = body;

    const result = await db.transaction(async () => {
      const sentFiles: FileData[] = [];

      if (!Array.isArray(keys) || !Array.isArray(fileNames)) {
        throw new Error("keys and fileNames must be arrays!");
      }

      if (keys.length !== fileNames.length) {
        throw new Error("keys and fileNames must have the same length!");
      }

      if (!isValidUploadCount(keys.length)) {
        throw new Error(`Batch size must be between 1 and ${MAX_UPLOAD_COUNT}`);
      }

      for (let index = 0; index < keys.length; index++) {
        const fileName = fileNames[index];
        if (typeof fileName !== "string") {
          throw new Error("All values within fileNames must be strings!");
        }
        if (!isAllowedFileName(fileName)) {
          throw new Error("INVALID_FILE_NAME");
        }

        const head = await headObjectMeta(userId, keys[index]);
        if (head.ok) {
          sentFiles.push({
            owner_id: userId,
            creator_id: userId,
            name: fileName,
            type: fileName.split(".").pop() || "unknown",
            file_id: keys[index],
          });
        } else if (head.reason === "oversized") {
          throw new Error("FILE_TOO_LARGE");
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
    if (!(err instanceof Error)) {
      return;
    }

    if (
      err.message === "keys and fileNames must be arrays!" ||
      err.message === "keys and fileNames must have the same length!" ||
      err.message.startsWith("Batch size must be") ||
      err.message === "All values within fileNames must be strings!" ||
      err.message === "INVALID_FILE_NAME"
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
