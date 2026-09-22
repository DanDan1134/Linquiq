import { s3Client, bucketName } from "./module.s3client.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { logSafeError } from "../../safeLog";

type GenPresignedUrlArgs = {
  profile_id: string;
  key: string;
  method: string;
  expirationInSec?: number;
  /** Required for PUT — signed into the URL; client must send the same header. */
  contentType?: string;
  /** Required for PUT — signed into the URL; browsers set this automatically from the body. */
  contentLength?: number;
};

/** Generates a presigned url for either putting or getting an object from s3 */
export const genPresignedUrl = async ({
  profile_id,
  key,
  method,
  expirationInSec = 60,
  contentType,
  contentLength,
}: GenPresignedUrlArgs) => {
  let command;
  const objectKey = `${profile_id}/${key}`;
  const normalizedMethod = method.toUpperCase();

  if (normalizedMethod === "PUT") {
    if (!contentType || typeof contentType !== "string") {
      throw new TypeError("PUT presign requires contentType");
    }
    if (
      contentLength == null ||
      !Number.isFinite(contentLength) ||
      !Number.isInteger(contentLength) ||
      contentLength < 0
    ) {
      throw new TypeError("PUT presign requires contentLength");
    }
    command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: contentLength,
    });
  } else if (normalizedMethod === "GET") {
    command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });
  } else {
    throw new TypeError("Expected method to be GET or PUT");
  }

  try {
    return await getSignedUrl(s3Client, command, { expiresIn: expirationInSec });
  } catch (err) {
    logSafeError("genPresignedUrl", err);
    throw new Error("Couldn't generate presigned url");
  }
};
