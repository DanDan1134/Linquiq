"use client"
import { useFileStore } from "../components/State Manager/appManager"
import { Trash } from "lucide-react"

export const DeleteButton = () => {
    const selectedFiles = useFileStore((state) => state.selectedFiles);
    const ClearSelection = useFileStore((state) => state.ClearSelection);
    const deleteFiles = useFileStore((state) => state.deleteFiles);
    const SetActionLoading = useFileStore((state) => state.SetActionLoading);

    const isActive = selectedFiles.size > 0;
    return (
        <button
            className={`but delete ${isActive ? "active" : ""}`}
            onClick={async () => {
                if (selectedFiles.size > 0) {
                    SetActionLoading(true, "Deleting files...")
                    try {
                        await deleteFiles();
                        ClearSelection()
                    } finally {
                        SetActionLoading(false)
                    }
                }
            }}
            style={{
                backgroundColor: isActive ? "var(--delete-color-2)" : "transparent",
                color: isActive ? "#fff" : "var(--foreground)",
                opacity: isActive ? 1 : 0.6,
                cursor: isActive ? "pointer" : "not-allowed",
                /* Keep 1px border in both states so dock height does not shift when selection toggles */
                border: isActive
                    ? "1px solid var(--delete-color-2)"
                    : "1px solid rgba(255,255,255,0.25)",
                boxSizing: "border-box",
            }}
            onMouseEnter={(e) => {
                if (isActive) {
                    e.currentTarget.style.filter = "brightness(1.1)"
                }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.filter = "none"
            }}
            disabled={!isActive}
        >
            <div className="but-content" style={{ display: "flex", alignItems: "center" }}>
                <Trash size={18} style={{ marginRight: "0.25rem", flexShrink: 0 }} />
                <span
                    style={{
                        minWidth: "2ch",
                        display: "inline-block",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {selectedFiles.size}
                </span>
            </div>
        </button>
    )
}