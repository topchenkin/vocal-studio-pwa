"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import AuthModal from "@/components/auth/AuthModal";
import Button from "@/components/ui/Button";

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
