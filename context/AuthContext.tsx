"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { realtimeTopic } from "@/lib/client-instance";
import {
  hasCachedSession,
  readCachedProfile,
  readCachedUser,
  writeCachedProfile,
} from "@/lib/session-cache";
import {
  installNetworkGuards,
  recoverSupabaseRoute,
  supabase,
} from "@/lib/supabase";
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
  reconnecting: boolean;
  role: UserRole;
  tier: AppSubscriptionTier;
  loading: boolean;
  isGuest: boolean;
  isStudent: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isActiveStudent: boolean;
  isMockAdmin: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone?: string,
    giftCode?: string
  ) => Promise<AuthResult>;
  signIn: (
    email: string,
    password: string,
    options?: { allowAdmin?: boolean }
  ) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  enableMockAdmin: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const MOCK_ADMIN_KEY = "uvs_mock_admin";
const AUTH_BOOT_MS = 8_000;
const PROFILE_MS = 8_000;

const mockAdminProfile: StudentProfile = {
  id: "mock-admin",
  email: "iris.jar008@gmail.com",
  full_name: "Тестовый администратор",
  role: "admin",
  app_sub_tier: "vip",
  app_sub_variant: "individual",
  app_sub_expires_at: null,
  cat_level: "star",
  cat_xp: 0,
  cat_exam_ready: false,
  cat_streak_days: 0,
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
  const [reconnecting, setReconnecting] = useState(false);
  const [isMockAdmin, setIsMockAdmin] = useState(false);
  const profileRef = useRef<StudentProfile | null>(null);
  profileRef.current = profile;

  const loadProfile = useCallback(
    async (authUser: User | null, quiet = false) => {
      if (!authUser) {
        if (hasCachedSession()) return;
        setProfile(null);
        writeCachedProfile(null);
        setProfileError(null);
        return;
      }

      const { profile: loadedProfile, unreachable } = await fetchProfile(
        authUser.id
      );
      if (unreachable) {
        setReconnecting(true);
        const kept = profileRef.current ?? readCachedProfile();
        if (kept) setProfile(kept);
        else if (!quiet) {
          setBackendError(SUPABASE_UNREACHABLE_RU);
          setProfileError(SUPABASE_UNREACHABLE_RU);
        }
        return;
      }
      setProfile(loadedProfile);
      writeCachedProfile(loadedProfile);
      setReconnecting(false);
      setBackendError(null);
      setProfileError(
        loadedProfile
          ? null
          : "Профиль ученика не найден в базе. Администратору нужно выполнить backfill-миграцию."
      );
    },
    []
  );

  useLayoutEffect(() => {
    const cachedUser = readCachedUser();
    const cachedProfile = readCachedProfile();
    if (cachedUser) {
      setUser(cachedUser);
      if (cachedProfile) setProfile(cachedProfile);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    installNetworkGuards();

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
        const nextUser = session?.user ?? readCachedUser();
        setUser(nextUser);
        await loadProfile(nextUser, true);
        if (mounted) {
          if (!nextUser) setBackendError(null);
          setLoading(false);
        }
      } catch {
        if (!mounted) return;
        const cachedUser = readCachedUser();
        if (cachedUser) {
          setUser(cachedUser);
          const cachedProfile = readCachedProfile();
          if (cachedProfile) setProfile(cachedProfile);
          setReconnecting(true);
        } else {
          setBackendError(SUPABASE_UNREACHABLE_RU);
        }
        setLoading(false);
      }

      if (!mounted) return;
      const {
        data: { subscription: nextSub },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "TOKEN_REFRESHED") return;
        if (
          (event === "SIGNED_OUT" || !session) &&
          hasCachedSession()
        ) {
          return;
        }
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        void loadProfile(nextUser, true).finally(() => setLoading(false));
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
          const next = payload.new as StudentProfile;
          setProfile(next);
          writeCachedProfile(next);
          setProfileError(null);
          window.dispatchEvent(new Event("uvs-profile-updated"));
        }
      )
      .subscribe();

    const onRecovered = () => {
      void loadProfile(user, true).then(() => {
        window.dispatchEvent(new Event("uvs-profile-updated"));
      });
    };
    const onReconnecting = () => setReconnecting(true);

    window.addEventListener("uvs-route-recovered", onRecovered);
    window.addEventListener("uvs-reconnecting", onReconnecting);
    const onProfileUpdated = () => {
      void loadProfile(user, true);
    };
    window.addEventListener("uvs-profile-updated", onProfileUpdated);

    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener("uvs-route-recovered", onRecovered);
      window.removeEventListener("uvs-reconnecting", onReconnecting);
      window.removeEventListener("uvs-profile-updated", onProfileUpdated);
    };
  }, [isMockAdmin, loadProfile, user]);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      phone?: string,
      giftCode?: string
    ): Promise<AuthResult> => {
      try {
        const compactGift = (giftCode || "")
          .replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: phone?.trim() || null,
              ...(compactGift.length === 12 ? { gift_code: compactGift } : {}),
            },
          },
        });

        if (error) return { error: mapBackendError(error) };

        if (data.session && data.user) {
          // Ensure name is on the profile before client-side redeem fallback.
          await supabase
            .from("profiles")
            .update({
              full_name: fullName.trim(),
              phone: phone?.trim() || null,
            })
            .eq("id", data.user.id);

          if (compactGift.length === 12) {
            const { error: redeemError } = await supabase.rpc(
              "redeem_gift_certificate",
              {
                p_code: compactGift,
                p_full_name: fullName.trim(),
              }
            );
            if (redeemError) {
              console.warn("gift redeem after signup", redeemError.message);
            }
          }

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
    async (
      email: string,
      password: string,
      options?: { allowAdmin?: boolean }
    ): Promise<AuthResult> => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) return { error: mapBackendError(error) };

        const { data: signedProfile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profileError) {
          await supabase.auth.signOut({ scope: "local" });
          return { error: mapBackendError(profileError) };
        }

        // Student/public login must not accept admin — only the unlisted gate may.
        if (signedProfile?.role === "admin" && !options?.allowAdmin) {
          await supabase.auth.signOut({ scope: "local" });
          writeCachedProfile(null);
          setUser(null);
          setProfile(null);
          return {
            error:
              "Вход администратора только через служебную ссылку админки",
          };
        }

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
    writeCachedProfile(null);
    setIsMockAdmin(false);
    await supabase.auth.signOut({ scope: "local" });
    setUser(null);
    setProfile(null);
    setProfileError(null);
    setBackendError(null);
    setReconnecting(false);
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
      await recoverSupabaseRoute();
      const authUser = user ?? readCachedUser();
      if (!authUser) {
        const {
          data: { session },
        } = await withTimeout(supabase.auth.getSession(), AUTH_BOOT_MS);
        setUser(session?.user ?? null);
        await loadProfile(session?.user ?? null);
        return;
      }
      setUser(authUser);
      await loadProfile(authUser);
    } catch (error) {
      if (!profileRef.current && !readCachedProfile()) {
        setBackendError(mapBackendError(error, SUPABASE_UNREACHABLE_RU));
      } else {
        setReconnecting(true);
      }
    }
  }, [loadProfile, user]);

  const role: UserRole = profile?.role ?? (user ? "student" : "guest");
  const rawTier = profile?.app_sub_tier ?? "none";
  const expired =
    Boolean(profile?.app_sub_expires_at) &&
    new Date(profile!.app_sub_expires_at!).getTime() <= Date.now();
  const tier: AppSubscriptionTier =
    rawTier !== "none" && expired ? "none" : rawTier;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      profileError,
      backendError,
      reconnecting,
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
      reconnecting,
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
