"use client"

import { useRef, useState, useEffect } from "react"
import { useFileStore } from "../State Manager/appManager"

const ListItem = ({ index, name, remove, percentage = 0 }) => {
    const [isHovered, setIsHovered] = useState(false)
    const [removeHovered, setRemoveHovered] = useState(false)
    const SetError = useFileStore((state) => state.SetError)

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: "0.65rem",
                position: "relative",
                overflowX: "hidden",
                padding: "0.45rem 0.65rem 0.55rem",
                margin: "0 -0.15rem",
                borderRadius: "calc(var(--border-rad) * 0.65)",
                transition: "background-color 0.15s ease",
                backgroundColor: isHovered ? "rgba(255,255,255,0.06)" : "transparent",
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <button
                type="button"
                style={{
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    borderRadius: "var(--border-rad)",
                    padding: "0.25rem 0.5rem",
                    zIndex: 1000,
                    left: isHovered ? "0.5rem" : "-2rem",
                    pointerEvents: isHovered ? "auto" : "none",
                    transition: "left 0.2s, background-color 0.2s",
                    cursor: "pointer",
                    border: "none",
                    backgroundColor: removeHovered ? "#ffc2c3" : "transparent",
                    color: removeHovered ? "#f52727" : "var(--foreground)",
                }}
                onMouseEnter={() => { setRemoveHovered(true); setIsHovered(true) }}
                onMouseLeave={() => setRemoveHovered(false)}
                onClick={() => {
                    remove(name)
                    SetError(null)
                }}
                aria-label={`Remove ${name}`}
            >
                −
            </button>
            <div
                style={{
                    minWidth: "1.35rem",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    opacity: isHovered ? 0 : 0.45,
                    textAlign: "center",
                    flexShrink: 0,
                }}
            >
                {index}
            </div>
            <span
                style={{
                    overflowX: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    fontSize: "0.84rem",
                }}
            >
                {name}
            </span>
            <div
                style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    height: "4px",
                    width: `${percentage}%`,
                    backgroundColor: "rgba(34, 211, 238, 0.95)",
                    borderRadius: "999px",
                    transition: "width 0.15s linear",
                    zIndex: 1001,
                    pointerEvents: "none",
                }}
            />
        </div>
    )
}

