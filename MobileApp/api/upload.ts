import { apiGet, apiPost } from './client'
import * as FileSystem from 'expo-file-system/legacy'
import { logUploadPipeline } from '../utils/perfLog'
import { truncateNameForLog } from '../utils/helpers'
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
 * Pick the DB file id returned by /files/verify (UUID), not the S3 object key.
 * When these differ, using `key` in markFileSynced leaves an orphan row and pull
 * adds a second row with the real id — duplicate notes/files in the list.
 */
export function serverFileIdFromVerifyResponse(verifyJson: unknown, s3Key: string): string {
  const body = verifyJson as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return s3Key;

  const pickId = (o: unknown): string | undefined => {
    if (!o || typeof o !== 'object') return undefined;
    const r = o as Record<string, unknown>;
    for (const k of ['id', 'file_id', 'fileId'] as const) {
      const v = r[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return undefined;
  };

  const d = body.data as unknown;

  if (Array.isArray(d)) {
    for (const row of d) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const rowKey = r.key ?? r.s3Key ?? r.s3_key;
      const id = pickId(row);
      if (id && (!rowKey || String(rowKey) === s3Key)) return id;
    }
    const id0 = pickId(d[0]);
    if (id0) return id0;
  }

  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const obj = d as Record<string, unknown>;
    const nested = obj.files ?? obj.file ?? obj.results;
    if (Array.isArray(nested) && nested[0]) {
      const id = pickId(nested[0]);
      if (id) return id;
    }
    const byKey = obj[s3Key];
    if (byKey && typeof byKey === 'object') {
      const id = pickId(byKey);
      if (id) return id;
    }
    const id = pickId(d);
    if (id) return id;
  }

  const topId = pickId(body);
  if (topId) return topId;

  return s3Key;
}

/** Verify upload on server (DB record + metadata). */
export async function verifyUpload(key: string, fileName: string) {
  // Prefer new route; fall back to legacy if not present
  try {
    return await apiPost(`/files/verify`, { keys: [key], fileNames: [fileName] })
  } catch {
    return await apiPost(`/file/verify`, { keys: [key], fileNames: [fileName] })
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
  suggestedName: string
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
  const verifyJson = await verifyUpload(key, verifyName)
  const verify = Date.now() - t
  const serverFileId = serverFileIdFromVerifyResponse(verifyJson, key)
  if (__DEV__) {
    logUploadPipeline('file', verifyName, { convert, presign, s3, verify, bytes })
  }
  return { key, url, serverFileId }
}

/** Full flow for notes (Blob): presign → PUT → verify */
export async function uploadBlob(
  blob: Blob,
  suggestedName: string
): Promise<{ key: string; url: string; serverFileId: string }> {
  let t = Date.now()
  const { url, key } = await getPresignedUrl()
  const presign = Date.now() - t
  t = Date.now()
  await putBlobToS3(url, blob)
  const s3 = Date.now() - t
  t = Date.now()
  const verifyJson = await verifyUpload(key, suggestedName)
  const verify = Date.now() - t
  const serverFileId = serverFileIdFromVerifyResponse(verifyJson, key)
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