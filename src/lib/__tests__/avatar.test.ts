import { describe, it, expect } from "vitest";
import { profileAvatarUrl } from "@/lib/avatar";

describe("profileAvatarUrl", () => {
  it("sin foto subida no apunta a /api/avatar (evita el 404)", () => {
    expect(profileAvatarUrl({ userId: "u1", hasAvatar: false, version: "2026-10-23" })).toBeNull();
    expect(profileAvatarUrl({ userId: "u1", hasAvatar: null })).toBeNull();
  });

  it("sin foto subida usa la imagen del proveedor si la hay", () => {
    expect(profileAvatarUrl({ userId: "u1", hasAvatar: false, fallbackImage: "https://img.test/a.png" })).toBe(
      "https://img.test/a.png"
    );
  });

  it("con foto subida versiona la URL para no servir la imagen anterior de la caché", () => {
    expect(profileAvatarUrl({ userId: "u1", hasAvatar: true, version: "2026-10-23 10:00:00+00" })).toBe(
      "/api/avatar/u1?v=2026-10-23%2010%3A00%3A00%2B00"
    );
  });

  it("con foto subida y sin versión devuelve la URL sin parámetro", () => {
    expect(profileAvatarUrl({ userId: "u1", hasAvatar: true, version: "" })).toBe("/api/avatar/u1");
  });
});
