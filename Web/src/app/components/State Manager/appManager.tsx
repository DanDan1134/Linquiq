"use client"
import { create } from 'zustand'

// Updated File type to match your Drizzle schema
export type File = {
    id: string,
    creator_id: string,
    name: string,
    type: string,
    description: string | null,
    file_id: string | null, // S3 key
    createdAt: string,
    creator_email : string | null
}

export type SearchResult = {
    file: File,
    matchedIn: "name" | "content" | "linked-content",
    snippet: string | null,
    matchedChildName?: string
}

interface FileManagerState {
    layoutState: number,
    SetLayoutState: (layoutNum: number) => void,
    files: Map<string, File>,
    SetFiles: (files: File[]) => void,
    UpdateFiles: (files: File[]) => void,
    uploadFiles: (files: FileList, onProgress: null | ((name: string, percent: number) => void)) => Promise<void>,
    deleteFiles: () => Promise<void>,
    loading: boolean,
    SetLoading: (loading: boolean) => void,
    selectedFiles: Set<string>,
    SelectFile: (fileId: string, selected: boolean) => void,
    SetSelectionForIds: (fileIds: string[], selected: boolean) => void,
    ClearSelection: () => void,
    previewedFile : File | undefined,
    SetPreviewedFile : (file : File | undefined) => void,
    error: string | null,
    SetError: (error: string | null) => void,
    searchQuery: string,
    SetSearchQuery: (query: string) => void,
    searchResults: SearchResult[] | null,
    SetSearchResults: (results: SearchResult[] | null) => void,
    searchLoading: boolean,
    actionLoading: boolean,
    actionLabel: string,
    SetActionLoading: (loading: boolean, label?: string) => void,
}

type UploadJob = {
    displayName: string,
    uploadFile: globalThis.File,
    storedName: string,
}

const isHeicFile = (file: globalThis.File): boolean => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const mimeType = file.type.toLowerCase();

    return (
        extension === "heic" ||
        extension === "heif" ||
        mimeType === "image/heic" ||
        mimeType === "image/heif"
    );
};

const toJpgName = (name: string): string => {
    return name.replace(/\.[^.]+$/, ".jpg");
};

const convertHeicToJpeg = async (file: globalThis.File): Promise<UploadJob> => {
    if (!isHeicFile(file)) {
        return {
            displayName: file.name,
            uploadFile: file,
            storedName: file.name,
        };
    }

    const heic2anyModule = await import("heic2any");
    const conversionResult = await heic2anyModule.default({
        blob: file,
        toType: "image/jpeg",
        quality: 0.9,
    });

    const convertedBlob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
    const jpgName = toJpgName(file.name);
    const convertedFile = new globalThis.File([convertedBlob], jpgName, {
        type: "image/jpeg",
        lastModified: file.lastModified,
    });

    return {
        displayName: file.name,
        uploadFile: convertedFile,
        storedName: jpgName,
    };
};

