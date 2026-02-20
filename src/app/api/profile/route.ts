import { rateLimitPreset } from "@/lib/rate-limit";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const limited = rateLimitPreset(req, "general");
  if (limited) return limited;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { preferences: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    imageUrl: user.imageUrl,
    onboarded: user.onboarded,
    genres: user.preferences.filter((p) => p.type === "genre").map((p) => p.value),
    artists: user.preferences.filter((p) => p.type === "artist").map((p) => p.value),
  });
}

export async function PUT(req: Request) {
  const limited = rateLimitPreset(req, "general");
  if (limited) return limited;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { genres, artists } = (await req.json()) as {
    genres: string[];
    artists: string[];
  };

  const preferences = [
    ...genres.map((g) => ({ userId: session.user.id, type: "genre" as const, value: g, weight: 1.0 })),
    ...artists.map((a) => ({ userId: session.user.id, type: "artist" as const, value: a, weight: 1.0 })),
  ];

  await prisma.$transaction([
    prisma.preference.deleteMany({ where: { userId: session.user.id } }),
    ...preferences.map((p) => prisma.preference.create({ data: p })),
  ]);

  return NextResponse.json({ ok: true });
}
