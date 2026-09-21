# Linquiq Team Handover Report

**Product:** Linquiq (mobile + web)  
**Operator:** GLOBIDEA LLC  
**Repo:** `DanDan1134/Linquiq`  
**Primary working branch:** `Testflight_v2`  
**Production:** `https://linquiq.com` (API clients should use `https://www.linquiq.com`)

This report explains how to run the apps, how the system is built, what the API endpoints do, and what a new team needs to get Linquiq running.

---

## 1. What Linquiq is

Linquiq helps people capture and organize networking info from conferences and expos:

- Notes, photos, voice recordings, and files
- “Linqs” (linked bundles of related items)
- Sync across mobile and web

**Repo layout**

| Folder | What it is |
|---|---|
| `MobileApp/` | Expo React Native client (iOS TestFlight + Android) |
| `Web/` | Next.js website **and** the backend API for mobile |

---

## 2. Architecture (simple)

```
Mobile app (Expo)          Web browser
        |                        |
        |  Bearer JWT            |  Clerk cookies
        v                        v
              Next.js on Vercel
                 /api/*
           /          \
          v            v
     Postgres       Amazon S3
   (metadata)     (file bytes)
```

**Pieces**

- **Clerk** — sign-in, waitlist/invites, user identity
- **Next.js (Web/)** — UI pages + all `/api/*` routes
- **Postgres** — file/entry metadata and links (Drizzle ORM)
- **S3** — actual file bytes; API issues short-lived presigned URLs
- **Vercel** — hosts web + API
- **Expo EAS** — builds mobile binaries for TestFlight / stores

**Auth rule**

- Web uses Clerk **session cookies**
- Mobile sends `Authorization: Bearer <Clerk JWT>`
- Mobile and Web **must use the same Clerk application**

---

## 3. What to hand the new team (access)

Give them ownership or admin on:

- GitHub repo (`DanDan1134/Linquiq`)
- Vercel project (domain, env vars, deploys)
- Clerk dashboard (keys, waitlist, redirect URLs)
- Postgres (`DATABASE_URL`)
- AWS / S3 (bucket + IAM keys)
- Expo / EAS account
- Apple Developer (bundle id `com.q2l.linquiq`, TestFlight)
- Google Play if used (Android package currently `com.anonymous.MyExpoApp`)
- Billing contacts for Expo, Vercel, Apple, AWS

Also share:

- Current Production env var values (via a secure vault, not chat/email)
- How testers are invited (Clerk waitlist / TestFlight)
- Known open PRs and which branch is “live”

---

## 4. Environment variables (Web)

Create `Web/.env` (never commit secrets):

```bash
DATABASE_URL=postgresql://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
AWS_BUCKET_NAME=...
```

Same values must exist on **Vercel Production**.

**Mobile:** Clerk publishable key in `MobileApp/App.tsx` (`ClerkProvider`) must match that same Clerk app.

---

## 5. How to run the Web app

```bash
cd Web
npm install
# create Web/.env with the vars above

# If schema changed:
npx drizzle-kit generate
npx drizzle-kit migrate

npm run dev
```

| What | URL |
|---|---|
| Local UI | `http://localhost:3000` |
| Local API | `http://localhost:3000/api` |
| Dashboard (after sign-in) | `/dashboard` |
| Privacy | `/privacy` |
| Tester terms | `/terms` |

**CI:** `.github/workflows/ci.yml` runs on pushes/PRs to `main` that change `Web/**` → `lint` → `test` → `build`.

---

## 6. How to run the Mobile app

```bash
cd MobileApp
npm install
npx expo start
```

Then:

- `i` — iOS simulator
- `a` — Android emulator
- Or scan the QR code with Expo Go / a dev build

### Critical mobile settings

1. **`API_BASE`** is in `MobileApp/api/client.ts`
2. Production must be **`https://www.linquiq.com`** (not apex `linquiq.com`)
   - Apex redirects to `www` with a 308
   - iOS drops `Authorization` on that redirect → API returns **401**
3. For local API testing, set `API_BASE` to your machine LAN URL, e.g. `http://10.x.x.x:3000`
4. Clerk publishable key must match Web/Vercel

### EAS / TestFlight

Profiles in `MobileApp/eas.json`: `development`, `preview`, `production`

```bash
eas build --platform ios --profile production
eas submit --platform ios
```

**Free Expo plan:** 15 Android + 15 iOS builds per month. Deleting old builds does **not** restore quota. When out: wait for month reset, build locally (`eas build --local`), or upgrade.

