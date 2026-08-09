// import axios from "axios";
// import * as SecureStore from "expo-secure-store";
// import { API_BASE } from "../api/client";

// async function getStoredSessionToken() {
//   return SecureStore.getItemAsync("sessionToken");
// }
// async function getStoredUserEmail() {
//   return SecureStore.getItemAsync("userEmail");
// }

// function looksLikeHtml(body: any) {
//   if (typeof body !== "string") return false;
//   const t = body.trim().slice(0, 20).toUpperCase();
//   return t.startsWith("<!DOCTYPE") || t.startsWith("<HTML");
// }

// export async function fetchMe(): Promise<{ email: string | null }> {
//   const token = await getStoredSessionToken();
//   if (!token) {
//     // no session—try stored email just in case
//     const stored = await getStoredUserEmail();
//     return { email: stored ?? null };
//   }
//     const res = await axios.request({
//       method: "GET",
//       url: `${API_BASE}/api/auth/verify`,
//       headers: {
//         Cookie: `sessionToken=${token}`,
//         Accept: "application/json",
//         "X-Requested-With": "XMLHttpRequest",
//       },
//       transformResponse: [(data, headers) => {
//         const ct = headers?.["content-type"] || "";
//         if (ct.includes("text/html")) return data; // return raw HTML text
//         try { return JSON.parse(data); } catch { return data; }
//       }],
//       timeout: 15000,
//     });

//     const apiEmail =
//       res?.data?.email ??
//       res?.data?.user?.email ??
//       null;

//     if (apiEmail) return { email: apiEmail };

//   // Fallback to the email we saved at login
//   const stored = await getStoredUserEmail();
//   return { email: stored ?? null };
// }