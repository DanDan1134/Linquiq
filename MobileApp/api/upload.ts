import { apiGet, apiPost } from './client'
import * as FileSystem from 'expo-file-system/legacy'
import { logUploadPipeline } from '../utils/perfLog'
import { truncateNameForLog, isShareableEntryId } from '../utils/helpers'
import {
  convertHeicToJpeg,
  isHeicSource,
  jpgNameFromHeicUploadName,
} from '../utils/fileHelpers'

/** Get presigned PUT URLs (and keys) for S3 */
async function getUploadUrls(count = 1): Promise<{ ok: boolean; urls: string[]; keys: string[] }> {
  const payload = await apiGet<any>(`/files/upload-helper?count=${count}`)
  const ok = !!(payload?.okay ?? payload?.ok ?? true)
  const urls = payload?.urls ?? []
  const keys = payload?.keys ?? []
  if (!urls.length || !keys.length) throw new Error('upload-helper did not return urls/keys')
  return { ok, urls, keys }
}

/** One URL/key pair */
export async function getPresignedUrl(): Promise<{ url: string; key: string }> {
  const { urls, keys } = await getUploadUrls(1)
  return { url: urls[0], key: keys[0] }
}

/**
 * Pick the DB entry id returned by /files/verify (UUID), not the S3 object key.
 * When a client UUID was sent, prefer it if the parser cannot find a UUID in the body
 * (avoids rewriting local ids to the 32-char hex S3 key).
 */
export function serverFileIdFromVerifyResponse(
  verifyJson: unknown,
  s3Key: string,
  preferredClientId?: string
): string {
  const body = verifyJson as Record<string, unknown> | null;
  const preferred =
    preferredClientId && isShareableEntryId(preferredClientId)
      ? String(preferredClientId).trim()
      : '';

  const pickUuid = (o: unknown): string | undefined => {
    if (!o || typeof o !== 'object') return undefined;
    const r = o as Record<string, unknown>;
    // Only entry `id` / aliases — never `file_id` (that column is the S3 key).
    for (const k of ['id', 'fileId', 'entryId', 'entry_id'] as const) {
      const v = r[k];
      if (typeof v === 'string' && isShareableEntryId(v)) return v.trim();
    }
    return undefined;
  };

  if (body && typeof body === 'object') {
    const d = body.data as unknown;

    if (Array.isArray(d)) {
      for (const row of d) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const rowKey = r.key ?? r.s3Key ?? r.s3_key ?? r.file_id;
        const id = pickUuid(row);
        if (id && (!rowKey || String(rowKey) === s3Key || isShareableEntryId(String(rowKey)))) {
          return id;
        }
      }
      const id0 = pickUuid(d[0]);
      if (id0) return id0;
    }

    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const obj = d as Record<string, unknown>;
      const nested = obj.files ?? obj.file ?? obj.results;
      if (Array.isArray(nested) && nested[0]) {
        const id = pickUuid(nested[0]);
        if (id) return id;
      }
      const byKey = obj[s3Key];
      if (byKey && typeof byKey === 'object') {
        const id = pickUuid(byKey);
        if (id) return id;
      }
      const id = pickUuid(d);
      if (id) return id;
    }

    const topId = pickUuid(body);
    if (topId) return topId;
  }

  // Prefer the offline client UUID over falling back to the S3 key.
  if (preferred) return preferred;
  return s3Key;
}

/** Verify upload on server (DB record + metadata). */
export async function verifyUpload(
  key: string,
  fileName: string,
  clientId?: string
) {
  const body: {
    keys: string[];
    fileNames: string[];
    clientIds?: string[];
  } = { keys: [key], fileNames: [fileName] };
  if (clientId && String(clientId).trim()) {
    body.clientIds = [String(clientId).trim()];
  }
  // When a client UUID is sent, do not fall back to a legacy route that ignores it
  // (that would create a new server id and rewrite the offline file id).
  if (body.clientIds?.length) {
    return await apiPost(`/files/verify`, body)
  }
  try {
    return await apiPost(`/files/verify`, body)
  } catch {
    return await apiPost(`/file/verify`, body)
  }
}

