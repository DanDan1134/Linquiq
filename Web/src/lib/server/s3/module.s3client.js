import { S3Client } from "@aws-sdk/client-s3";
import "dotenv/config"


const bucketName = process.env.AWS_BUCKET_NAME;
const bucketRegion = process.env.AWS_REGION;

const s3Client = (() => {
    try {
        return new S3Client({
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
            region: bucketRegion,
        });
    } catch (error) {
        console.error("Error creating S3 client:", error);
        throw error; // Rethrow the error to be handled by the calling code
    }
})();

export { s3Client, bucketName, bucketRegion };
