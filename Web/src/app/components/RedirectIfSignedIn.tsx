"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * After email OTP / modal sign-in, the first RSC render of `/` can miss the
 * new session cookie. Client auth then sees a signed-in user while the landing
 * page is still showing — send them to the dashboard.
 */
export function RedirectIfSignedIn({ to = "/dashboard" }: { to?: string }) {
    const { isLoaded, isSignedIn } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            router.replace(to);
        }
    }, [isLoaded, isSignedIn, router, to]);

    return null;
}
