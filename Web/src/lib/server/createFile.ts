import { clerkClient } from "@clerk/nextjs/server";
import { entryTable } from "@/db/schema";
import { db } from "@/db";
import type { FileData } from "../Types/Types";




export const createFile = async (files : FileData[], userId : string) : Promise<typeof entryTable.$inferSelect[]> => {

    const sentFiles : FileData[] = []


    const client = await clerkClient()

    const user = await client.users.getUser(userId)

    const emailObj = user.primaryEmailAddress
    let email : string | undefined;
    if(emailObj?.emailAddress){
        email = emailObj?.emailAddress
    }

    for(const file of files){

        sentFiles.push({
                owner_id: userId,
                creator_id: userId,
                name: file.name,
                type: file.name.split('.').pop() || 'unknown',
                file_id: file.file_id,
                creator_email: email
        })
    }

    

      // Bulk insert files into database using Drizzle
    const createdEntries = await db.insert(entryTable).values(sentFiles).returning();

    return createdEntries;
}