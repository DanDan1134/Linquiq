# Linquiq

Networking engagement platform: capture, organize, and connect information from events and conversations.

## Structure

- `MobileApp/` — Expo React Native client
- `Web/` — Next.js web app and API (also the backend for mobile)

## Run Web

```bash
cd Web
npm install
# Create Web/.env with Clerk, DATABASE_URL, and AWS vars
npm run dev
```

- Local app: `http://localhost:3000`
- API base (local): `http://localhost:3000/api`
- Production example: `https://linquiq-sigma.vercel.app`

## Run Mobile

```bash
cd MobileApp
npm install
npx expo start
```

- Then press `i` (iOS simulator), `a` (Android), or scan the QR code in Expo Go
- Mobile talks to the Web API via `API_BASE` in `MobileApp/api/client.ts`
- Default production base: `https://linquiq-sigma.vercel.app` (no trailing slash)
- For local API testing, point `API_BASE` at your machine/LAN URL (for example `http://10.x.x.x:3000`)
- Clerk publishable key on mobile must match the same Clerk app as Web/Vercel

## API overview

Auth: Clerk session. Web uses cookies; mobile sends `Authorization: Bearer <Clerk JWT>`.

Base URL:

| Environment | Base |
|---|---|
| Local Web | `http://localhost:3000` |
| Production | `https://linquiq-sigma.vercel.app` |

All routes below are under `/api`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/files` | List files owned by the current user |
| `GET` | `/api/files/search?q=` | Search owned files (and linked children) |
| `GET` | `/api/files/:file_id` | Get one file metadata (owner-checked) |
| `DELETE` | `/api/files/:file_id` | Delete a file (owner-checked) |
| `GET` | `/api/files/url/:file_id` | Presigned GET URL for preview/download |
| `GET` | `/api/files/upload-helper?count=N` | Presigned PUT URLs + keys for upload |
| `POST` | `/api/files/verify` | Confirm S3 objects and create DB entries |
| `POST` | `/api/files/link` | Link two owned files |
| `POST` | `/api/files/connect` | Create a bundle from owned file IDs |
| `GET` | `/api/tests` | Simple auth/health-style test route |

Upload flow (high level):

1. `GET /api/files/upload-helper?count=N` → temporary PUT URLs
2. Client uploads bytes to S3 with those URLs
3. `POST /api/files/verify` with `keys` + `fileNames` → DB rows created

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`

- Runs on pushes/PRs to `main` that change `Web/**`
- In `Web/`: `npm ci` → `lint` → `test` → `build`

## Notes

- Keep secrets in local `.env` files (not committed)
- DB stores file metadata; file bytes live in S3
- Mobile and Web must share the same Clerk application and API deployment for auth to work
