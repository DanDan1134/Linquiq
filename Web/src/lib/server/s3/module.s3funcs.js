import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, bucketName } from "../S3 Stuff/module.s3client.js";

import crypto from "crypto";
import { Data, sequelize } from "../Database/module.db.js";
import { Sequelize } from "sequelize";

const fileUpload = async (req, res) => {
    const { profile_id, username_base } = req.user;

    if (!req.file) {
        return res.status(400).json({
            okay: false,
            error: "Bad request",
            message: "You did not upload a file",
        });
    };

    try {
        const transaction = await sequelize.transaction(); //Start a transaction to our database

        const fileKey = crypto.randomBytes(16).toString('hex'); //Generates a random key for files. In S3, if a file is uploaded to a bucket and it shares a name with some other file in the bucket, it overrides the old one

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: `${profile_id}/${fileKey}`,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        });
    
        await s3Client.send(command); //Sends command to S3 Bucket
        
        const sentFile = await Data.create({ //Create a new object within our database
                owner_id: profile_id,
                creator_id: profile_id,
                creator_username: username_base,
                name: req.file.originalname,
                type: req.file.mimetype.split("/")[1],
                metadata: {
                    key: `${profile_id}/${fileKey}`,
                },
            },
            { transaction: transaction },
        );

        await transaction.commit();
        res.status(201).json({
            okay: true,
            data: sentFile,
        });
    } catch (err) {
        await transaction.rollback(); //Rollback the transaction since error was thrown
        console.log(err);

        if (err instanceof Sequelize.ValidationError) {
            console.log(err.message);
            return res.status(400).json({
                okay: false,
                error: "Invalid input",
                message: err.message,
            });
        }

        res.status(500).json({
            okay: false,
            error: "Unhandled exception",
            message: "The server encountered an unexpected condition",
        });
    };
};

const fileDownload = async (req, res) => {
    const { profile_id } = req.user;
    try {
        const file = await Data.findByPk(req.params.id); //Obtain the file's key from the database
        
        if (!file) {
            return res.status(404).json({
                okay: false,
                error: "File not found",
                message: "The file you are looking for may not exist",
            });
        }

        if (file.owner_id != profile_id) {
            return res.status(403).json({
                okay: false,
                error: "Insufficient credentials",
                message: "This file does not belong to you",
            });
        }

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: file.metadata.key,
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn: 60 }); //Url is currently set to expire in 60 seconds
        res.status(200).json({
            okay: true,
            url: url,
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({
            okay: false,
            error: "Unhandled exception",
            message: "The server encountered an unexpected condition",
        });
    };
};

const deleteFile = async (req, res) => {
    const { profile_id } = req.user;

    try {
        const file = await Data.findByPk(req.params.id); //Obtain file info from database

        if (!file) {
            return res.status(404).json({
                okay: false,
                error: "File not found",
                message: "The file you are looking for may not exist",
            });
        }
        
        if (file.owner_id != profile_id) {
            return res.status(403).json({
                okay: false,
                error: "Insufficient credentials",
                message: "This file does not belong to you",
            });
        }

        //Delete from S3
        const command = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: file.metadata.key,
        });
        await s3Client.send(command);
        
        //Delete from Postgres
        const transaction = await sequelize.transaction(); //Start transaction with database
        await file.destroy({transaction: transaction}); 
        
        await transaction.commit();
        res.status(200).json({ okay: true });
    } catch (err) {
        await transaction.rollback();
        debugError(err);
        res.status(500).json({
            okay: false,
            error: "Unhandled exception",
            message: "The server encountered an unexpected condition",
        });
    };
};

export { fileUpload, fileDownload, deleteFile };
