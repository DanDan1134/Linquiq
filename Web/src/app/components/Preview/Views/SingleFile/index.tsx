"use client"

import { useEffect, useRef, useState } from "react";
import { DocumentViewer } from "react-documents";
import { getFileType } from "@/lib/client/getFileType";
import { sanitizeHtml } from "@/lib/client/sanitizeHtml";

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

export const SingleFilePreview = ({ fileUrl, fileType }: { fileUrl?: string; fileType: string }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const displayType = getFileType(fileType);

    if (!fileUrl) {
        return <div>File not found.</div>;
    }

    switch (displayType) {
        case "Document":
            return (
                <DocumentViewer
                    queryParams="hl=Nl"
                    url={fileUrl}
                    style={{
                        width: "100%",
                        aspectRatio: "1/1.1",
                        borderRadius: "var(--border-rad)",
                        objectFit: "contain",
                        objectPosition: "center",
                    }}
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
            return <NoteView fileUrl={fileUrl} />;
        default:
            return <div>Unsupported preview type.</div>;
    }
};

