"use client";

import { useEffect } from "react";

/** Largest innerHeight seen this session — Android shrinks innerHeight with the keyboard. */
let maxLayoutH = 0;

/** Keeps --uvs-keyboard / --uvs-vv-height in sync with the iOS/Android keyboard. */
export function useKeyboardInset() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const viewport = window.visualViewport;

    const apply = () => {
      const layoutH = window.innerHeight;
      const vvH = viewport?.height ?? layoutH;
      const offsetTop = viewport?.offsetTop ?? 0;
      if (layoutH > maxLayoutH) maxLayoutH = layoutH;
      const fullH = Math.max(maxLayoutH, layoutH);
      const keyboard = Math.max(
        0,
        Math.round(fullH - vvH - offsetTop),
        Math.round(layoutH - vvH - offsetTop)
      );
      root.style.setProperty("--uvs-keyboard", `${keyboard}px`);
      root.style.setProperty("--uvs-vv-height", `${Math.round(vvH)}px`);
      root.style.setProperty("--uvs-vv-top", `${Math.round(offsetTop)}px`);
      if (keyboard > 80) root.setAttribute("data-uvs-keyboard", "1");
      else root.removeAttribute("data-uvs-keyboard");
    };

    const onOrientation = () => {
      maxLayoutH = 0;
      apply();
    };

    apply();
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", onOrientation);
      root.style.removeProperty("--uvs-keyboard");
      root.style.removeProperty("--uvs-vv-height");
      root.style.removeProperty("--uvs-vv-top");
      root.removeAttribute("data-uvs-keyboard");
    };
  }, []);
}
