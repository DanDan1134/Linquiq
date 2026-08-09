import { s3Client, bucketName } from "./module.s3client.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

//Generates a presigned url for either putting or getting an object from s3
export const genPresignedUrl = async ({profile_id, key, method, expirationInSec = 60} : {profile_id: string, key: string, method: string, expirationInSec?: number}) => {
    //Validate inputs

    //Set up command for getSignedUrl
    let command;
    const commandBody = {
        Bucket: bucketName,
        Key: `${profile_id}/${key}`,
    };

    //Create command based on method
    const normalizedMethod = method.toUpperCase(); //Set to uppercase for ease of comparison
    if (normalizedMethod === "PUT") {
        command = new PutObjectCommand(commandBody);
    } else if (normalizedMethod === "GET") {
        command = new GetObjectCommand(commandBody);
    } else {
        throw new TypeError("Expected method to be GET or PUT");
    }

    //Push a presigned url to the array
    try {
        return await getSignedUrl(s3Client, command, { expiresIn: expirationInSec }); //Return a presigned url
    } catch (err) {
        console.log("Couldn't generate presigned url: ", err);
        throw new Error("Couldn't generate presigned url");
    };
}; //text "flint & steel!" to me if you read this