const UploadArea = ({ onClose }) => {
    const fileInputRef = useRef(null)
    const [files, setFiles] = useState([])
    const [progress, setProgress] = useState({})
    const uploadFiles = useFileStore((state) => state.uploadFiles)
    const SetError = useFileStore((state) => state.SetError)

    const onProgress = (name, percent) => {
        setProgress((prev) => ({ ...prev, [name]: percent }))
    }

    useEffect(() => {
        setFiles((prev) => prev.filter((f) => progress[f.name] !== 100))
    }, [progress])

    const removeFile = (name) => {
        setFiles((prev) => prev.filter((f) => f.name !== name))
        setProgress((prev) => {
            const next = { ...prev }
            delete next[name]
            return next
        })
    }

    const handleAddClick = () => {
        if (fileInputRef.current) fileInputRef.current.click()
        else SetError("Upload not ready")
    }

    const handleFileChange = (e) => {
        const newFiles = e.target.files ? Array.from(e.target.files) : []
        const combined = [...files, ...newFiles]
        const capped = combined.length > 10 ? combined.slice(0, 10) : combined
        if (combined.length > 10) SetError("Max 10 files")
        setFiles(capped)
        const nextProgress = {}
        capped.forEach((f) => (nextProgress[f.name] = 0))
        setProgress(nextProgress)
        e.target.value = ""
    }

    const handleUpload = async () => {
        if (!files.length) {
            SetError("No files selected")
            return
        }
        SetError(null)
        try {
            const dt = new DataTransfer()
            files.forEach((f) => dt.items.add(f))
            await uploadFiles(dt.files, onProgress)
            setFiles([])
            setProgress({})
            onClose?.()
        } catch (err) {
            SetError(err instanceof Error ? err.message : "Upload failed")
        }
    }

    const secondaryBtn = {
        background: "rgba(255,255,255,0.08)",
        color: "var(--foreground)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: "var(--border-rad)",
        padding: "0.4rem 0.75rem",
        fontSize: "0.82rem",
        fontWeight: 500,
        cursor: "pointer",
        transition: "background-color 0.15s ease, border-color 0.15s ease",
    }

    return (
        <div
            style={{
                border: "1px solid rgba(255,255,255,0.12)",
                padding: "1.25rem",
                borderRadius: "var(--border-rad)",
                backgroundColor: "var(--accent-color)",
                minWidth: "340px",
                maxWidth: "440px",
                boxSizing: "border-box",
                boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    marginBottom: "1rem",
                    paddingBottom: "0.85rem",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            fontWeight: 600,
                            fontSize: "1.05rem",
                            letterSpacing: "-0.02em",
                            color: "var(--foreground)",
                        }}
                    >
                        File upload
                    </div>
                    <div style={{ fontSize: "0.72rem", opacity: 0.48, marginTop: "0.25rem", lineHeight: 1.35 }}>
                        Up to 10 files per batch
                    </div>
                </div>
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            flexShrink: 0,
                            width: "2rem",
                            height: "2rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(255,255,255,0.06)",
                            border: "none",
                            borderRadius: "var(--border-rad)",
                            color: "var(--foreground)",
                            cursor: "pointer",
                            fontSize: "1.2rem",
                            lineHeight: 1,
                            opacity: 0.75,
                            transition: "background-color 0.15s ease, opacity 0.15s ease",
                        }}
                        aria-label="Close"
                    >
                        ×
                    </button>
                )}
            </div>

            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    overflowY: "auto",
                    overflowX: "hidden",
                    maxHeight: "220px",
                    minHeight: files.length ? undefined : "5.5rem",
                    padding: "0.35rem 0.15rem",
                    marginBottom: "1rem",
                    borderRadius: "calc(var(--border-rad) * 0.75)",
                    background: "rgba(0,0,0,0.18)",
                    border: "1px solid rgba(255,255,255,0.06)",
                }}
            >
                {files.map((f, i) => (
                    <ListItem
                        key={`${f.name}-${i}`}
                        index={i + 1}
                        name={f.name}
                        remove={removeFile}
                        percentage={progress[f.name] ?? 0}
                    />
                ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.6rem",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                        <button type="button" onClick={handleAddClick} style={secondaryBtn}>
                            Add files
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            style={{ visibility: "hidden", position: "absolute", width: 0, height: 0 }}
                            onChange={handleFileChange}
                        />
                        <button
                            type="button"
                            onClick={() => {
                                setFiles([])
                                setProgress({})
                            }}
                            style={{
                                ...secondaryBtn,
                                opacity: files.length ? 1 : 0.4,
                            }}
                        >
                            Clear all
                        </button>
                    </div>
                    <span
                        style={{
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            opacity: 0.45,
                            padding: "0.2rem 0.5rem",
                            borderRadius: "999px",
                            background: "rgba(255,255,255,0.06)",
                        }}
                    >
                        {files.length} / 10
                    </span>
                </div>
                <button
                    type="button"
                    onClick={handleUpload}
                    style={{
                        width: "100%",
                        padding: "0.65rem 1rem",
                        fontSize: "0.92rem",
                        fontWeight: 600,
                        border: "none",
                        borderRadius: "var(--border-rad)",
                        cursor: "pointer",
                        backgroundColor: "var(--bundle-color-2)",
                        color: "#fff",
                        transition: "filter 0.15s ease, opacity 0.15s ease",
                        opacity: files.length ? 1 : 0.45,
                    }}
                >
                    Upload
                </button>
            </div>
        </div>
    )
}

export default UploadArea
