/**
 * Client-side guest utilities.
 * Guest tokens are now httpOnly JWT cookies set by the server.
 * The client can only check if a token exists (not read its contents).
 */

export function hasGuestToken(): boolean {
  if (typeof document === "undefined") return false;
  // httpOnly cookies aren't visible to JS, but the server sets it.
  // We also check for a non-httpOnly marker cookie.
  return document.cookie.includes("guestToken=") || document.cookie.includes("guestActive=");
}

/**
 * @deprecated - Guest info is now in server-side JWT tokens.
 * Use the /api endpoint response for guest identity.
 */
export function getGuestFromCookies(): { guestId: string; guestName: string } | null {
  // httpOnly cookies can't be read client-side.
  // Return null - room page should get identity from API response instead.
  return null;
}