export const useFileStore = create<FileManagerState>()((set, get) => ({
    layoutState: 0,
    SetLayoutState: (layoutNum) => set(() => ({ layoutState: layoutNum })),
    
    files: new Map<string, File>(),
    SetFiles: (newFiles) => {
        const newMap = new Map<string, File>();
        newFiles.forEach((f: File) => {
            newMap.set(f.id, f)
        })
        set({ files: newMap })
    },
    
    UpdateFiles: (newFiles) => {
        set((state) => {
            const updatedFiles = new Map(state.files);
            newFiles.forEach((file) => {
                updatedFiles.set(file.id, file);
            });
            return { files: updatedFiles };
        });
    },
    

    loading: false,
    SetLoading: (loading) => set({ loading }),

    selectedFiles: new Set<string>(),
    SelectFile: (fileId, selected) => {
        set((state) => {
            const newSelectedFiles = new Set(state.selectedFiles);
            if (selected) {
                newSelectedFiles.add(fileId);
            } else {
                newSelectedFiles.delete(fileId);
            }
            console.log(newSelectedFiles)
            return { selectedFiles: newSelectedFiles };
        });
    },
    SetSelectionForIds: (fileIds, selected) => {
        set((state) => {
            const next = new Set(state.selectedFiles);
            for (const id of fileIds) {
                if (selected) next.add(id);
                else next.delete(id);
            }
            return { selectedFiles: next };
        });
    },
    ClearSelection: () => set({ selectedFiles: new Set() }),


    previewedFile : undefined,
    SetPreviewedFile : ( file ) => {
        console.log(file)
        set({previewedFile : file})
    },



    error: null,
    SetError: (error) => set({ error }),

    searchQuery: "",
    SetSearchQuery: (query) => set({ searchQuery: query }),
    searchResults: null,
    SetSearchResults: (results) => set({ searchResults: results }),
    searchLoading: false,
    actionLoading: false,
    actionLabel: "",
    SetActionLoading: (loading, label = "") => set({ actionLoading: loading, actionLabel: label }),

    uploadFiles: async (files, onProgress = null) => {
        const { SetLoading, SetError, UpdateFiles } = get();
        
        SetLoading(true);
        SetError(null);

        try {
            const uploadJobs = await Promise.all(
                Array.from(files).map(async (file) => {
                    return await convertHeicToJpeg(file);
                })
            );

            // Get presigned URLs
            const response = await fetch(
                `/api/files/upload-helper?count=${uploadJobs.length}`,
                {
                    method: "GET",
                    credentials: "include",
                }
            );

            if (!response.ok) {
                throw new Error("Failed to get upload URLs");
            }

            const { urls, keys } = await response.json();

            // Upload each file to S3
            const uploadPromises = uploadJobs.length > 0 ? uploadJobs.map(async (uploadJob, index) => {
                return new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("PUT", urls[index]);
                    xhr.setRequestHeader("Content-Type", uploadJob.uploadFile.type || "application/octet-stream");

                    xhr.onload = async () => {
                        if (xhr.status === 200) {
                            if (onProgress) {
                                onProgress(uploadJob.displayName, 100);
                            }
                            
                            const fileVerResponse = await fetch("/api/files/verify", {
                                                    method: "POST",
                                                    credentials: "include",
                                                    headers: {
                                                        "Content-Type": "application/json",
                                                    },
                                                    body: JSON.stringify({
                                                        keys: [keys[index]],
                                                        fileNames: [uploadJob.storedName],
                                                    }),
                                                })

                            if (!fileVerResponse.ok) {
                                const errorData = await fileVerResponse.json();
                                
                                throw new Error("Failed to verify files", errorData);
                            }

                            const { data, message} = await fileVerResponse.json();

                            console.log(data)

                             // Set success message based on response
                            if (message.includes("All files")) {
                                SetError("✅ All files uploaded successfully!");
                            } else {
                                SetError("⚠️ Some files uploaded successfully");
                            }
                            
                            // Update the store with the new files
                            UpdateFiles(data);
                                            
                            resolve()
                        } else {
                            reject(new Error(`Failed to upload ${uploadJob.displayName}`));
                        }
                    };

                    xhr.onerror = () => {
                        reject(new Error(`XHR error for ${uploadJob.displayName}`));
                    };

                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable && onProgress) {
                            const percent = (event.loaded / event.total) * 100;
                            onProgress(uploadJob.displayName, percent);
                        }
                    };

                    xhr.send(uploadJob.uploadFile);
                });
            }) : [];

            // Wait for all uploads to complete
            await Promise.all(uploadPromises);

            // Verify files with the database
            

            
            
           

        } catch (error) {
            console.error("Upload error:", error);
            SetError(`❌ Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            SetLoading(false);
        }
    },

    deleteFiles: async () => {
        const { selectedFiles, SetFiles, ClearSelection } = get();
        const fileIds = Array.from(selectedFiles);
        
        await Promise.all(fileIds.map(async (fileId) => {
            const response = await fetch(`/api/files/${fileId}`, {
                method: "DELETE",
                credentials: "include",
            });

            if (!response.ok) {
                console.error(`Failed to delete file with ID: ${fileId}`);
            }
        }));

        // Update the store to remove deleted files
        SetFiles(Array.from(get().files.values()).filter(file => !selectedFiles.has(file.id)));
        ClearSelection();
    }
}));