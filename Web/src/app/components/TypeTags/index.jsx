"use client";
import "./Tag.css";
import { getFileType } from "@/lib/client/getFileType";

export const Bundle = ({ layout = true, scaling=false }) => {
    return (
        <div className={`tag bundle${!layout ? " small" : ""}${!scaling ? " scaling" : ""}`}>
            <div className="marker" />
            <div className={`text ${layout ? `${!scaling ? "scaling" : ""}` : "small"}`}>linq</div>
        </div>
    );
};

export const Document = ({ layout = true, scaling=false }) => {
    return (
        <div className={`tag doc${!layout ? " small" : ""}${!scaling ? " scaling" : ""}`}>
            <div className="marker" />
            <div className={`text ${layout ? `${!scaling ? "scaling" : ""}` : "small"}`}>Document</div>
        </div>
    );
};

export const Recording = ({ layout = true, scaling=false }) => {
    return (
        <div className={`tag rec${!layout ? " small" : ""}${!scaling ? " scaling" : ""}`}>
            <div className="marker" />
            <div className={`text ${layout ? `${scaling ? "scaling" : ""}` : "small"}`}>Recording</div>
        </div>
    );
};

export const Note = ({ layout = true, scaling=false }) => {
    return (
        <div className={`tag note${!layout ? " small" : ""}${!scaling ? " scaling" : ""}`}>
            <div className="marker" />
            <div className={`text ${layout ? `${!scaling ? "scaling" : ""}` : "small"}`}>Note</div>
        </div>
    );
};

export const Img = ({ layout = true, scaling=false }) => {
    return (
        <div className={`tag img${!layout ? " small" : ""}${!scaling ? " scaling" : ""}`}>
            <div className="marker" />
            <div className={`text ${layout ? `${!scaling ? "scaling" : ""}` : "small"}`}>Image</div>
        </div>
    );
};

export const FileType = (filename, layout = true, scaling = false) => {
    const fileType = getFileType(filename);
    switch (fileType) {
        case "Bundle":
            return <Bundle layout={layout} scaling={scaling} />;
        case "Document":
            return <Document layout={layout} scaling={scaling} />;
        case "Image":
            return <Img layout={layout} scaling={scaling}    />;
        case "Note":
            return <Note layout={layout} scaling={scaling} />;
        case "Recording":
            return <Recording layout={layout} scaling={scaling} />;
        default:
            return <p>Type ?</p>;
    }
};
