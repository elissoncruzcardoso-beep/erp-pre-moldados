"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type PrototypeActionProps = {
  children: ReactNode;
  className: string;
  message: string;
};

export function PrototypeAction({ children, className, message }: PrototypeActionProps) {
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <>
      <button className={className} type="button" onClick={() => setNotice(message)}>
        {children}
      </button>
      {notice ? (
        <div className="prototype-toast" role="status" aria-live="polite">
          <strong>Ação de protótipo</strong>
          <span>{notice}</span>
        </div>
      ) : null}
    </>
  );
}
