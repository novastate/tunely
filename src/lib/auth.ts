import { NextAuthOptions } from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import type { JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";

const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-private",
  "user-library-read",
  "user-top-read",
  "playlist-read-private",
  "playlist-modify-public",
  "playlist-modify-private",
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
        client_id: process.env.SPOTIFY_CLIENT_ID!,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET!,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to refresh token");
    }

    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      refreshToken: data.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error("Error refreshing Spotify access token:", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: {
        params: { scope: SPOTIFY_SCOPES },
      },
    }),
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name || user.displayName,
          image: user.image || user.imageUrl,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Credentials login
      if (user && account?.provider === "credentials") {
        token.userId = user.id;
        token.onboarded = true; // email users skip onboarding (no Spotify needed)
        token.authType = "email";
        return token;
      }

      // Spotify OAuth login
      if (account && profile) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.spotifyId = (profile as { id: string }).id;
        token.authType = "spotify";

        const spotifyProfile = profile as {
          id: string;
          display_name?: string;
          email?: string;
          images?: { url: string }[];
        };
        const dbUser = await prisma.user.upsert({
          where: { spotifyId: spotifyProfile.id },
          update: {
            displayName: spotifyProfile.display_name || "Unknown",
            email: spotifyProfile.email,
            imageUrl: spotifyProfile.images?.[0]?.url,
            spotifyAccessToken: account.access_token,
            spotifyRefreshToken: account.refresh_token,
          },
          create: {
            spotifyId: spotifyProfile.id,
            displayName: spotifyProfile.display_name || "Unknown",
            name: spotifyProfile.display_name || "Unknown",
            email: spotifyProfile.email,
            imageUrl: spotifyProfile.images?.[0]?.url,
            spotifyAccessToken: account.access_token,
            spotifyRefreshToken: account.refresh_token,
          },
        });
        token.userId = dbUser.id;
        token.onboarded = dbUser.onboarded;
      }

      // Re-check onboarded status
      if (!token.onboarded && token.userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { onboarded: true },
        });
        if (dbUser?.onboarded) {
          token.onboarded = true;
        }
      }

      // Refresh Spotify token if needed
      if (token.authType === "spotify") {
        const expiresAt = (token.expiresAt as number) ?? 0;
        if (Date.now() < expiresAt * 1000 - 300_000) {
          return token;
        }
        return await refreshAccessToken(token);
      }

      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        accessToken: (token.accessToken as string) || "",
        error: token.error as string | undefined,
        user: {
          ...session.user,
          id: token.userId as string,
          spotifyId: (token.spotifyId as string) || "",
          onboarded: (token.onboarded as boolean) || false,
          authType: (token.authType as string) || "spotify",
        },
      };
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
};
