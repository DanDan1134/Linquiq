import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { entryTable, linkTable } from "@/db/schema";

/** Keep list payloads small — full text is loaded on open/search. */
const LIST_DESCRIPTION_MAX = 200;

const isLinqType = (type: unknown) => {
    const t = String(type ?? "").toLowerCase();
    return t === "link" || t === "bundle" || t === "linq";
};

function truncateDescription(value: string | null | undefined): string | null {
    if (value == null) return null;
    const text = String(value);
    if (text.length <= LIST_DESCRIPTION_MAX) return text;
    return `${text.slice(0, LIST_DESCRIPTION_MAX)}…`;
}

export async function GET(req: NextRequest) {
    const { userId } = await auth();
    const authHeader = req.headers.get("authorization");
    const hasBearer = Boolean(authHeader?.toLowerCase().startsWith("bearer "));

    if (!userId) {
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
    );

    const linqIds = files
        .filter((f) => isLinqType(f.type))
        .map((f) => f.id);

    const childrenByLinq = new Map<string, string[]>();
    if (linqIds.length > 0) {
        const links = await db
            .select({
                from_id: linkTable.from_id,
                to_id: linkTable.to_id,
            })
            .from(linkTable)
            .where(inArray(linkTable.from_id, linqIds));

        for (const link of links) {
            const fromId = String(link.from_id);
            const toId = String(link.to_id);
            const list = childrenByLinq.get(fromId);
            if (list) list.push(toId);
            else childrenByLinq.set(fromId, [toId]);
        }
    }

    const data = files.map((f) => {
        const row: Record<string, unknown> = {
            ...f,
            description: truncateDescription(f.description),
        };
        if (isLinqType(f.type)) {
            row.bundledFileIds = childrenByLinq.get(String(f.id)) ?? [];
        }
        return row;
    });

    return NextResponse.json({ data }, { status: 200 })
}
