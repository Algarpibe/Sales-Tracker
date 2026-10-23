import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// vitest corre en node sin DOM: se renderiza a HTML estático. El Avatar de base-ui no
// pinta el <img> hasta que la imagen carga, así que se sustituye por elementos planos
// para ver qué `src` recibe.
const auth = vi.hoisted(() => ({
  value: {
    user: null as null | { id: string; name: string; email: string },
    profile: null as null | Record<string, unknown>,
    refreshProfile: async () => {},
  },
}));

vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => auth.value }));
vi.mock("@/actions/settings-actions", () => ({
  getCompany: vi.fn(),
  updateCompany: vi.fn(),
  updateMyAccount: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: ({ src }: { src?: string }) => <span data-avatar-src={src} />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { AccountSettingsForm } from "../account-settings-form";

function renderWith(avatarUrl: string | null) {
  auth.value = {
    user: { id: "u1", name: "Persona Uno", email: "persona@example.test" },
    profile: {
      id: "u1",
      company_id: "c1",
      email: "persona@example.test",
      full_name: "Persona Uno",
      avatar_url: avatarUrl,
      role: "lector",
      is_active: true,
      created_at: "",
      updated_at: "",
    },
    refreshProfile: async () => {},
  };
  return renderToStaticMarkup(<AccountSettingsForm />);
}

describe("AccountSettingsForm: avatar", () => {
  it("sin foto subida no pide /api/avatar y muestra las iniciales", () => {
    const html = renderWith(null);
    expect(html).not.toContain("/api/avatar/");
    expect(html).toContain("PU");
  });

  it("con foto subida usa la URL del perfil", () => {
    const html = renderWith("/api/avatar/u1?v=123");
    expect(html).toContain('data-avatar-src="/api/avatar/u1?v=123"');
  });
});
