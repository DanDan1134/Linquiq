"use client"
import { useState, type CSSProperties } from "react"
import { NewPage, VerticalDiv, HorizontalDiv } from "@/app/components/UILayout"
import { UserButton } from "@clerk/nextjs"
import { PrivacyHeaderActions } from "@/app/components/PrivacyHeaderActions"
import { FilesList } from "@/app/components/FileList"
import { DashboardSearchField } from "@/app/components/FileList/DashboardSearchField"
import { DashboardFilterButton } from "@/app/components/FileList/DashboardFilterButton"
import { FileListFilterProvider } from "@/app/components/FileList/fileListFilterContext"
import { useFileStore } from "@/app/components/State Manager/appManager"
import { Preview } from "@/app/components/Preview"
import UploadArea from "@/app/components/Uploads/UploadArea"
import { TextEditor } from "@/app/components/TextEditor"
import { FileType } from "@/app/components/TypeTags"
import { DeleteButton } from "@/app/components/DeleteButton"
import { PencilLine, Upload, X, SquareArrowOutUpRight } from "lucide-react"
import { getDisplayFileName } from "@/lib/client/getFileType"


export const Dashboard = ({}) => {
    const layoutState = useFileStore((state)=>state.layoutState)
    const setLayoutState = useFileStore((state)=>state.SetLayoutState)
    const previewedFile = useFileStore((state)=>state.previewedFile)
    const [uploadPopupOpen, setUploadPopupOpen] = useState(false)

    const heightOfDock = "5.5%";
    const heightOfTopBar = "3%";
    /** In-flow file list: reserve space for dock + top bar (see dock div + header). */
    const mainContentHeight = `calc(100% - ${heightOfDock} - ${heightOfTopBar} - 1rem)`;
    const mainContentSlotStyle = {
        position: "relative" as const,
        zIndex: 1,
        height: mainContentHeight,
        minHeight: 0,
        overflow: "hidden" as const,
        display: "flex" as const,
        flexDirection: "column" as const,
        pointerEvents: "none" as const,
    };
    /**
     * Overlay slot: use top + bottom (not height %) so panels end above the dock.
     * Plain div — VerticalDiv only syncs layout styles when `state` changes, so dynamic height here was ignored.
     * bottom includes dock minHeight + its paddingTop.
     */
    const overlayContentSlotStyle: CSSProperties = {
        position: "absolute",
        left: 0,
        right: 0,
        width: "100%",
        top: `calc(${heightOfTopBar} + 1rem)`,
        /** Align overlay panel bottoms with the in-flow list panel (dock row + extra spacing in this column stack). */
        bottom: `calc(${heightOfDock} + 1rem)`,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        pointerEvents: "none",
        zIndex: 1,
        boxSizing: "border-box",
    };
    // avoid server-side window access
    const previewUrl = previewedFile?.id ? `/preview/${previewedFile.id}` : "#";
    const previewName = getDisplayFileName(previewedFile?.name, previewedFile?.type);
    const previewCreatedAt = previewedFile?.createdAt ? new Date(previewedFile.createdAt) : null;
    const createdLocal = previewCreatedAt && !Number.isNaN(previewCreatedAt.getTime()) ? previewCreatedAt.toLocaleString() : "Unknown";
    const createdUtc = previewCreatedAt && !Number.isNaN(previewCreatedAt.getTime()) ? previewCreatedAt.toISOString() : "Unknown";
    return (       
        <NewPage>    
            <VerticalDiv style={{position : "relative", borderWidth: "0px", borderColor: "transparent", height: "100%", minHeight: 0, overflow: "hidden", overscrollBehavior: "none" }} padding="1rem">
                    
                    <FileListFilterProvider>
                    <VerticalDiv
                        padding="1rem"
                        gap="0rem"
                        style={{
                            flex: "1 1 auto",
                            minHeight: 0,
                            height: "100%",
                            overflow: "hidden",
                            overscrollBehavior: "none",
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        <div style={{ position: "relative", zIndex: 20, height: heightOfTopBar, minHeight: `calc(${heightOfTopBar} + 1rem)`, width: "100%", padding: "0rem 2rem", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", boxSizing: "border-box" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/Linquiq title.png" alt="Linquiq" style={{ height: "37px", width: "107px", objectFit: "contain", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                                <DashboardSearchField />
                                <DashboardFilterButton />
                            </div>
                            <PrivacyHeaderActions>
                                <UserButton />
                            </PrivacyHeaderActions>
                        </div>
                            
                        <VerticalDiv padding="0rem" style={mainContentSlotStyle}>    
                            <HorizontalDiv style={{
                                position: "relative",
                                height: `100%`,
                                minHeight: 0,
                                flex: "1 1 auto",
                                zIndex: 2,
                                isolation: "isolate",
                                backgroundColor: "var(--accent-color)",
                                borderRadius: "var(--border-rad)",
                                overflow: "hidden",
                                alignItems: "stretch",
                                pointerEvents: "auto",
                                transition: "width 0.2s, left 0.2s, right 0.2s",
                            }} layouts={[
                                    {
                                        left : 0,
                                        width : "100%",
                                    },
                                    {
                                        left : 0,
                                        width : "60%",
                                    },
                                    {
                                        left: "40%",
                                        width : "60%",
                                    }
                                ]} 
                                state={layoutState}
                                padding = "0rem"
                            >
                            
                                <FilesList />
                                
                            </HorizontalDiv>
                        </VerticalDiv>
                        <div style={{minHeight: heightOfDock, backgroundColor : "var(--background)", zIndex : "999", paddingTop : "1rem"}}>
                            {/*Dock - Action Buttons */}
                            <div className={"dock"} style={{position: "relative", width : "fit-content", top : "50%", left: "50%", transform: "translate(-50%, -50%)", display : "flex", alignItems : "center", justifyContent : "center"}}>
                                <button type="button" className={"but upload"} onClick={() => setUploadPopupOpen(true)}>
                                    <div className={"but-content"} style={{display : "flex", alignItems : "center"}}>
                                        <Upload size={16} style={{marginRight : "0.25rem"}}/>
                                        Upload
                                    </div>
                                </button>
                                {uploadPopupOpen && (
                                    <>
                                        <div
                                            style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.4)" }}
                                            onClick={() => setUploadPopupOpen(false)}
                                            aria-hidden
                                        />
                                        <div
                                            style={{
                                                position: "fixed",
                                                bottom: "8rem",
                                                left: "50%",
                                                transform: "translateX(-50%)",
                                                zIndex: 9999,
                                            }}
                                        >
                                            <UploadArea onClose={() => setUploadPopupOpen(false)} />
                                        </div>
                                    </>
                                )}
                                <button className={"but new-note"} onClick={()=>{
                                    if (layoutState !== 2)
                                    setLayoutState(2);
                                    else
                                    setLayoutState(0);

                                }}> 
                                    <div className={"but-content"} style={{display : "flex", alignItems : "center"}}>
                                        <PencilLine size={16} style={{marginRight : "0.25rem"}}/>
                                        {layoutState !== 2 ? "New Note" : "Close Editor"}
                                    </div> 
                                </button>
                                
                                <DeleteButton/>
                                
                            </div>
                        </div>
                    </VerticalDiv>
                    </FileListFilterProvider>
                
                    
                
                <VerticalDiv style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", zIndex: 0, overflow: "hidden", overscrollBehavior: "none" }} >
                <div style={overlayContentSlotStyle}>
                <HorizontalDiv style={{position : "relative", left : "0", height : "100%", minHeight: 0, flex: "1 1 auto", overflow: "hidden", overscrollBehavior: "none" }}>
                    
                    <VerticalDiv
                        padding="0rem"
                        color="var(--accent-color)"
                        style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            right: 0,
                            width: "calc(40% - 1rem)",
                            height: "100%",
                            minHeight: 0,
                            borderRadius: "var(--border-rad)",
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                            pointerEvents: "auto",
                            zIndex: 2,
                            boxSizing: "border-box",
                            padding: "0.35rem 1rem 1rem",
                        }}
                    >
                        <div style={{display : "flex", flexDirection : "column", gap : "1rem", width : "100%", flexShrink: 0, boxSizing : "border-box", borderBottomLeftRadius : "var(--border-rad)", borderBottomRightRadius : "var(--border-rad)"}}>
                            <div style={{display : "flex", flexDirection : "row", width : "100%", height : "57px", justifyContent : "space-between", alignItems : "center"}}>
                                <h1 style={{fontSize : "2rem", whiteSpace : "nowrap", overflow : "hidden", textOverflow : "ellipsis"}}>{previewName}</h1>
                                <button
                                    onClick={() => setLayoutState(0)}
                                    style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "var(--foreground)",
                                        cursor: "pointer",
                                        padding: "0.5rem",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                    aria-label="Close preview"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                            <div style={{display : "flex", flexDirection : "column", gap : "0.5rem"}}>
                                {FileType(previewedFile?.type, true, false)}
                                <span title={previewedFile?.id}><span style={{fontWeight : "bold"}}>File ID:</span> {previewedFile?.id}</span>
                                <span
                                    style={{
                                        display: "flex",
                                        flexDirection: "row",
                                        alignItems: "center",
                                        flexWrap: "nowrap",
                                        gap: "0.35rem",
                                        width: "100%",
                                        minWidth: 0,
                                    }}
                                >
                                    <span style={{ fontWeight: "bold", flexShrink: 0 }}>File Url:</span>
                                    <div
                                        className="url preview"
                                        style={{
                                            flex: "1 1 0",
                                            minWidth: 0,
                                            width: "auto",
                                        }}
                                    >
                                        <a
                                            href={previewUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={previewUrl}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "0.35rem",
                                                minWidth: 0,
                                                maxWidth: "100%",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    minWidth: 0,
                                                }}
                                            >
                                                {previewUrl}
                                            </span>
                                            <SquareArrowOutUpRight size={12} aria-hidden style={{ flexShrink: 0 }} />
                                        </a>
                                    </div>
                                </span>
                                <span title={previewedFile?.createdAt}><span style={{fontWeight : "bold"}}>Created:</span> {createdLocal}</span>
                                <span><span style={{fontWeight : "bold"}}>UTC:</span> {createdUtc}</span>
                                <span><span style={{fontWeight : "bold"}}>Creator:</span> {previewedFile?.creator_email}</span>
                            </div>
                        </div>
                        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                            <Preview />
                        </div>
                    </VerticalDiv>

                    <VerticalDiv style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "calc(40% - 1rem)", borderRadius: "var(--border-rad)", overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", minHeight: 0, pointerEvents: "auto", zIndex: 2 }} color="var(--accent-color)" padding="1rem">
                        <div className="note-editor-header-bar">
                            <div className="note-editor-header-type">
                                {FileType("md")}
                            </div>
                            <button
                                type="button"
                                onClick={() => setLayoutState(0)}
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--foreground)",
                                    cursor: "pointer",
                                    padding: "0.35rem",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }}
                                aria-label="Close editor"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        <TextEditor />
                    </VerticalDiv>

                </HorizontalDiv>
                </div>
                </VerticalDiv>
                

            </VerticalDiv>

            
            
        </NewPage>
    )
}