"use client"

import { useEffect, useState, useRef } from "react";
import type { File } from "../State Manager/appManager";
import { useFileStore } from "../State Manager/appManager";
import { getFileUrl, type FileUrlResult } from "@/lib/server/getFileUrl";
import { getFileType } from "@/lib/client/getFileType"
import { VerticalDiv } from "../UILayout";
import Bundle from "./Views/Bundle";
import { sanitizeHtml } from "@/lib/client/sanitizeHtml";
import { PrivateDocumentPreview } from "@/app/components/Preview/PrivateDocumentPreview";
import { privateFileSrc } from "@/lib/client/privateFileSrc";

const NoteView = ({fileUrl}: {fileUrl: string}) => {
    const [fileSrc, setFileSrc] = useState<string | undefined>(undefined)
    useEffect(()=>{
        const GetFileSrc = async () => {
            const fileSrc = await fetch(fileUrl as string)
            const fileText = await fileSrc.text()
            setFileSrc(sanitizeHtml(fileText))
        }
        GetFileSrc()
    }, [fileUrl])

    if(!fileSrc){
        return <div>
            Loading...
        </div>
    }
    return (
        <div style={{
            width : "100%",
            height : "100%",
            display : "flex",
            flexDirection : "column",
            gap : "1rem",
            alignItems : "left",
        }}>
            
            <div dangerouslySetInnerHTML={{__html: fileSrc}} />
        </div>
    )
}




export const Preview = () => {
    const previewedFile = useFileStore((state) => state.previewedFile)
    const layoutState = useFileStore((state)=>state.layoutState)

    const [fileUrl, SetFileUrl] = useState<FileUrlResult[] | undefined>([{ url: "", data: null }]);
    const [fileType, SetFileType] = useState<string>(getFileType(previewedFile?.name || ""))

    const videoRef = useRef<HTMLVideoElement>(null);



  


    useEffect(()=>{

        const GetFileUrl = async (file: File) => {
            const file_url = await getFileUrl(file, false);
            const file_type = getFileType(file.type);
            SetFileUrl(file_url)
            SetFileType(file_type)
            return file_url
        }


        if(previewedFile){
            GetFileUrl(previewedFile)
        }
    }, [previewedFile])


    useEffect(()=>{
        if(layoutState === 1 && videoRef.current){
            videoRef.current.play()
        }
        else if(layoutState === 0 && videoRef.current){
            videoRef.current.pause()
        }
    }, [layoutState, videoRef])





    const DisplayFile = () => {
        const id = previewedFile?.id
        const privateSrc = privateFileSrc(id)
        const mediaSrc = privateSrc

        if(fileType === "Bundle") {
            if(!fileUrl || fileUrl[0].url === "") {
                return <div>File not Found or something else when wrong...sorrry!</div>
            }
            return <Bundle bundle_data={fileUrl} />
        }

        if(!mediaSrc && fileType !== "Document"){
            return (<div>
                File not Found or something else when wrong...sorrry!
            </div>)
        }
        switch (fileType){
            case "Document": {
                const entry = fileUrl?.[0]?.data as { id?: string; name?: string; type?: string } | null
                return (
                    <div style={{
                        width : "100%",
                        display : "flex",
                        flexDirection : "column",
                        gap : "1rem",
                    }}>
                        <PrivateDocumentPreview
                            fileId={entry?.id || previewedFile?.id}
                            fileType={previewedFile?.type || entry?.type || "pdf"}
                            fileName={previewedFile?.name || entry?.name}
                        />
                    </div>
                )
            }

            case "Image" : {
                return (
                    <img src={mediaSrc} alt="" style={{
                        width : "100%",
                        borderRadius : "var(--border-rad)",
                        objectFit : "contain",
                        objectPosition : "center",
                    }} />
                )
            }

            case "Recording" : {
                return (
                    <video src={mediaSrc} ref={videoRef} autoPlay={true} muted={true} style={{
                        width : "100%",
                        borderRadius : "var(--border-rad)",
                        objectFit : "contain",
                        objectPosition : "center",
                    }} controls={true}/>
                )
            }

            case "Note" : {
                return mediaSrc ? (
                    <>
                        <NoteView fileUrl={mediaSrc} />
                    </>
                ) : <div>File not Found or something else when wrong...sorrry!</div>
            }

            default: {
                return <div>
                    File type unexpected.
                </div>
            }

            
        }

    }


    return (
        <VerticalDiv style={{width : "100%", height : "100%", minHeight : 0, padding : "1rem", boxSizing : "border-box", overflowY : "auto", overscrollBehaviorY : "none"}}> 
            
            {fileType==="Bundle" && fileUrl !== undefined ? (
                    <Bundle bundle_data={fileUrl} />
                ) : (DisplayFile())}
                
            
        </VerticalDiv>
    )}