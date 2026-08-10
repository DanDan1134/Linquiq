

export interface FileData {
    owner_id: string;
    creator_id: string;
    name: string;
    type: string;
    file_id?: string;
    creator_email? : string;
    /** Optional client-generated UUID so offline preview URLs match after sync. */
    id?: string;
}