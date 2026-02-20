# Tunely OpenCode Review Report

**Generated:** 2026-02-20
**Codebase:** /root/clawd/repos/novastate/musik-app
**Reviewer:** Claude Opus 4.6 (full codebase audit)

---

## Executive Summary

| Area | Score | Verdict |
|------|-------|---------|
| Security | **7/10** | Solid foundation, few gaps |
| UX Design | **7/10** | Good flows, missing edge cases |
| Performance | **5/10** | Major bottlenecks in playlist gen |
| Scalability | **4/10** | SQLite + polling = ceiling |
| Backend Quality | **6/10** | Functional but inconsistent |
| **Overall** | **5.8/10** | **MVP-ready with caveats** |

---

## 1. Security Audit (7/10)

### Critical (Severity 8-10)

**S1. No rate limiting on most API routes (Severity 8)**
- Only `POST /api/rooms` and `GET /api/spotify/search` have `rateLimitCheck()`
- Missing on: `/api/auth/signup`, `/api/rooms/join`, `/api/friends/request`, all queue operations, playlist generation
- **Risk:** Brute-force signup, spam friend requests, DoS via playlist generation
- **Fix:** Add `rateLimitCheck(req)` to all POST/PUT/DELETE routes

**S2. Guest friend requests endpoint leaks data (Severity 7)**
- `GET /api/friends/requests?guestId=xxx` — anyone can query any guestId's pending requests
- `src/app/api/friends/requests/route.ts` — no verification that the caller IS that guest
- **Risk:** Enumerate guest IDs and see who sent them friend requests
- **Fix:** Require guest JWT cookie verification, not just query param

**S3. In-memory rate limiter resets on deploy (Severity 6)**
- `src/lib/rate-limit.ts` uses `Map()` — lost on every server restart/deploy
- **Risk:** Rate limiting is effectively useless in serverless/edge deployments
- **Mitigation:** Accept for MVP, move to Redis for production

### Medium (Severity 4-7)

**S4. Guest token in response body AND cookie (Severity 5)**
- `POST /api/rooms/join` returns `guestToken` in JSON response body AND sets httpOnly cookie
- The JSON body token can be captured by malicious JS if XSS exists
- **Fix:** Remove `guestToken` from JSON response, rely only on httpOnly cookie

**S5. No email validation on signup (Severity 5)**
- `POST /api/auth/signup` accepts any string as email, no format validation
- No email verification flow
- **Risk:** Fake accounts, typo emails blocking real users

**S6. Invite tokens have no single-use enforcement (Severity 4)**
- JWT invite tokens can be reused unlimited times until expiry (24h)
- Anyone with the link can join, even after the intended recipient has joined
- **Fix:** Store used tokens in DB or add a `maxUses` counter on rooms

**S7. votedBy stored as JSON string, parsed with JSON.parse (Severity 4)**
- `src/app/api/rooms/[id]/queue/[itemId]/vote/route.ts` — `JSON.parse(item.votedBy || "[]")`
- If corrupted data, this throws and returns 500
- **Fix:** Wrap in try-catch or use a proper relation table

### Best Practices

- ✅ JWT guest auth with httpOnly cookies — solid
- ✅ Room IDOR protection via `verifyRoomAccess()` — well implemented
- ✅ bcrypt for password hashing with cost 10
- ✅ Prisma ORM prevents SQL injection
- ✅ CSRF: Next.js API routes require explicit fetch (SameSite cookies)
- ⚠️ No CSP headers configured
- ⚠️ No input sanitization on room names, guest names (XSS via stored names)
- ⚠️ `NEXTAUTH_SECRET` reused for guest tokens AND invite tokens (key separation recommended)

---

## 2. UX Design Audit (7/10)

### P0 — Critical UX Issues

**U1. No error recovery on playlist generation failure**
- If Spotify token expires mid-generation, user sees generic error
- No retry button with re-auth flow
- **Fix:** Detect `RefreshAccessTokenError`, prompt re-login

**U2. Guest users can't generate playlists**
- `generate-playlist` requires `session.accessToken` — guests get 401
- No messaging explains this limitation
- **Fix:** Show "Log in with Spotify to generate playlists" for guests

