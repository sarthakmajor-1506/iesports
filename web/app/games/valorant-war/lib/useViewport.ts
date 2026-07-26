// Tiny viewport hook for inline-only-styles responsive layouts.
// (We can't use CSS media queries because the project rule is no CSS files —
// so components branch on `isMobile` from a JS hook instead.)
'use client';
import { useEffect, useState } from 'react';

export interface Viewport {
  width: number;
  height: number;
  isMobile: boolean;     // < 768
  isNarrow: boolean;     // < 1024
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => {
    if (typeof window === 'undefined') {
      return { width: 1280, height: 720, isMobile: false, isNarrow: false };
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { width: w, height: h, isMobile: w < 768, isNarrow: w < 1024 };
  });

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setVp({ width: w, height: h, isMobile: w < 768, isNarrow: w < 1024 });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return vp;
}
