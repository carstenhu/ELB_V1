import type { MasterData } from "@elb/domain/index";
import { AppError } from "./errors";

export const ADMIN_SESSION_DURATION_MINUTES = 15;

export interface AdminSession {
  unlockedAt: string;
  unlockedUntil: string;
}

export function createAdminSession(nowIso: string, durationMinutes = ADMIN_SESSION_DURATION_MINUTES): AdminSession {
  const now = new Date(nowIso);
  return {
    unlockedAt: now.toISOString(),
    unlockedUntil: new Date(now.getTime() + durationMinutes * 60_000).toISOString()
  };
}

export function isAdminSessionActive(session: AdminSession | null, nowIso: string): boolean {
  if (!session) {
    return false;
  }

  return new Date(session.unlockedUntil).getTime() > new Date(nowIso).getTime();
}

export function unlockAdminSession(inputPin: string, masterData: MasterData, nowIso: string): AdminSession {
  if (inputPin.trim() !== masterData.adminPin.trim()) {
    throw new AppError("ADMIN_PIN_INVALID", "Die Admin-PIN ist ungültig.");
  }

  return createAdminSession(nowIso);
}
