"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";

export interface UserProfile {
  id: string;
  displayName: string;
  email: string | null;
  imageUrl: string | null;
  onboarded: boolean;
  genres: string[];
  artists: string[];
}

export function useUserProfile() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        setProfile(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (status === "authenticated") {
      refetch();
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status, refetch]);

  return { profile, loading: loading || status === "loading", refetch };
}
