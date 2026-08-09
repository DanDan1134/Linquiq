import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { entryTable } from "@/db/schema";

export async function GET(req: NextRequest) {
    const { userId } = await auth();
    const authHeader = req.headers.get("authorization");
    const hasBearer = Boolean(authHeader?.toLowerCase().startsWith("bearer "));

    if (!userId) {
        // Help debug mobile: token missing vs token rejected by Clerk secret mismatch.
        return NextResponse.json(
            {
                message: "Unauthorized",
                hasBearer,
                hint: hasBearer
                    ? "Bearer token was sent but Clerk rejected it. Vercel CLERK_SECRET_KEY must match the same instance as the mobile publishable key; sign out/in after key changes."
                    : "No Authorization Bearer token on the request. Mobile getToken() returned null — sign in again.",
            },
            { status: 401 }
        );
    }

    const files = await db.select({
        id: entryTable.id,
        creator_id: entryTable.creator_id,
        creator_email: entryTable.creator_email,
        createdAt: entryTable.createdAt,
        file_id: entryTable.file_id,
        type: entryTable.type,
        name: entryTable.name,
        description: entryTable.description
    }).from(entryTable).where(
        eq(entryTable.owner_id, userId!)
    )

    return NextResponse.json({ data: files }, { status: 200 })
}
