// src/app/api/files/url/[file_id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { genPresignedUrl } from "@/lib/server/s3/module.genPresignedUrl"; // Adjust path as needed
import { getFileDataForUser } from "@/lib/server/getFileData";

export async function GET(
    request: NextRequest, 
    { params }: { params: Promise<{ file_id: string }> } // 1. Define as Promise
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // 2. Await the params
    const { file_id } = await params;

    const fileData = await getFileDataForUser(file_id, userId);
    if (!fileData) {
        return NextResponse.json({ message: "File not found" }, { status: 404 });
    }

    try {
        // Use your utility function
        const url = await genPresignedUrl({
            profile_id: userId,
            key: fileData.file_id!, // assuming this is the S3 key
            method: "GET",
            expirationInSec: 3600 // 1 hour
        });

        return NextResponse.json({ url });
    } catch (error) {
        return NextResponse.json({ message: "Error generating URL" + error }, { status: 500 });
    }
}