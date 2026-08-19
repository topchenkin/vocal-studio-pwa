"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { realtimeTopic } from "@/lib/client-instance";
import { supabase, resyncSupabaseTransport } from "@/lib/supabase";
import {
  mapBackendError,
  isLikelyUnreachableBackend,
  withTimeout,
  SUPABASE_UNREACHABLE_RU,
} from "@/lib/supabase-errors";
import type {
  AppSubscriptionTier,
  StudentProfile,
  UserRole,
} from "@/types";

type AuthResult = { error: string | null; needsEmailConfirmation?: boolean };

interface AuthContextValue {
  user: User | null;
  profile: StudentProfile | null;
  profileError: string | null;
  backendError: string | null;
  role: UserRole;
  tier: AppSubscriptionTier;
  loading: boolean;
  isGuest: boolean;
  isStudent: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isActiveStudent: boolean;
  isMockAdmin: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  enableMockAdmin: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const MOCK_ADMIN_KEY = "uvs_mock_admin";
const AUTH_BOOT_MS = 12_000;
const PROFILE_MS = 12_000;

const mockAdminProfile: StudentProfile = {
  id: "mock-admin",
  email: "iris.jar008@gmail.com",
  full_name: "Тестовый администратор",
  role: "admin",
  app_sub_tier: "vip",
  app_sub_variant: "individual",
  cat_level: "star",
  is_active_student: true,
  lesson_pay_type: "one_time",
  custom_lesson_price: 0,
  custom_abonement_price: 0,
  lessons_balance: 0,
  debt_amount: 0,
};

const mockAdminUser = {
  id: "mock-admin",
  email: "iris.jar008@gmail.com",
  user_metadata: { full_name: "Тестовый администратор" },
  app_metadata: {},
  aud: "authenticated",
  created_at: new Date(0).toISOString(),
} as User;

async function fetchProfile(
  userId: string
): Promise<{ profile: StudentProfile | null; unreachable: boolean }> {
  try {
    const { data, error } = await withTimeout(
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      PROFILE_MS
    );

    if (error) {
      if (isLikelyUnreachableBackend(error)) {
        return { profile: null, unreachable: true };
      }
      console.error("Unable to load profile:", error.message);
      return { profile: null, unreachable: false };
    }

    return { profile: data, unreachable: false };
  } catch (error) {
    if (isLikelyUnreachableBackend(error)) {
      return { profile: null, unreachable: true };
    }
    console.error("Unable to load profile:", error);
    return { profile: null, unreachable: false };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isMockAdmin, setIsMockAdmin] = useState(false);

  const loadProfile = useCallback(
    async (authUser: User | null, quiet = false) => {
      if (!authUser) {
        setProfile(null);
        setProfileError(null);
        return;
      }

      const { profile: loadedProfile, unreachable } = await fetchProfile(
        authUser.id
      );
      if (unreachable) {
        if (!quiet) {
          setBackendError(SUPABASE_UNREACHABLE_RU);
          setProfileError(SUPABASE_UNREACHABLE_RU);
        }
        return;
      }
      setProfile(loadedProfile);
      setBackendError(null);
      setProfileError(
        loadedProfile
          ? null
          : "Профиль ученика не найден в базе. Администратору нужно выполнить backfill-миграцию."
      );
    },
    []
  );

  useEffect(() => {
    let mounted = true;

    if (
      process.env.NODE_ENV === "development" &&
      sessionStorage.getItem(MOCK_ADMIN_KEY) === "1"
    ) {
      setUser(mockAdminUser);
      setProfile(mockAdminProfile);
      setProfileError(null);
      setIsMockAdmin(true);
      setLoading(false);
      return;
    }

    let subscription: { unsubscribe: () => void } | undefined;

    void (async () => {
      try {
        const {
          data: { session },
        } = await withTimeout(supabase.auth.getSession(), AUTH_BOOT_MS);
        if (!mounted) return;
        setUser(session?.user ?? null);
        await loadProfile(session?.user ?? null);
        if (mounted) {
          if (!session) setBackendError(null);
          setLoading(false);
        }
      } catch (error) {
        if (!mounted) return;
        setUser(null);
        setProfile(null);
        setBackendError(mapBackendError(error, SUPABASE_UNREACHABLE_RU));
        setLoading(false);
      }

      if (!mounted) return;
      const {
        data: { subscription: nextSub },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "TOKEN_REFRESHED") return;
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        void loadProfile(nextUser).finally(() => setLoading(false));
      });
      subscription = nextSub;
    })();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!user || isMockAdmin) return;

