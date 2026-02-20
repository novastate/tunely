import { rateLimitPreset } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const limited = rateLimitPreset(req, "signup");
  if (limited) return limited;
  try {
    const { email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email och lösenord krävs" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Lösenord måste vara minst 6 tecken" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email redan registrerad" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || email.split("@")[0],
        onboarded: true, // email users don't need Spotify onboarding
      },
    });

    return NextResponse.json({ success: true, userId: user.id });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Något gick fel" }, { status: 500 });
  }
}
