import { auth, clerkClient } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

function peekAzp(authorization: string | null): string | undefined {
  if (!authorization?.toLowerCase().startsWith("bearer ")) return undefined;
  const jwt = authorization.slice(7).trim();
  const payload = jwt.split(".")[1];
  if (!payload) return undefined;
  try {
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8"
      )
    ) as { azp?: unknown };
    return typeof json.azp === "string" ? json.azp : undefined;
  } catch {
    return undefined;
  }
}

/** Origins allowed to mint session JWTs for this API (web + Expo + native). */
export function clerkAuthorizedParties(authorization?: string | null): string[] {
  const azp = peekAzp(authorization ?? null);
  const parties = [
    "https://linquiq.com",
    "https://www.linquiq.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "com.q2l.linquiq",
  ];
  if (azp && (azp.startsWith("exp://") || azp.startsWith("linquiq://") || azp.startsWith("exps://"))) {
    parties.push(azp);
  }
  return parties;
}

function sessionUserId(authObj: unknown): string | null {
  if (!authObj || typeof authObj !== "object") return null;
  if (!("userId" in authObj)) return null;
  const id = (authObj as { userId?: unknown }).userId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Resolve Clerk user id from cookies or `Authorization: Bearer` (Expo).
 * Expo tokens use azp like `exp://10.0.0.x:8081`, which default host checks reject.
 */
export async function getAuthedUserId(req?: NextRequest): Promise<string | null> {
  try {
    // Session tokens only. `acceptsToken: "any"` includes m2m/api_key objects
    // that have no userId, which is the TypeScript error on this line.
    const fromAuth = await auth();
    const id = sessionUserId(fromAuth);
    if (id) return id;
  } catch {
    // Expo JWTs with exp:// azp can throw here; fall through to authenticateRequest.
  }

  if (!req) return null;
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;

  try {
    const client = await clerkClient();
    const state = await client.authenticateRequest(req, {
      authorizedParties: clerkAuthorizedParties(header),
    });
    if (!state.isAuthenticated) return null;
    return sessionUserId(state.toAuth());
  } catch {
    return null;
  }
}