### P1 — High Priority

**U3. No empty state for rooms list**
- `GET /app` — if user has no rooms, unclear what to show
- **Fix:** "Create your first room" CTA with illustration

**U4. 3-second polling with no visual indicator**
- `useQueue` polls every 3s but no "last updated" or sync indicator
- Users can't tell if queue is stale
- **Fix:** Add subtle "synced" dot or last-updated timestamp

**U5. Search debounce at 400ms may feel sluggish**
- Track search waits 400ms after typing stops
- **Suggestion:** Reduce to 250ms, add skeleton results immediately

**U6. No confirmation on queue item deletion**
- Single tap on ✕ immediately deletes — no undo
- **Fix:** Add undo toast (3s window) or confirmation

### P2 — Medium Priority

**U7. Playlist mode selector is a plain `<select>`** — could be visual pills/chips for better UX
**U8. No keyboard shortcut for common actions** (play, next, search focus)
**U9. QR code component exists but no visible "Share" flow** from room page
**U10. Guest conversion banner is prominent but may annoy** — add dismiss/snooze

### Accessibility

- ⚠️ No `aria-label` on vote buttons, drag handles
- ⚠️ Color contrast: `text-zinc-600` on dark bg may fail WCAG AA
- ✅ Keyboard sensor configured for drag-and-drop
- ⚠️ No skip-to-content link
- ⚠️ Album images missing meaningful `alt` text (currently `alt=""`)

---

## 3. Performance Audit (5/10)

### Critical Bottlenecks

**P1. Playlist generation makes 50-100+ sequential API calls (Severity 9)**
- `generatePlaylistForRoom()` in `playlist-generator.ts`:
  - For each member artist → `getSimilarArtists()` (Last.fm) → for each similar → `searchArtists()` (Spotify) → `getTopTracks()` (Last.fm) → `searchSpotifyTrack()` (Spotify)
  - That's ~4 API calls per similar artist, ~8 similar artists per seed = **~32 calls per member artist**
  - With 3 members × 2 artists each = **~192 sequential HTTP calls**
- **Estimated latency:** 30-90 seconds for a 3-member room
- **Fix:** Parallelize with `Promise.all()`, batch Spotify searches, cache Last.fm results

**P2. Queue polling creates N+1 query pattern (Severity 7)**
- `GET /api/rooms/[id]/queue` fetches all queue items, then fetches all users by ID
- Every 3 seconds × every connected client
- **Fix:** Use Prisma `include` with relation, or denormalize `addedByName` into QueueItem

**P3. No caching on any external API response (Severity 7)**
- Spotify search, Last.fm similar artists, chart playlists — all fetched fresh every time
- `getServerSpotifyToken()` has a simple in-memory cache (good), but nothing else
- **Fix:** Add in-memory cache (Map with TTL) for:
  - Last.fm similar artists (cache 24h)
  - Spotify chart playlists (cache 1h)
  - Spotify search results (cache 5min)

**P4. `getAudioFeatures()` called for ALL generated tracks (Severity 5)**
- After generating 30 tracks, fetches audio features for all of them
- Only used for non-"mixed" modes
- **Fix:** Only fetch when mode ≠ "mixed" (already partially done, but the check happens after generation)

### Medium Issues

**P5. Album art images not optimized**
- Using raw Spotify image URLs (640px) in 40-48px thumbnails
- **Fix:** Use smallest Spotify image size (64px) or Next.js `<Image>` with sizing

**P6. `useSpotifyPlayer` makes direct Spotify API call from client**
- `fetch("https://api.spotify.com/v1/me")` in useEffect — leaks access token to browser
- Should go through server route
- **Note:** This is by design for Spotify Web Playback SDK, but premium check could be server-side

**P7. No bundle analysis evident**
- `@dnd-kit`, `qrcode.react`, `jsonwebtoken` all in client bundle potentially
- **Fix:** Verify tree-shaking, use dynamic imports for heavy components

---

## 4. Scalability Audit (4/10)

### Critical Concerns

