import { genPresignedUrl } from "../S3 Stuff/module.genPresignedUrl.js";
import crypto from "crypto";

const uploadHelper = async (req, res) => {
    const { profile_id } = req.user;
    const urls = [];
    const keys = [];

    const fileCount = parseInt(req.query.count, 10);

    if (isNaN(fileCount) || fileCount < 1) {
        return res.status(400).json({
            okay: false,
            error: "Bad request",
            message: "Count must be an integer greater than or equal to 1"
        });
    }

    try {
        for (let i = 0; i < fileCount; i++) {
            const key = crypto.randomBytes(16).toString("hex");

            urls.push(await genPresignedUrl(profile_id, key, "PUT"));

            keys.push(key);
        }
        
        return res.status(200).json({
            okay: true,
            urls: urls,
            keys: keys           
        });
    } catch (err) {
        console.log(err)
        return res.status(500).json({
            okay: false,
            error: "Internal server error",
            message: "The server encountered an unexpected condition",
        });
    };
};

export { uploadHelper };