import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken: string;
    user: {
      id: string;
      spotifyId: string;
      onboarded: boolean;
      authType: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    spotifyId?: string;
    userId?: string;
    onboarded?: boolean;
    authType?: string;
  }
}
