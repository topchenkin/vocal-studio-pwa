"use client";

import { useEffect } from "react";

/** Keeps --uvs-keyboard / --uvs-vv-height in sync with the iOS keyboard. */
export function useKeyboardInset() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const viewport = window.visualViewport;

    const apply = () => {
      const layoutH = window.innerHeight;
      const vvH = viewport?.height ?? layoutH;
      const offsetTop = viewport?.offsetTop ?? 0;
      const keyboard = Math.max(0, Math.round(layoutH - vvH - offsetTop));
      root.style.setProperty("--uvs-keyboard", `${keyboard}px`);
      root.style.setProperty(
        "--uvs-vv-height",
        `${Math.round(vvH)}px`
      );
      if (keyboard > 80) root.setAttribute("data-uvs-keyboard", "1");
      else root.removeAttribute("data-uvs-keyboard");
    };

    apply();
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    return () => {
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--uvs-keyboard");
      root.style.removeProperty("--uvs-vv-height");
      root.removeAttribute("data-uvs-keyboard");
    };
  }, []);
}
