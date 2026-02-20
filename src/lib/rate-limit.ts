const requests = new Map<string, { count: number; resetAt: number }>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requests) {
    if (now > entry.resetAt) requests.delete(key);
  }
}, 300_000);

/**
 * Route-specific rate limit presets.
 * key format: "ip:route-identifier"
 */
export const RATE_LIMITS = {
  // Auth - strict to prevent brute force
  signup: { limit: 5, windowMs: 60_000 * 15 },    // 5 per 15 min
  login: { limit: 10, windowMs: 60_000 * 15 },     // 10 per 15 min

  // Search - higher for UX
  search: { limit: 30, windowMs: 60_000 },          // 30 per min

  // Room operations
  roomCreate: { limit: 10, windowMs: 60_000 },      // 10 per min
  roomJoin: { limit: 15, windowMs: 60_000 },        // 15 per min

  // Queue / voting
  queue: { limit: 30, windowMs: 60_000 },           // 30 per min
  vote: { limit: 60, windowMs: 60_000 },            // 60 per min

  // Playlist generation - expensive
  generate: { limit: 3, windowMs: 60_000 * 5 },     // 3 per 5 min
  export: { limit: 5, windowMs: 60_000 * 5 },       // 5 per 5 min

  // Friends
  friendRequest: { limit: 10, windowMs: 60_000 },   // 10 per min

  // General API
  general: { limit: 20, windowMs: 60_000 },         // 20 per min
} as const;

/**
 * Simple in-memory rate limiter.
 * Returns true if the request is allowed, false if rate-limited.
 */
export function rateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const entry = requests.get(key);

  if (!entry || now > entry.resetAt) {
    requests.set(key, { count: 1, resetAt: now + windowMs });
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
 * @param route - Route identifier for per-route limits (uses key "ip:route")
 */
export function rateLimitCheck(
  request: Request,
  limit = 20,
  windowMs = 60_000,
  route?: string
): Response | null {
  const ip = getClientIp(request);
  const key = route ? `${ip}:${route}` : ip;
  if (!rateLimit(key, limit, windowMs)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(windowMs / 1000)),
        },
      }
    );
  }
  return null;
}

/**
 * Convenience: rate limit with a preset.
 */
export function rateLimitPreset(
  request: Request,
  preset: keyof typeof RATE_LIMITS
): Response | null {
  const { limit, windowMs } = RATE_LIMITS[preset];
  return rateLimitCheck(request, limit, windowMs, preset);
}
