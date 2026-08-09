import { FileData } from "@/app/components/FileDisplay";
import Bundle from "@/app/components/Preview/Views/Bundle";
import { SingleFilePreview } from "@/app/components/Preview/Views/SingleFile";
import { NewPage, VerticalDiv } from "@/app/components/UILayout";
import { getFileDataForUser } from "@/lib/server/getFileData";
import { getFileUrl } from "@/lib/server/getFileUrl";
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { UserButton } from "@clerk/nextjs";
import { PrivacyHeaderActions } from "@/app/components/PrivacyHeaderActions";
import type { CSSProperties } from "react";

// 1. Update the type to expect a Promise
export default async function PreviewPage({ 
    params 
}: { 
    params: Promise<{ file_id: string }> 
}) {
    const { userId } = await auth();
    
    if(!userId){
        redirect("/");
    }

    // 2. Await the params object before accessing properties
    const resolvedParams = await params;
    const fileId = resolvedParams.file_id;

    const fileData = await getFileDataForUser(fileId, userId);

    if(!fileData){
        return (
            <div className="p-10">
                <p>You do not have permission to view this file.</p>
                <button>Request Access</button>
                <button>Go to Dashboard</button>
            </div>
        );
    }

    const fileUrl = await getFileUrl(fileData, false);
    const topBarStyle: CSSProperties = {
        width: "100%",
        maxWidth: "980px",
        minHeight: "56px",
        padding: "0 clamp(0.35rem, 2vw, 0.75rem)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxSizing: "border-box",
        gap: "0.75rem",
        zIndex: 2,
    };

    const previewBodyStyle: CSSProperties = {
        width: "100%",
        padding: "clamp(0.75rem, 2vw, 1rem)",
        boxSizing: "border-box",
        backgroundColor: "var(--accent-color)",
        borderRadius: "var(--border-rad)",
        overflowY: "auto",
        maxHeight: "calc(100dvh - 10.5rem)",
    };

    return (
        <NewPage>
            <VerticalDiv style={{ alignItems: "center", gap: "0.75rem" }} padding="0.75rem">
                <div style={topBarStyle}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/Linquiq title.png" alt="Linquiq" style={{ height: "37px", width: "107px", objectFit: "contain", flexShrink: 0 }} />
                    <PrivacyHeaderActions>
                        <UserButton />
                    </PrivacyHeaderActions>
                </div>
                <VerticalDiv width="100%" style={{ maxWidth: "980px" }} padding="0rem">
                    <FileData fileData={fileData} />
                    <VerticalDiv style={{ borderRadius: "var(--border-rad)", scrollbarWidth: "auto" }} padding="0rem" gap="0.75rem">
                        <div style={previewBodyStyle}>
                            {fileData.type.toLowerCase() === "bundle" ? (
                                <Bundle bundle_data={fileUrl || undefined} />
                            ) : (
                                <SingleFilePreview
                                    fileUrl={fileUrl?.[0]?.url}
                                    fileType={fileData.type}
                                />
                            )}
                        </div>
                    </VerticalDiv>
                </VerticalDiv>
            </VerticalDiv>
        </NewPage>
    );
}