"use client";

import type { CSSProperties } from "react";
import { privateFileSrc } from "@/lib/client/privateFileSrc";

const iframeStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1/1.1",
  borderRadius: "var(--border-rad)",
  border: "none",
  background: "#111",
};

const officePanelStyle: CSSProperties = {
  width: "100%",
  padding: "1.25rem",
  borderRadius: "var(--border-rad)",
  background: "#1f2937",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  alignItems: "flex-start",
};

const OFFICE_EXTS = new Set(["doc", "docx", "xls", "xlsx", "pptx"]);

/**
 * Private document preview. Bytes are served from /api/files/content so the
 * browser never shows an S3 URL. Office files stay in-app (no download link).
 */
export function PrivateDocumentPreview({
  fileId,
  fileType,
  fileName,
}: {
  fileId?: string | null;
  fileType: string;
  fileName?: string | null;
}) {
  const ext = String(fileType || "")
    .split(".")
    .pop()
    ?.toLowerCase() || "";
  const isPdf = ext === "pdf";
  const isOffice = OFFICE_EXTS.has(ext);
  const src = privateFileSrc(fileId);

  if (isPdf && src) {
    return (
      <iframe
        title={fileName || "PDF preview"}
        src={src}
        style={iframeStyle}
      />
    );
  }

  if (isOffice) {
    return (
      <div style={officePanelStyle}>
        <div style={{ fontSize: "0.95rem", opacity: 0.9 }}>
          Office files stay inside Linquiq. In-app preview is not available in
          this test.
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
      Unsupported document type.
    </div>
  );
}