---

## 7. Data model (short)

| Table | Purpose |
|---|---|
| `entries` | Files, notes, linqs (id, owner_id, creator_id, type, name, description, file_id/S3 key) |
| `links` | Edges between entries (`from_id` → `to_id`) for bundles/linqs |

Schema: `Web/src/db/schema.ts`  
Bytes live in **S3**. DB stores metadata only.

---

## 8. API endpoints

**Auth:** Clerk cookie (web) or `Authorization: Bearer <JWT>` (mobile)

**Bases**

| Environment | Base |
|---|---|
| Local | `http://localhost:3000` |
| Production | `https://www.linquiq.com` |

All routes below are under `/api`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/files` | List files owned by current user |
| `GET` | `/api/files/search?q=` | Search owned files (and linked children) |
| `GET` | `/api/files/:file_id` | Get one file metadata (owner-checked) |
| `PATCH` | `/api/files/:file_id` | Update file metadata (owner-checked) |
| `DELETE` | `/api/files/:file_id` | Delete a file (owner-checked) |
| `GET` | `/api/files/url/:file_id` | Presigned GET URL for preview/download |
| `POST` | `/api/files/urls` | Batch presigned GET URLs |
| `GET` | `/api/files/content/:file_id` | Read file content (auth + ownership) |
| `POST` | `/api/files/upload-helper` | Presigned PUT URLs + keys for upload |
| `POST` | `/api/files/verify` | Confirm S3 objects; create DB rows |
| `POST` | `/api/files/link` | Link two owned files |
| `DELETE` | `/api/files/link` | Remove a link between files |
| `POST` | `/api/files/connect` | Create a linq/bundle from owned file IDs |
| `POST` | `/api/account/delete` | Delete user files + Clerk account |

### Upload flow

1. `POST /api/files/upload-helper` with file metadata → temporary PUT URLs + S3 keys  
2. Client uploads bytes **directly to S3** with those URLs  
3. `POST /api/files/verify` with `keys` + `fileNames` (+ optional `clientIds`) → DB entries created  

---

## 9. Web pages (non-API)

| Path | Purpose |
|---|---|
| `/` | Landing + Sign in |
| `/dashboard` | Signed-in file UI |
| `/preview/:file_id` | File preview |
| `/privacy` | Privacy Policy |
| `/terms` | Tester Terms |

---

## 10. First-week checklist

1. Get access to GitHub, Vercel, Clerk, AWS, Postgres, Expo, Apple  
2. Store Production env vars in a vault; recreate `Web/.env` locally  
3. Run Web; sign in with a test Clerk user; open `/dashboard`  
4. Upload a file; confirm S3 + DB rows  
5. Run Mobile; confirm `API_BASE` + Clerk key match Production  
6. Sign in on device; create a note/photo; confirm it appears on web  
7. In Clerk: After sign-in fallback = `/dashboard`; allow `https://linquiq.com/dashboard`  
8. Read `/privacy` and `/terms` (do not invent contact emails that do not exist)  
9. Review open PRs and `Testflight_v2` vs `main`  
10. Check Expo build quota before starting TestFlight releases  

---

## 11. Common pitfalls

- Using `https://linquiq.com` as mobile `API_BASE` → redirect to www → lost auth → **401**
- Different Clerk apps/keys between mobile and Vercel → UI signs in, API fails
- Missing AWS env vars → upload/verify fails
- Free Expo build limit exhausted — deleting builds does not restore quota
- Fake contact emails (e.g. `privacy@linquiq.com`) — use invitation/account email instead

---

## 12. Where to look in the repo

| Path | Why |
|---|---|
| `README.md` | Quick start |
| `Web/README.md` | Local DB / Clerk notes |
| `Web/src/app/api/**` | API route handlers |
| `Web/src/db/schema.ts` | Postgres tables |
| `Web/src/lib/server/**` | S3, ownership, quota logic |
| `MobileApp/api/client.ts` | `API_BASE` + auth headers |
| `MobileApp/App.tsx` | ClerkProvider + app shell |
| `MobileApp/eas.json` / `app.json` | Build profiles + bundle ids |
| `docs/Linquiq-Team-Handover.md` | This report |

---

## 13. Security note for handover

- Keep secrets out of git and out of this document’s committed copies of real keys
- Prefer **rotating** Clerk, AWS, and DB credentials when ownership changes
- Do not paste TestFlight or Clerk invite links into public channels
