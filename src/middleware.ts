import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  const { pathname } = req.nextUrl;

  // Allow public pages
  if (pathname === "/" || pathname === "/login" || pathname === "/signup") {
    if (token) {
      return NextResponse.redirect(new URL("/app", req.url));
    }
    return NextResponse.next();
  }

  // Allow /join for guests (handled in the page itself)
  if (pathname.startsWith("/join")) {
    return NextResponse.next();
  }

  // Allow /room for guests with guestToken cookie (signed JWT)
  if (pathname.startsWith("/room/")) {
    const guestToken = req.cookies.get("guestToken")?.value;
    if (token || guestToken) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Not logged in → redirect to login
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Logged in but not onboarded → force onboarding (only for Spotify users)
  if (!token.onboarded && token.authType === "spotify" && !pathname.startsWith("/onboarding") && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // Already onboarded but visiting onboarding → redirect to app
  if (token.onboarded && pathname.startsWith("/onboarding")) {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/signup", "/app/:path*", "/onboarding/:path*", "/profile/:path*", "/room/:path*", "/join/:path*"],
};
