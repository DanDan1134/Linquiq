"use client"

import { useEffect, useRef, useState } from "react";
import { getFileType } from "@/lib/client/getFileType";
import { sanitizeHtml } from "@/lib/client/sanitizeHtml";
import { PrivateDocumentPreview } from "@/app/components/Preview/PrivateDocumentPreview";

const NoteView = ({ fileUrl }: { fileUrl: string }) => {
    const [fileSrc, setFileSrc] = useState<string | undefined>(undefined);

    useEffect(() => {
        const getFileSrc = async () => {
            const fileSrcRes = await fetch(fileUrl);
            const fileText = await fileSrcRes.text();
            setFileSrc(sanitizeHtml(fileText));
        };
        getFileSrc();
    }, [fileUrl]);

    if (!fileSrc) return <div>Loading...</div>;

    return (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div dangerouslySetInnerHTML={{ __html: fileSrc }} />
        </div>
    );
};

export const SingleFilePreview = ({
    fileUrl,
    fileType,
    fileId,
    fileName,
}: {
    fileUrl?: string;
    fileType: string;
    fileId?: string;
    fileName?: string;
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const displayType = getFileType(fileType);

    if (!fileUrl && displayType !== "Document") {
        return <div>File not found.</div>;
    }

    switch (displayType) {
        case "Document":
            return (
                <PrivateDocumentPreview
                    fileId={fileId}
                    fileType={fileType}
                    fileName={fileName}
                    downloadUrl={fileUrl}
                />
            );
        case "Image":
            return (
                <img
                    src={fileUrl}
                    alt=""
                    style={{
                        width: "100%",
                        borderRadius: "var(--border-rad)",
                        objectFit: "contain",
                        objectPosition: "center",
                    }}
                />
            );
        case "Recording":
            return (
                <video
                    src={fileUrl}
                    ref={videoRef}
                    autoPlay
                    muted
                    style={{
                        width: "100%",
                        borderRadius: "var(--border-rad)",
                        objectFit: "contain",
                        objectPosition: "center",
                    }}
                    controls
                />
            );
        case "Note":
            return fileUrl ? <NoteView fileUrl={fileUrl} /> : <div>File not found.</div>;
        default:
            return <div>Unsupported preview type.</div>;
    }
};
