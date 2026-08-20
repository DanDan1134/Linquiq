"use client"
import type { File } from "@/app/components/State Manager/appManager"
import { useFileStore } from "../../components/State Manager/appManager"
import createLinq from "@/lib/server/Linq/createLinq"


export const LinqButton = ({ compact }: { compact?: boolean } = {}) => {
    const selectedFiles = useFileStore((state)=>state.selectedFiles)
    const ClearSelection = useFileStore((state)=>state.ClearSelection)
    const UpdateFiles = useFileStore((state)=>state.UpdateFiles)
    const SetActionLoading = useFileStore((state)=>state.SetActionLoading)

    return (

    <button
        className={selectedFiles.size > 0 ? "but linq active" : "but linq"}
        aria-label="Linq"
        style={{ ...(compact ? { marginRight: 0, padding: "0.25rem 0.4rem" } : {}), position: "relative" }}
        onClick={async () => {
            const name = window.prompt("Name this linq", "linq");
            if (name == null) return;
            const folderName = name.trim().slice(0, 80) || "linq";
            SetActionLoading(true, "Creating linq...")
            try {
                const created = await createLinq(Array.from(selectedFiles), folderName)
                ClearSelection()
                const row = created?.linq ?? created?.bundle
                if (row) {
                    UpdateFiles([row as unknown as File])
                }
            } finally {
                SetActionLoading(false)
            }
        }}
    >
        <div className={"but-content"} style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/linq btn black.png"
                alt=""
                aria-hidden
                style={{
                    height: compact ? "18px" : "22px",
                    width: "auto",
                    display: "block",
                    objectFit: "contain",
                }}
            />
        </div>
        <span className="linq-tooltip">Linq</span>
        
    </button>)
}
