"use client";

import { createContext, useContext, useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth/client";
import { getMyProfile } from "@/actions/profile-actions";
import { logError } from "@/lib/logger";
import { profileAvatarUrl } from "@/lib/avatar";
import type { Profile, UserRole } from "@/types/database";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

interface AuthContextType {
  user: SessionUser | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const sessionUser = (session?.user as SessionUser | undefined) ?? null;
  const userId = sessionUser?.id ?? null;

  const [profile, setProfile] = useState<Profile | null>(null);
  // Usuario cuyo perfil ya terminó de cargarse: mientras no coincida con el de la
  // sesión, se está cargando (derivado, sin setState síncrono en el efecto: FE-008).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const result = await getMyProfile();

      if (!result) {
        setProfile(null);
        return;
      }

      const { user: u, profile: p } = result;

      // Map better-auth user + drizzle profile into the existing Profile shape
      // so consumer components (header, sidebar, settings) keep working.
      const mapped: Profile = {
        id: u.id,
        company_id: p?.company_id ?? "",
        email: u.email,
        full_name: u.name,
        avatar_url: profileAvatarUrl({
          userId: u.id,
          hasAvatar: p?.has_avatar,
          version: p?.updated_at ? String(p.updated_at) : null,
          fallbackImage: u.image,
        }),
        role: (p?.role as UserRole) ?? "lector",
        is_active: p?.is_active ?? false,
        created_at:
          String(p?.created_at ?? ""),
        updated_at:
          String(p?.updated_at ?? ""),
        // Extra approval flags consumed elsewhere in the app.
        is_approved: p?.is_approved ?? false,
        is_rejected: p?.is_rejected ?? false,
      } as Profile;

      setProfile(mapped);
    } catch (err) {
      logError("loadProfile falló", err);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Sin sesión no se carga nada: el perfil expuesto se anula abajo (FE-008: sin
    // setState síncrono dentro del efecto).
    if (!userId) return;

    // loadProfile solo hace setState después de await getMyProfile() (asíncrono): la regla
    // no lo distingue de un setState síncrono. Falso positivo.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState tras await, no síncrono
    loadProfile().finally(() => {
      if (mounted) setLoadedFor(userId);
    });

    return () => {
      mounted = false;
    };
  }, [userId, loadProfile]);

  const signOut = async () => {
    try {
      await authClient.signOut();
      setProfile(null);
      // Navegación completa (no router.push): descarta TODO el estado en memoria del
      // cliente, incluida la caché de react-query, cuyas claves (["favorites"],
      // ["saved-views", …], ["dashboard-layout"]) no llevan el usuario. Con una
      // navegación SPA, el siguiente usuario de la pestaña vería hasta 60 s los datos
      // cacheados del anterior (DATA-049). Igual que el SignOutButton de waiting-approval.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencionada
      window.location.href = "/login";
    } catch (err) {
      logError("signOut falló", err);
    }
  };

  const loading = isPending || (!!userId && loadedFor !== userId);

  return (
    <AuthContext.Provider
      value={{
        user: sessionUser,
        // Solo el perfil del usuario en sesión: tras cerrar sesión (o cambiar de
        // usuario) nunca se expone el del anterior mientras llega el nuevo.
        profile: profile && profile.id === userId ? profile : null,
        loading,
        signOut,
        refreshProfile: loadProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Estado con el que el servidor renderiza AuthProvider: sin sesión (better-auth hidrata
// useSession con su estado inicial) y sin perfil (solo llega tras getMyProfile).
const SERVER_AUTH = { user: null, profile: null, loading: true } as const;

const noopSubscribe = () => () => {};

/**
 * Contexto de auth, hidratación-segura. Un Suspense del HTML de servidor puede hidratar
 * después de que llegue el perfil (React 19.2 revela esos límites en lote, hasta ~300 ms
 * tras el primer pintado: le pasa al <Sidebar> del layout). Si en esa hidratación se
 * leyera el perfil real, el admin pintaría «Usuarios» y el HTML no coincidiría (React
 * #418). Mientras el componente hidrata se devuelve el estado del servidor; justo después
 * React vuelve a renderizar con el real. En montajes normales devuelve el real desde ya.
 */
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return hydrated ? ctx : { ...ctx, ...SERVER_AUTH };
}
