import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Dashboard } from "./client";




export default async function DashboardPage() {
    const { userId } = await auth();
    console.log("userId", userId);
    if (!userId) {
        redirect("/");
    }

    



    return (
        <Dashboard />
    );
}
