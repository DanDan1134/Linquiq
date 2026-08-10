"use client";

import type { CSSProperties } from "react";

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
 * Private document preview without third-party viewers.
 * PDFs use the authenticated same-origin content route.
 * Office files offer download/open only.
 */
export function PrivateDocumentPreview({
  fileId,
  fileType,
  fileName,
  downloadUrl,
}: {
  fileId?: string | null;
  fileType: string;
  fileName?: string | null;
  /** Optional short-lived S3 URL used only for Office download. */
  downloadUrl?: string | null;
}) {
  const ext = String(fileType || "")
    .split(".")
    .pop()
    ?.toLowerCase() || "";
  const isPdf = ext === "pdf";
  const isOffice = OFFICE_EXTS.has(ext);

  if (isPdf && fileId) {
    return (
      <iframe
        title={fileName || "PDF preview"}
        src={`/api/files/content/${encodeURIComponent(fileId)}`}
        style={iframeStyle}
      />
    );
  }

  if (isOffice) {
    const href =
      downloadUrl && String(downloadUrl).trim() !== ""
        ? downloadUrl
        : fileId
          ? `/api/files/content/${encodeURIComponent(fileId)}`
          : null;
    return (
      <div style={officePanelStyle}>
        <div style={{ fontSize: "0.95rem", opacity: 0.9 }}>
          Office files stay private. Open or download instead of a third-party
          viewer.
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            download={fileName || undefined}
            style={{
              background: "#D7827E",
              color: "#111827",
              fontWeight: 700,
              padding: "0.65rem 1rem",
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            Open / Download
          </a>
        ) : (
          <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
            File not ready yet.
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
      Unsupported document type.
    </div>
  );
}
