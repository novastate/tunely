import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";

const GUEST_SECRET = process.env.NEXTAUTH_SECRET!;

export function createGuestToken(guestName: string): { token: string; guestId: string } {
  const guestId = `guest_${nanoid()}`;
  const payload = {
    guestId,
    guestName,
    type: "guest" as const,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  };
  return { token: jwt.sign(payload, GUEST_SECRET), guestId };
}

export function verifyGuestToken(
  token: string
): { guestId: string; guestName: string } | null {
  try {
    const payload = jwt.verify(token, GUEST_SECRET) as {
      guestId: string;
      guestName: string;
      type: string;
    };
    if (payload.type !== "guest") return null;
    return { guestId: payload.guestId, guestName: payload.guestName };
  } catch {
    return null;
  }
}

/**
 * Extract and verify guest identity from request cookies.
 * Returns null if no valid guest token found.
 */
export function getGuestFromRequest(req: Request): { guestId: string; guestName: string } | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/guestToken=([^;]+)/);
  if (!match) return null;
  return verifyGuestToken(decodeURIComponent(match[1]));
}
