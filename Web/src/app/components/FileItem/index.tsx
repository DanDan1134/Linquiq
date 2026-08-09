"use client"
import { useState, useEffect, useRef } from "react"
import type { File } from "../State Manager/appManager"
import { useFileStore } from "../State Manager/appManager"
import {FileType} from "../TypeTags"
import { getDisplayFileName } from "@/lib/client/getFileType"
import { SquareArrowOutUpRight, Eye, Copy, Check } from "lucide-react"



export type FileItemCheckboxPayload = {
    fileId: string
    rowIndex: number
    shiftKey: boolean
    checked: boolean
}

export const FileItem = ({
    file,
    rowIndex,
    onCheckboxChange,
}: {
    file: File
    rowIndex: number
    onCheckboxChange: (payload: FileItemCheckboxPayload) => void
}) => {

    const [onEnter, SetOnEnter] = useState({width : "100%"})
    const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        const handleResize = () => {
            setViewportWidth(window.innerWidth)
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const isSelected = useFileStore((state) => {
        return state.selectedFiles.has(file.id)
    })

    const checkboxRef = useRef<HTMLInputElement>(null)

    const SetPreviewFile = useFileStore((state) => state.SetPreviewedFile);

    const SetLayoutState = useFileStore((state)=>state.SetLayoutState);
    const layoutState = useFileStore((state)=> state.layoutState);
    const previewedFile = useFileStore((state) => state.previewedFile)

    const peekOpenForThisFile =
        layoutState === 1 && previewedFile?.id === file.id


    useEffect(()=>{
        if(checkboxRef?.current){
            checkboxRef.current.checked = isSelected;
        }

    }, [isSelected])


    useEffect(()=>{
        SetOnEnter({width : "0%"})
    }, [])

    const displayName = getDisplayFileName(file.name, file.type)

    const togglePeek = () => {
        if (peekOpenForThisFile) {
            SetLayoutState(0)
            SetPreviewFile(undefined)
            return
        }
        SetPreviewFile(file)
        SetLayoutState(1)
    }

    return (
        <div>
            <div className={`row${isSelected ? " row-selected" : ""}`} style={{ cursor: "default" }}>
                <label className={"select-column"} onClick={(e) => e.stopPropagation()}>
                    <input
                        type={"checkbox"}
                        ref={checkboxRef}
                        onChange={(e) => {
                            e.stopPropagation()
                            const ne = e.nativeEvent as MouseEvent
                            onCheckboxChange({
                                fileId: file.id,
                                rowIndex,
                                shiftKey: Boolean(ne.shiftKey),
                                checked: e.target.checked,
                            })
                        }}
                    />
                </label>
                <div
                    className={"column column--file-actions"}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        minWidth: 0,
                    }}
                >
                    <div className="file-item-actions" role="group" aria-label="File actions">
                        <button
                            type="button"
                            className="file-item-action"
                            title="Open in new tab"
                            aria-label={`Open ${displayName} in new tab`}
                            onClick={(e) => {
                                e.stopPropagation()
                                window.open(`${window.location.origin}/preview/${file.id}`, "_blank")
                            }}
                        >
                            <span>Open</span>
                            <SquareArrowOutUpRight size={13} strokeWidth={2.25} aria-hidden />
                        </button>
                        <button
                            type="button"
                            className="file-item-action"
                            title={copied ? "Copied!" : "Copy file URL"}
                            aria-label={copied ? "Copied!" : `Copy link to ${displayName}`}
                            onClick={(e) => {
                                e.stopPropagation()
                                navigator.clipboard.writeText(
                                    `${window.location.origin}/preview/${file.id}`
                                ).then(() => {
                                    setCopied(true)
                                    setTimeout(() => setCopied(false), 1500)
                                })
                            }}
                        >
                            {copied
                                ? <Check size={13} strokeWidth={2.25} aria-hidden />
                                : <Copy size={13} strokeWidth={2.25} aria-hidden />
                            }
                        </button>
                        <button
                            type="button"
                            className="file-item-action"
                            title={peekOpenForThisFile ? "Close peek" : "Peek — side preview"}
                            aria-label={
                                peekOpenForThisFile
                                    ? `Close peek for ${displayName}`
                                    : `Peek ${displayName} in side panel`
                            }
                            aria-pressed={peekOpenForThisFile}
                            onClick={(e) => {
                                e.stopPropagation()
                                togglePeek()
                            }}
                        >
                            <span>Peek</span>
                            <Eye size={13} strokeWidth={2.25} aria-hidden />
                        </button>
                    </div>
                </div>
                <div className={"column"}>{new Date(file.createdAt).toLocaleString()}</div>
                <div className={"column"}>{FileType(file.type, layoutState==0 || viewportWidth < 768, true)}</div>
                <div className={"column"}>{file.creator_email}</div>
                <div className={"column"}>{displayName}</div>
                <div
                    style={{
                        position: "absolute",
                        right: "0",
                        height: "100%",
                        ...onEnter,
                        backgroundColor: "var(--background)",
                        borderRadius: "var(--border-rad)",
                        transition: "width 0.5s ease-in-out 0.2s",
                        pointerEvents: "none",
                    }}
                    aria-hidden
                />
            </div>      
        </div>
    )

}