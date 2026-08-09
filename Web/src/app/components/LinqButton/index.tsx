"use client"
import type { File } from "@/app/components/State Manager/appManager"
import { useFileStore } from "../../components/State Manager/appManager"
import Bundle from "@/lib/server/Bundle/bundle"


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
            if(selectedFiles.size > 0) {
                SetActionLoading(true, "Linqing files...")
                try {
                    // creates a bundle of the selected files
                    const bundle = await Bundle(Array.from(selectedFiles))
                    ClearSelection()
                    //if the bundle is created, update the files state with the new bundle
                    if (bundle?.bundle) {
                        UpdateFiles([bundle.bundle as unknown as File])
                    }
                } finally {
                    SetActionLoading(false)
                }
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