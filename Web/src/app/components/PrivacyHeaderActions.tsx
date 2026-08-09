"use client";

import Link from "next/link";
import { Shield } from "lucide-react";
import type { CSSProperties } from "react";

const wrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 8,
  color: "var(--foreground)",
  opacity: 0.85,
  textDecoration: "none",
  flexShrink: 0,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.65rem",
  flexShrink: 0,
};

type PrivacyHeaderActionsProps = {
  children: React.ReactNode;
};

/** Privacy Policy icon + trailing header controls (e.g. Clerk UserButton). */
export function PrivacyHeaderActions({ children }: PrivacyHeaderActionsProps) {
  return (
    <div style={rowStyle}>
      <Link
        href="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Privacy Policy"
        title="Privacy Policy"
        style={wrapStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.color = "var(--bundle-color-2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "0.85";
          e.currentTarget.style.color = "var(--foreground)";
        }}
      >
        <Shield size={20} strokeWidth={2} aria-hidden />
      </Link>
      {children}
    </div>
  );
}
