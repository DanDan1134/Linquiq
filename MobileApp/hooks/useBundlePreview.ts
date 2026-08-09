import { useCallback, useRef, useState } from 'react';
import { API_BASE } from '../api/client'; // site origin (no /api)
import * as filesApi from '../api/files'; // getById(id: string)
import { useAuth } from '@clerk/clerk-expo';


function decodeHtmlEntities(s?: string | null): string {
  if (!s) return '';

  // First pass: handle double-encoded forms (&amp;lt;, &amp;gt;, &amp;amp;, &amp;quot;, &amp;#39;)
  let out = s
    .replace(/&amp;quot;/g, '"')
    .replace(/&amp;#39;/g, "'")
    .replace(/&amp;lt;/g, '<')
    .replace(/&amp;gt;/g, '>')
    .replace(/&amp;amp;/g, '&');

  // Second pass: handle single-encoded forms (&lt;, &gt;, &amp;, &quot;, &#39;)
  out = out
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

  return out;
}


// Extract the first top-level JSON object and array embedded in an HTML doc
function extractFirstJsonObjectAndArray(html: string): { obj?: any; arr?: any[] } {
  const text = html.trim();

  // If the whole response is raw JSON
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? { arr: parsed } : { obj: parsed };
    } catch {}
  }

  const segments: Array<{ start: number; end: number; type: 'obj' | 'arr' }> = [];
  const scan = (open: '{' | '[', close: '}' | ']', type: 'obj' | 'arr') => {
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== open) continue;
      let depth = 0;
      for (let j = i; j < text.length; j++) {
        const ch = text[j];
        if (ch === '"') {
          j++;
          for (; j < text.length; j++) {
            if (text[j] === '\\') { j++; continue; }
            if (text[j] === '"') break;
          }
          continue;
        }
        if (ch === open) depth++;
        if (ch === close) {
          depth--;
          if (depth === 0) { segments.push({ start: i, end: j + 1, type }); break; }
        }
      }
    }
  };

  scan('{', '}', 'obj');
  scan('[', ']', 'arr');

  const firstObj = segments.filter(s => s.type === 'obj').sort((a,b)=>a.start-b.start)[0];
  const firstArr = segments.filter(s => s.type === 'arr').sort((a,b)=>a.start-b.start)[0];

  let obj: any | undefined;
  let arr: any[] | undefined;

  if (firstObj) {
    try { obj = JSON.parse(decodeHtmlEntities(text.slice(firstObj.start, firstObj.end))); } catch {}
  }
  if (firstArr) {
    try { arr = JSON.parse(decodeHtmlEntities(text.slice(firstArr.start, firstArr.end))); } catch {}
  }
  return { obj, arr };
}

type BundleFileForModal = {
  id: string;           // <-- server UUID now
  name: string;
  type: string;
  typeColor: string;
  url: string;
  createdAt: string;
  creator: string;
  content: string | null;
};

type BundlePreviewForModal = {
  name: string;
  bundledUrls: string[];
  createdAt: string;
  creator: string;
  files: BundleFileForModal[];
  url?: string;
  date?: string;
  id?: string;          // <-- bundle UUID now
};

function categoryFromExt(t?: string): 'Image'|'PDF'|'Note'|'Link'|'Video'|'Audio'|'Other' {
  const ext = String(t ?? '').toLowerCase();
  if (['jpg','jpeg','png','gif','webp','bmp','heic','image'].some(e => ext.includes(e))) return 'Image';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'md' || ext === 'txt' || ext.includes('note')) return 'Note';
  if (ext === 'bundle' || ext === 'link') return 'Link';
  if (ext.includes('video')) return 'Video';
  if (ext.includes('audio') || ext.includes('recording')) return 'Audio';
  return 'Other';
}
function colorFromCategory(cat: string): string {
  const m: Record<string, string> = {
    Image: 'blue',
    PDF: 'yellow',
    Note: 'green',
    Link: 'button-border-color',
    Video: 'orange',
    Audio: 'red',
    Other: 'yellow',
  };
  return m[cat] ?? m.Other;
}

export function useBundlePreview() {
  const { getToken } = useAuth();
  const [data, setData] = useState<BundlePreviewForModal | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load and normalize the bundle preview page (SSR/HTML) by server UUID
  const load = useCallback(async (bundleServerId: string) => {
    setLoading(true); setErr(null);
    try {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${API_BASE}/preview/${bundleServerId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const html = await res.text();

      // Find the JSON object (bundle) and array (children)
      const { obj: bundleObj, arr: childrenArr } = extractFirstJsonObjectAndArray(html);
      const original = bundleObj ?? {};
      const children = Array.isArray(childrenArr) ? childrenArr : [];

      const normalized: BundleFileForModal[] = children.map((child: any) => {
        const id = String(child?.data?.id ?? child?.id ?? child?.file_id ?? child?.fileId ?? '').trim();
        const rawUrl =
          child?.url ??
          child?.data?.url ??
          child?.fileUrl ??
          child?.file_url ??
          child?.metadata?.url ??
          '';
        const url = decodeHtmlEntities(String(rawUrl));
        const type = String(child?.data?.type ?? child?.type ?? '').toLowerCase();
        const cat = categoryFromExt(type);
        const name = String(child?.data?.name ?? child?.name ?? 'Untitled');
        const createdAt = String(child?.data?.createdAt ?? child?.createdAt ?? '');
        const creator = String(child?.data?.creator_email ?? child?.creator_email ?? child?.creator ?? 'Unknown');
        const content = typeof child?.content === 'string' ? child.content : null;

        return {
          id,                     // <-- UUID
          name,
          type: cat === 'Link' ? 'Link' : (type || cat),
          typeColor: colorFromCategory(cat),
          url,
          createdAt,
          creator,
          content,
        };
      });

      const bundledUrls = normalized.map(f => f.url).filter(Boolean);
      const bundleName = String(original?.name ?? 'linq');
      const bundleCreatedAt = String(original?.createdAt ?? '');
      const bundleCreator = String(original?.creator_email ?? original?.creator_id ?? 'Unknown');
      const bundleId = String(original?.id ?? bundleServerId);

      setData({
        name: (bundleName === 'Bundle' || bundleName === 'bundle') ? 'linq' : bundleName,
        createdAt: bundleCreatedAt,
        creator: bundleCreator,
        bundledUrls,
        files: normalized,
        id: bundleId,            // <-- UUID
      });
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load bundle preview');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Return a presigned S3 URL for a given child file UUID
  const fetchUrl = useCallback(async (fileId: string): Promise<string | null> => {
    if (!fileId) return null;
    try {
      const { url } = await filesApi.getById(fileId); // /api/files/url/:id
      return url ?? null;
    } catch {
      return null;
    }
  }, []);

  return { data, loading, error: err, load, fetchUrl };
}