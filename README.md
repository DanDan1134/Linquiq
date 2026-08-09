# Linquiq

Networking engagement platform: capture, organize, and connect information from events and conversations.

## Structure

- `MobileApp/` — Expo React Native mobile client
- `Web/` — Next.js web app and API

## Getting started

### Web

```bash
cd Web
cp .env.example .env   # if present; otherwise create .env from your secrets
npm install
npm run dev
```

### Mobile

```bash
cd MobileApp
npm install
npx expo start
```

## Notes

- Keep secrets in local `.env` files (not committed).
- Original projects lived in separate repos; this monorepo combines them.
