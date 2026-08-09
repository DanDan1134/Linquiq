import { auth } from "@clerk/nextjs/server";

export async function GET() {
    const { userId } = await auth();

    console.log("userId", userId);

    if (!userId) {
        return new Response("Unauthorized", { status: 401 });
    }
    return new Response(
        JSON.stringify({ message: "got the userID, like this!" }),
        {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        }
    );
}