    const channel = supabase
      .channel(realtimeTopic(`profile-live:${user.id}`))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          setProfile(payload.new as StudentProfile);
          setProfileError(null);
          window.dispatchEvent(new Event("uvs-profile-updated"));
        }
      )
      .subscribe();

    const refreshQuiet = () => {
      resyncSupabaseTransport();
      void loadProfile(user, true).then(() => {
        window.dispatchEvent(new Event("uvs-profile-updated"));
      });
    };

    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt < 8_000) return;
      refreshQuiet();
    };

    const onOnline = () => {
      resyncSupabaseTransport();
      void loadProfile(user, false).then(() => {
        window.dispatchEvent(new Event("uvs-profile-updated"));
      });
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [isMockAdmin, loadProfile, user]);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string): Promise<AuthResult> => {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        });

        if (error) return { error: mapBackendError(error) };

        if (data.session && data.user) {
          await loadProfile(data.user);
        }

        setBackendError(null);
        return {
          error: null,
          needsEmailConfirmation: !data.session,
        };
      } catch (error) {
        const message = mapBackendError(error);
        setBackendError(message);
        return { error: message };
      }
    },
    [loadProfile]
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) return { error: mapBackendError(error) };

        setUser(data.user);
        await loadProfile(data.user);
        setBackendError(null);
        return { error: null };
      } catch (error) {
        const message = mapBackendError(error);
        setBackendError(message);
        return { error: message };
      }
    },
    [loadProfile]
  );

  const signOut = useCallback(async () => {
    sessionStorage.removeItem(MOCK_ADMIN_KEY);
    setIsMockAdmin(false);
    await supabase.auth.signOut({ scope: "local" });
    setUser(null);
    setProfile(null);
    setProfileError(null);
    setBackendError(null);
  }, []);

  const enableMockAdmin = useCallback(() => {
    if (process.env.NODE_ENV !== "development") return;
    sessionStorage.setItem(MOCK_ADMIN_KEY, "1");
    setUser(mockAdminUser);
    setProfile(mockAdminProfile);
    setProfileError(null);
    setBackendError(null);
    setIsMockAdmin(true);
    setLoading(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      resyncSupabaseTransport();
      if (!user) {
        const {
          data: { session },
        } = await withTimeout(supabase.auth.getSession(), AUTH_BOOT_MS);
        setUser(session?.user ?? null);
        await loadProfile(session?.user ?? null);
        return;
      }
      await loadProfile(user);
    } catch (error) {
      setBackendError(mapBackendError(error, SUPABASE_UNREACHABLE_RU));
    }
  }, [loadProfile, user]);

  const role: UserRole = profile?.role ?? (user ? "student" : "guest");
  const tier = profile?.app_sub_tier ?? "none";

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      profileError,
      backendError,
      role,
      tier,
      loading,
      isGuest: !user,
      isStudent: role === "student",
      isAdmin: role === "admin",
      isAuthenticated: Boolean(user),
      isActiveStudent: profile?.is_active_student ?? false,
      isMockAdmin,
      signUp,
      signIn,
      signOut,
      refreshProfile,
      enableMockAdmin,
    }),
    [
      user,
      profile,
      profileError,
      backendError,
      role,
      tier,
      loading,
      isMockAdmin,
      signUp,
      signIn,
      signOut,
      refreshProfile,
      enableMockAdmin,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