/** PUT a file from a local URI to S3 (presigned URL) */
export async function putToS3(presignedUrl: string, fileUri: string, timeoutMs = 300000): Promise<void> {
  // Prefer streaming file upload to avoid loading large media files into JS memory.
  // This prevents freezes/crashes on heavy formats like HEIC when syncing online.
  try {
    const info = await FileSystem.getInfoAsync(fileUri)
    if (!info.exists) {
      throw new Error(`Local file missing at ${fileUri}`)
    }

    const uploadPromise = FileSystem.uploadAsync(presignedUrl, fileUri, {
      httpMethod: 'PUT',
      uploadType: (FileSystem as any).FileSystemUploadType.BINARY_CONTENT,
    })

    const result = await Promise.race([
      uploadPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Upload timeout after ${timeoutMs / 1000}s`)), timeoutMs)
      ),
    ])

    if (![200, 201, 204].includes((result as any).status)) {
      throw new Error(`S3 PUT failed: ${(result as any).status} ${(result as any).body ?? ''}`)
    }
    return
  } catch (streamErr) {
    console.warn(
      `[perf·upload] stream PUT failed · ${truncateNameForLog(String(fileUri).split('/').pop() ?? 'file')} · blob fallback:`,
      streamErr
    )
  }

  // Fallback path for environments where uploadAsync is unavailable.
  const resp = await fetch(fileUri)
  const blob = await resp.blob()
  await putBlobToS3(presignedUrl, blob, timeoutMs)
}

/** PUT a Blob directly to S3 (for notes/text) */
export async function putBlobToS3(presignedUrl: string, blob: Blob, timeoutMs = 300000): Promise<void> {
  const fileSizeMB = blob.size / (1024 * 1024)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const timer = setTimeout(() => {
      xhr.abort()
      reject(new Error(`Upload timeout after ${timeoutMs / 1000}s (${fileSizeMB.toFixed(2)} MB)`))
    }, timeoutMs)
    xhr.open('PUT', presignedUrl)
    // Do NOT set extra headers unless your presign includes them.
    // XHR will set Content-Type based on blob.type automatically.
    xhr.onload = () => {
      clearTimeout(timer)
      if ([200, 201, 204].includes(xhr.status)) resolve()
      else reject(new Error(`S3 PUT failed: ${xhr.status} ${xhr.responseText ?? ''}`))
    }
    xhr.onerror = () => { clearTimeout(timer); reject(new Error('Network error during S3 PUT')) }
    xhr.onabort = () => { clearTimeout(timer); reject(new Error('Upload aborted')) }
    xhr.send(blob)
  })
}

/** Full flow for pickers (URI): convert? → presign → PUT → verify */
export async function uploadFile(
  fileUri: string,
  suggestedName: string,
  clientId?: string
): Promise<{ key: string; url: string; serverFileId: string }> {
  let uploadUri = fileUri
  let verifyName = suggestedName
  let convert = 0
  if (isHeicSource(fileUri, { fileName: suggestedName })) {
    const convertStarted = Date.now()
    const converted = await convertHeicToJpeg(fileUri, { fileName: suggestedName })
    convert = Date.now() - convertStarted
    uploadUri = converted
    if (!isHeicSource(converted, { mimeType: null, fileName: null })) {
      verifyName = jpgNameFromHeicUploadName(suggestedName)
    }
  }

  let bytes: number | undefined
  try {
    const info = await FileSystem.getInfoAsync(uploadUri)
    if (info.exists && typeof (info as { size?: number }).size === 'number') {
      bytes = (info as { size: number }).size
    }
  } catch {
    // Non-fatal — size is only for perf logs.
  }

  let t = Date.now()
  const { url, key } = await getPresignedUrl()
  const presign = Date.now() - t
  t = Date.now()
  await putToS3(url, uploadUri)
  const s3 = Date.now() - t
  t = Date.now()
  const verifyJson = await verifyUpload(key, verifyName, clientId)
  const verify = Date.now() - t
  const serverFileId = resolveSyncedEntryId(verifyJson, key, clientId)
  if (__DEV__) {
    logUploadPipeline('file', verifyName, { convert, presign, s3, verify, bytes })
  }
  return { key, url, serverFileId }
}

/** Full flow for notes (Blob): presign → PUT → verify */
export async function uploadBlob(
  blob: Blob,
  suggestedName: string,
  clientId?: string
): Promise<{ key: string; url: string; serverFileId: string }> {
  let t = Date.now()
  const { url, key } = await getPresignedUrl()
  const presign = Date.now() - t
  t = Date.now()
  await putBlobToS3(url, blob)
  const s3 = Date.now() - t
  t = Date.now()
  const verifyJson = await verifyUpload(key, suggestedName, clientId)
  const verify = Date.now() - t
  const serverFileId = resolveSyncedEntryId(verifyJson, key, clientId)
  if (__DEV__) {
    logUploadPipeline('blob', suggestedName, {
      presign,
      s3,
      verify,
      bytes: blob.size,
    })
  }
  return { key, url, serverFileId }
}

/**
 * Final entry id after verify. Keeps the offline client UUID when the API honors
 * `clientIds`, and avoids rewriting to the S3 object key on parse misses.
 */
function resolveSyncedEntryId(
  verifyJson: unknown,
  s3Key: string,
  clientId?: string
): string {
  const parsed = serverFileIdFromVerifyResponse(verifyJson, s3Key, clientId)
  const client =
    clientId && isShareableEntryId(clientId) ? String(clientId).trim() : ''

  if (client && parsed === client) return client

  if (client && !isShareableEntryId(parsed)) {
    // Response had no usable UUID (or only the S3 key) — keep the offline id.
    return client
  }

  if (client && isShareableEntryId(parsed) && parsed !== client) {
    // Production API likely not yet deploying clientIds — id will change until deploy.
    console.warn(
      '[upload] server returned a different entry id than clientId; deploy Web /files/verify clientIds support',
      { clientId: client, serverId: parsed }
    )
  }

  return parsed
}