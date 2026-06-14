import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import { db } from "@/db";
import { user, account, profiles } from "@/db/schema";

const email = `smoke_${Date.now()}@example.com`;
let createdId: string | undefined;

describe("better-auth smoke (sales-tracker-db)", () => {
  it("signup crea user + profile (hook) y signin valida", async () => {
    const up: any = await auth.api.signUpEmail({
      body: { email, password: "Smoke1234!", name: "Smoke Test" },
    });
    expect(up.user?.id).toBeTruthy();
    createdId = up.user.id;

    const [p] = await db.select().from(profiles).where(eq(profiles.id, createdId!));
    expect(p).toBeTruthy();
    expect(p.role).toBe("viewer");
    expect(p.is_approved).toBe(false);

    const inn: any = await auth.api.signInEmail({
      body: { email, password: "Smoke1234!" },
    });
    expect(inn.token ?? inn.user?.id).toBeTruthy();
  });

  afterAll(async () => {
    if (createdId) {
      await db.delete(profiles).where(eq(profiles.id, createdId));
      await db.delete(account).where(eq(account.userId, createdId));
      await db.delete(user).where(eq(user.id, createdId));
    }
  });
});
