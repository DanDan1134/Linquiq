import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { s3Client, bucketName } from "./module.s3client.js";

export const generateUploadUrl = async (req, res) => {
    const fileKey = crypto.randomBytes(16).toString("hex");
    const { profile_id } = req.user;

    try {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: `${profile_id}/${fileKey}`,
        });
        const url = await getSignedUrl(s3Client, command, { expiresIn: 60 });
        res.status(200).json({
            okay: true,
            url: url,
            key: fileKey,
        });
    } catch (err) {
        console.log("Failed to generate upload URL");
        console.log(err);
        res.status(500).json({
            okay: false,
            error: "Unhandled exception",
            message: "The server encountered an unexpected condition",
        });
    }
};
