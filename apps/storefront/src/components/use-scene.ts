"use client";
import type { RefObject } from "react";
import { useEffect, useState } from "react";

const idle = (fn: () => void) =>
  "requestIdleCallback" in window
    ? requestIdleCallback(fn, { timeout: 1500 })
    : setTimeout(fn, 200);

interface Scene {
  dispose: () => void;
  setVisible: (v: boolean) => void;
}

/**
 * Mounts a WebGL scene only when `ref` comes within `rootMargin` of the
 * viewport (dynamic import, never on the critical path), pauses it off-screen
 * and disposes it on unmount. Returns null until ready, or when WebGL is missing.
 */
export function useLazyScene<S extends Scene>(
  ref: RefObject<HTMLElement | null>,
  mount: () => Promise<S>,
  rootMargin: string,
) {
  const [scene, setScene] = useState<S | null>(null);
  useEffect(() => {
    const el = ref.current;
    // no WebGL 2 or data saver: the DOM fallback stays (fully shoppable)
    const saveData = (navigator as { connection?: { saveData?: boolean } })
      .connection?.saveData;
    if (
      !el ||
      saveData ||
      !document.createElement("canvas").getContext("webgl2")
    ) {
      return;
    }
    let live: S | null = null;
    let disposed = false;
    const near = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) {
          return;
        }
        near.disconnect();
        // build the scene when the main thread is idle, so hydration and input come first
        idle(() =>
          mount()
            .then((s) => {
              if (disposed) {
                return s.dispose();
              }
              live = s;
              setScene(s);
              seen.observe(el);
            })
            .catch((err: unknown) =>
              console.error("Scène 3D indisponible", err),
            ),
        );
      },
      { rootMargin },
    );
    const seen = new IntersectionObserver(([e]) =>
      live?.setVisible(!!e?.isIntersecting),
    );
    near.observe(el);
    return () => {
      disposed = true;
      near.disconnect();
      seen.disconnect();
      live?.dispose();
    };
  }, [ref, rootMargin]);
  return scene;
}

/** Sets a CSS custom property on <html> (header STORE pill follows the colour world). */
export const setRootVar = (name: string, value: string) =>
  document.documentElement.style.setProperty(name, value);
