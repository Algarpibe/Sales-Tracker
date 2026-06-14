"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { getMyProfile } from "@/actions/profile-actions";
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
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const sessionUser = (session?.user as SessionUser | undefined) ?? null;
  const userId = sessionUser?.id ?? null;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

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
        company_id: p?.companyId ?? "",
        email: u.email,
        full_name: u.name,
        avatar_url: u.image ?? null,
        role: (p?.role as UserRole) ?? "lector",
        is_active: p?.isActive ?? false,
        created_at:
          p?.createdAt instanceof Date
            ? p.createdAt.toISOString()
            : String(p?.createdAt ?? ""),
        updated_at:
          p?.updatedAt instanceof Date
            ? p.updatedAt.toISOString()
            : String(p?.updatedAt ?? ""),
        // Extra approval flags consumed elsewhere in the app.
        is_approved: p?.isApproved ?? false,
        is_rejected: p?.isRejected ?? false,
      } as Profile;

      setProfile(mapped);
    } catch (err) {
      console.error("Critical error in loadProfile:", err);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!userId) {
      setProfile(null);
      return;
    }

    setProfileLoading(true);
    loadProfile().finally(() => {
      if (mounted) setProfileLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [userId, loadProfile]);

  const signOut = async () => {
    try {
      await authClient.signOut();
      setProfile(null);
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Error during sign out:", err);
    }
  };

  const loading = isPending || (!!userId && profileLoading);

  return (
    <AuthContext.Provider
      value={{
        user: sessionUser,
        profile,
        loading,
        signOut,
        refreshProfile: loadProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
