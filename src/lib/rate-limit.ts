const requests = new Map<string, { count: number; resetAt: number }>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requests) {
    if (now > entry.resetAt) requests.delete(key);
  }
}, 300_000);

/**
 * Simple in-memory rate limiter.
 * Returns true if the request is allowed, false if rate-limited.
 */
export function rateLimit(
  ip: string,
  limit = 20,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const entry = requests.get(ip);

  if (!entry || now > entry.resetAt) {
    requests.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

/**
 * Helper to get client IP from Next.js request headers.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Rate limit check that returns a Response if limited, or null if allowed.
 */
export function rateLimitCheck(
  request: Request,
  limit = 20,
  windowMs = 60_000
): Response | null {
  const ip = getClientIp(request);
  if (!rateLimit(ip, limit, windowMs)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}
