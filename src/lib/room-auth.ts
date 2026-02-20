import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGuestFromRequest } from "@/lib/guest-auth";

export interface AuthIdentity {
  userId: string | null;
  guestId: string | null;
  guestName: string | null;
}

/**
 * Get authenticated identity from request (session user OR verified guest JWT).
 * Returns 401-worthy null identity if neither is present.
 */
export async function getAuthIdentity(req: Request): Promise<AuthIdentity> {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return { userId: session.user.id, guestId: null, guestName: null };
  }

  const guest = getGuestFromRequest(req);
  if (guest) {
    return { userId: null, guestId: guest.guestId, guestName: guest.guestName };
  }

  return { userId: null, guestId: null, guestName: null };
}

export function isAuthenticated(identity: AuthIdentity): boolean {
  return !!(identity.userId || identity.guestId);
}

/**
 * Check if user/guest is a member of the given room.
 */
export async function verifyRoomAccess(
  roomId: string,
  identity: AuthIdentity
): Promise<boolean> {
  if (identity.userId) {
    const member = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: identity.userId } },
    });
    return !!member;
  }

  if (identity.guestId) {
    const member = await prisma.roomMember.findFirst({
      where: { roomId, guestId: identity.guestId },
    });
    return !!member;
  }

  return false;
}

/**
 * Check if user is the room owner.
 */
export async function verifyRoomOwner(
  roomId: string,
  userId: string
): Promise<boolean> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  return room?.ownerId === userId;
}
