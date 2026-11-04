"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import AuthModal from "@/components/auth/AuthModal";
import Button from "@/components/ui/Button";
import { mapAuthCallbackError } from "@/lib/supabase-errors";

type AuthMode = "login" | "register";

interface PublicAuthValue {
  openAuth: (mode: AuthMode) => void;
}

const PublicAuthContext = createContext<PublicAuthValue | null>(null);

/** One AuthModal per public page; server-rendered content opens it through <AuthCta>. */
export function PublicAuthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("register");

  const openAuth = useCallback((next: AuthMode) => {
    setMode(next);
    setOpen(true);
  }, []);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
      const hashParams = new URLSearchParams(hash);
      const pick = (key: string) =>
        hashParams.get(key) || url.searchParams.get(key);
      const error = pick("error");
      const errorCode = pick("error_code");
      const errorDescription = pick("error_description");
      if (!error && !errorCode && !errorDescription) return;
      const mapped = mapAuthCallbackError({
        error,
        errorCode,
        errorDescription,
      });
      url.hash = "";
      url.searchParams.delete("error");
      url.searchParams.delete("error_code");
      url.searchParams.delete("error_description");
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search
      );
      if (!mapped) return;
      sessionStorage.setItem("uvs-auth-link-error", mapped);
      openAuth("login");
    } catch {
      /* ignore */
    }
  }, [openAuth]);

  const value = useMemo(() => ({ openAuth }), [openAuth]);

  return (
    <PublicAuthContext.Provider value={value}>
      {children}
      <AuthModal
        open={open}
        initialMode={mode}
        onClose={() => setOpen(false)}
      />
    </PublicAuthContext.Provider>
  );
}

/** Null outside public pages (e.g. Header on /uslugi). */
export function useOptionalPublicAuth() {
  return useContext(PublicAuthContext);
}

type CtaProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  mode?: AuthMode;
};

export function AuthCta({ mode = "register", ...props }: CtaProps) {
  const auth = useOptionalPublicAuth();
  return <Button {...props} onClick={() => auth?.openAuth(mode)} />;
}
