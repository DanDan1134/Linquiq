import { NextRequest, NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { getFileDataForUser } from "@/lib/server/getFileData";



import { s3Client, bucketName } from "../../../../lib/server/s3/module.s3client";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { deleteFile } from "@/lib/server/deleteFile";
import { getFileUrl } from "@/lib/server/getFileUrl";

// TODO: if Bundle, also delete all linked files and their data.

export async function GET(
    request: NextRequest, 
    { params }: { params: Promise<{ file_id: string }> } 
) {
    const { userId } = await auth();
    
    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // 2. Await the params
    const { file_id } = await params;

    const fileData = await getFileDataForUser(file_id, userId);
    if (!fileData) {
       //changed from 403 to 404 to prevent leaking information about the existence of the file
        return NextResponse.json({ "message": "Not found" }, { status: 404 });
    }

    const fileUrl = await getFileUrl({
            id: fileData.id, 
            file_id: fileData.file_id!, 
            type: fileData.type
        }, false);

    return NextResponse.json({ "message": "Success", "Parent": fileData, "Linked": fileUrl }, { status: 200 });
}






export async function DELETE(request : NextRequest, {params} : {params : Promise<{file_id : string}>}) {
    const { userId } = await auth()
    
    if(!userId){
        return NextResponse.json({"message" : "Unauthorized"}, {status : 401})
    }

    const { file_id } = await params;

    const fileData = await getFileDataForUser(file_id, userId);

    if(!fileData){
        return NextResponse.json({"message" : "Not found"}, {status : 404})
    }

    const file_bucket_id = fileData.file_id;

    await deleteFile(file_id);


    

    // Delete the file from our bucket
    const command = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
            Objects: [file_bucket_id].map(key => ({Key: `${userId}/${key}`})),
        },
    });
    await s3Client.send(command);
    
    return NextResponse.json({
        okay: true,
        message: "Successfully deleted files",
    }, {status : 200})
}