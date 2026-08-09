import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PageLoader } from "@/app/components/PageLoader";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Linquiq",
    description: "Networking Application",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <ClerkProvider>
            <html
                lang="en"
                suppressHydrationWarning={true}
                data-lt-installed={true}
            >
                
                <body
                    className={`${geistSans.variable} ${geistMono.variable}`}
                    id={"root"}
                >
                    <PageLoader />
                    {children}
                </body>
            </html>
        </ClerkProvider>
    );
}
