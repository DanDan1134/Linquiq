"use client"

import "./style.css"
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"
import Placeholder from "@tiptap/extension-placeholder"
import StarterKit from "@tiptap/starter-kit"
import { EditorContent, useEditor } from "@tiptap/react"

import { all, createLowlight } from "lowlight"
import React from "react"

import { useFileStore } from "@/app/components/State Manager/appManager"
import { sanitizeHtml } from "@/lib/client/sanitizeHtml"

const lowlight = createLowlight(all)

const PLACEHOLDER = "Start typing...."

export const TextEditor = () => {
    const uploadFilesAction = useFileStore((state) => state.uploadFiles)
    const SetActionLoading = useFileStore((state) => state.SetActionLoading)
    const editor = useEditor({
        extensions: [
            StarterKit,
            CodeBlockLowlight.configure({
                lowlight,
            }),
            Placeholder.configure({
                placeholder: PLACEHOLDER,
                showOnlyWhenEditable: true,
            }),
        ],
        content: ``,
        immediatelyRender: false,
    })

    if (!editor) {
        return null
    }

    return (
        <div className="text-editor-root">
            <div className="text-editor-body">
                <EditorContent editor={editor} className="text-editor-content-root" />
            </div>
            <button
                type="button"
                className="text-editor-save"
                onClick={async () => {
                    const noteText = sanitizeHtml(editor.getHTML())
                    const plainText = editor.getText().replace(/\s+/g, " ").trim()
                    const fallbackTitle =
                        plainText.length >= 15
                            ? plainText.slice(0, 15)
                            : plainText.length >= 4
                              ? plainText
                              : plainText.length > 0
                                ? plainText
                                : "Untitled Note"
                    const resolvedTitle = fallbackTitle.replace(/[\\/:*?"<>|]/g, "-")

                    const notefile = new File([noteText], resolvedTitle + ".txt", {
                        type: "text/html",
                    })
                    const dataTransfer = new DataTransfer()
                    dataTransfer.items.add(notefile)
                    const fileList = dataTransfer.files
                    try {
                        SetActionLoading(true, "Saving note...")
                        await uploadFilesAction(fileList, null)
                    } catch (err) {
                        console.error("Error uploading file:", err)
                    } finally {
                        SetActionLoading(false)
                    }
                }}
            >
                Save
            </button>
        </div>
    )
}