**SC1. SQLite cannot handle concurrent writes (Severity 9)**
- SQLite uses file-level locking — one writer at a time
- With 10+ users adding to queue simultaneously → `SQLITE_BUSY` errors
- **Migration path:** PostgreSQL via Prisma (change `provider = "postgresql"` in schema)
- **Effort:** ~2 hours (schema is already Prisma-compatible)

**SC2. Polling at 3s interval doesn't scale (Severity 8)**
- 20 users in a room = 20 requests/3s = 400 req/min to queue endpoint
- Each request hits DB twice (queue items + user names)
- **Fix:** WebSockets (Socket.io or Pusher) or Server-Sent Events
- **Quick fix:** Increase interval to 5-10s, add ETag/304 support

**SC3. In-memory state doesn't survive horizontal scaling (Severity 7)**
- Rate limiter: `Map()` in `rate-limit.ts`
- Spotify token cache: `cachedToken` in `spotify-server.ts`
- Both are per-process — useless with multiple instances
- **Fix:** Redis for rate limiting and token cache

**SC4. No database indexes on hot queries (Severity 6)**
- `QueueItem` queried by `roomId` + `playedAt` — no composite index
- `RoomMember` has `@@unique([roomId, userId])` (acts as index) ✅
- `Friend` has `@@index([userId])` ✅
- **Fix:** Add `@@index([roomId, playedAt])` on QueueItem

**SC5. Playlist generation is synchronous and blocking (Severity 7)**
- Takes 30-90s, blocks the API route
- If 5 users generate simultaneously → server overwhelmed
- **Fix:** Background job queue (Bull/BullMQ with Redis), return job ID, poll for result

### Race Conditions

**SC6. Vote race condition**
- Two users voting simultaneously: both read `votedBy: ["user1"]`, both append, one overwrites the other
- `prisma.queueItem.update` with `increment` is safe for `votes` count
- But `votedBy` JSON string update is NOT atomic
- **Fix:** Use a separate `Vote` relation table, or `$transaction` with `SELECT FOR UPDATE`

**SC7. Reorder race condition**
- `PUT /api/rooms/[id]/queue/[itemId]/reorder` reads queue, calculates positions, swaps
- Two concurrent reorders → corrupt ordering
- **Fix:** Use `$transaction` with serializable isolation

---

## 5. Backend Quality Audit (6/10)

### Code Smells

**B1. Inconsistent auth patterns across routes**
- Some routes use `getServerSession()` directly
- Others use `getAuthIdentity()` from `room-auth.ts`
- Friends routes: session only (no guest support)
- **Fix:** Standardize on `getAuthIdentity()` everywhere

**B2. No input validation library (Severity 5)**
- All validation is manual: `if (!name || typeof name !== "string")`
- No schema validation (Zod, Yup)
- **Fix:** Add Zod schemas for all API inputs

**B3. Redundant user queries in generate-playlist**
- `generate-playlist/route.ts` loops through members and does individual `prisma.user.findUnique` + `prisma.preference.findMany` per member
- **Fix:** Single query with `include: { preferences: true }` on roomMembers

**B4. Error responses inconsistent**
- Mix of `{ error: "message" }` and `{ error: "message" }` (consistent) but status codes vary
- Some routes return 500 with stack traces in dev
- **Fix:** Centralized error handler utility

**B5. No logging/monitoring**
- Only `console.error` and `console.warn`
- No structured logging, no request IDs, no metrics
- **Fix:** Add structured logger (pino), correlate request IDs

**B6. `any` type usage in spotify-charts.ts**
- `.filter((item: any) => item.track && item.track.id)` — loses type safety
- **Fix:** Define proper Spotify API response types

### Refactoring Opportunities

**B7. DRY: Auth check boilerplate**
- Every route repeats: `const identity = await getAuthIdentity(req); if (!isAuthenticated(identity)) return 401; const hasAccess = await verifyRoomAccess(id, identity); if (!hasAccess) return 403;`
- **Fix:** Create `withRoomAuth(handler)` middleware wrapper

**B8. `votedBy` as JSON string in text column**
- Should be a proper `Vote` model/relation
- Current approach prevents DB-level querying of votes

