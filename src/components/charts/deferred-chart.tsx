"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function DeferredChart({ children, label, minHeight = 400 }: { children: ReactNode; label: string; minHeight?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const Observer = window.IntersectionObserver;
    if (typeof Observer !== "function") {
      const timer = globalThis.setTimeout(() => setVisible(true), 0);
      return () => globalThis.clearTimeout(timer);
    }

    const observer = new Observer(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={host} className="min-w-0" style={{ minHeight }}>
      {visible ? children : <div className="flex h-full min-h-[inherit] items-center justify-center rounded-2xl border border-line bg-card text-sm text-muted" role="status">Chart loads when this section is near view: {label}</div>}
    </div>
  );
}
