"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
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

import { useRouter } from "next/navigation";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      
      if (error) {
        if (error.code !== 'PGRST116') {
          console.error("Error loading profile details:", {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          });
        }
        setProfile(null);
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error("Critical error in loadProfile:", err);
      setProfile(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!mounted) return;

        if (session?.user) {
          setUser(session.user);
          await loadProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setLoading(false);
        router.push('/login');
        router.refresh();
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          // Do not await loadProfile here to prevent GoTrue Client deadlock!
          loadProfile(currentUser.id).finally(() => {
            if (mounted) setLoading(false);
          });
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    });

    // Set up Realtime subscription for profile changes
    let profileChannel: any = null;
    if (user?.id) {
      profileChannel = supabase
        .channel(`public:profiles:id=eq.${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`
          },
          (payload: any) => {
            if (mounted) {
              setProfile(payload.new as Profile);
            }
          }
        )
        .subscribe();
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (profileChannel) {
        supabase.removeChannel(profileChannel);
      }
    };
  }, [supabase, user?.id, router]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error("Error during sign out:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile: () => loadProfile(user?.id || "") }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
