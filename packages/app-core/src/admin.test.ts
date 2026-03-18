import { describe, expect, it } from "vitest";
import { createEmptyMasterData } from "@elb/domain/index";
import { ADMIN_SESSION_DURATION_MINUTES, isAdminSessionActive, unlockAdminSession } from "./admin";

describe("admin session", () => {
  it("entsperrt mit gültiger PIN und setzt ein Ablaufdatum", () => {
    const masterData = createEmptyMasterData();
    masterData.adminPin = "2026";

    const session = unlockAdminSession("2026", masterData, "2026-03-18T10:00:00.000Z");

    expect(session.unlockedAt).toBe("2026-03-18T10:00:00.000Z");
    expect(session.unlockedUntil).toBe("2026-03-18T10:15:00.000Z");
    expect(ADMIN_SESSION_DURATION_MINUTES).toBe(15);
  });

  it("meldet abgelaufene Sessions korrekt", () => {
    const active = isAdminSessionActive(
      {
        unlockedAt: "2026-03-18T10:00:00.000Z",
        unlockedUntil: "2026-03-18T10:15:00.000Z"
      },
      "2026-03-18T10:16:00.000Z"
    );

    expect(active).toBe(false);
  });
});
