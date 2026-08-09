import { getFileDataForUser } from "./getFileData";

/** True when the entry exists and `owner_id` matches `user_id`. */
export const isFileOwner = async (file_id: string, user_id: string) => {
    const row = await getFileDataForUser(file_id, user_id);
    return row !== null;
};