**B9. Spotify token refresh could be centralized**
- Token refresh logic in `auth.ts` JWT callback
- Server-side token in `spotify-server.ts` with separate caching
- User's stored tokens in DB updated on login but may expire between sessions

---

## Critical Issues Summary (P0)

| # | Issue | Area | Severity |
|---|-------|------|----------|
| 1 | Playlist gen: 50-100+ sequential API calls | Performance | 9/10 |
| 2 | SQLite write contention under load | Scalability | 9/10 |
| 3 | No rate limiting on most API routes | Security | 8/10 |
| 4 | 3s polling doesn't scale past ~20 users/room | Scalability | 8/10 |
| 5 | Vote race condition on votedBy JSON | Scalability | 7/10 |

## High Priority Issues (P1)

| # | Issue | Area |
|---|-------|------|
| 6 | Guest friend request endpoint data leak | Security |
| 7 | No caching on external API responses | Performance |
| 8 | Guest token in response body (XSS risk) | Security |
| 9 | Playlist generation blocks API thread | Scalability |
| 10 | No input validation library | Backend |
| 11 | N+1 in generate-playlist member loop | Backend |

## Medium Priority Issues (P2)

| # | Issue | Area |
|---|-------|------|
| 12 | In-memory rate limiter resets on deploy | Security |
| 13 | No email validation on signup | Security |
| 14 | Invite tokens reusable unlimited times | Security |
| 15 | No empty states for rooms/friends | UX |
| 16 | No error recovery on auth failures | UX |
| 17 | Album images not size-optimized | Performance |
| 18 | No structured logging | Backend |
| 19 | Inconsistent auth patterns | Backend |
| 20 | Missing DB indexes on QueueItem | Scalability |

---

## Top 5 Recommendations

### 1. 🚀 Parallelize playlist generation
**Impact:** 10x faster (90s → 9s)
```typescript
// Before: sequential
for (const artist of artists) {
  const similar = await lastfm.getSimilarArtists(artist);
  // ...
}

// After: parallel
const results = await Promise.all(
  artists.map(artist => discoverViaLastfm(artist, ...))
);
```

### 2. 🗄️ Migrate SQLite → PostgreSQL
**Impact:** Enables concurrent writes, proper indexing, production-ready
**Effort:** 2-4 hours (Prisma makes this trivial)
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 3. 🔒 Add rate limiting to all mutation endpoints
**Impact:** Prevents abuse, DoS protection
**Effort:** 30 minutes (pattern already exists)

### 4. 📡 Replace polling with WebSockets/SSE
**Impact:** Real-time updates, 95% less server load
**Effort:** 4-8 hours (Socket.io or Pusher)

### 5. ✅ Add Zod input validation
**Impact:** Type-safe inputs, better error messages, prevents malformed data
**Effort:** 2-3 hours

---

## Production Readiness

### ✅ MVP-ready? **Yes, with conditions**

The app is functional and well-structured for an MVP. Auth flows work, core features are solid, and recent security fixes (JWT guests, IDOR protection) show security awareness.

### ⚠️ Blockers before public launch:

1. **Must fix:** Rate limiting on signup and join routes (abuse vector)
2. **Must fix:** Guest friend request data leak (privacy)
3. **Should fix:** Playlist generation performance (30-90s is too slow for UX)
4. **Should fix:** PostgreSQL migration (SQLite will break at ~10 concurrent users)
5. **Nice to have:** WebSockets for real-time queue updates

### 🏁 Recommended launch sequence:

1. Add rate limiting everywhere (30 min)
2. Fix guest request endpoint auth (15 min)
3. Remove guestToken from JSON response (5 min)
4. Add basic caching for Last.fm/Spotify (2h)
5. Parallelize playlist generation (4h)
6. → **Launch MVP** ←
7. Migrate to PostgreSQL (post-launch, before scaling)
8. Add WebSockets (post-launch, when needed)

---

*Generated: 2026-02-20 via Claude Opus 4.6*
*Full codebase audit: 55 source files reviewed*
*Codebase: /root/clawd/repos/novastate/musik-app*
