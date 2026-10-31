"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createHostTokenProvider,
  installHostAuthentication,
} from "@/lib/causl/host-auth";

interface HostAuthShellProps {
  children: React.ReactNode;
  allowedOrigins: string[];
}

export default function HostAuthShell({
  children,
  allowedOrigins,
}: HostAuthShellProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("causlWorkspace");
  const hosted = pathname === "/causl" && params.get("hostAuth") === "1";
  const parentOrigin = params.get("parentOrigin");
  const nonce = params.get("bridge");
  const [ready, setReady] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const sessionKey = `${parentOrigin}:${nonce}`;
  useEffect(() => {
    if (!hosted) return;
    if (
      !parentOrigin ||
      !allowedOrigins.includes(parentOrigin) ||
      !nonce ||
      !/^[a-f0-9-]{36}$/i.test(nonce) ||
      window.parent === window
    ) {
      setFailed(true);
      return;
    }
    let active = true;
    setFailed(false);
    const original = window.fetch;
    const provider = createHostTokenProvider({ window, parentOrigin, nonce });
    window.fetch = installHostAuthentication({
      origin: window.location.origin,
      fetch: original.bind(window),
      token: () =>
        provider.token().catch((error) => {
          if (active) {
            setReady(null);
            setFailed(true);
          }
          throw error;
        }),
    });
    void window
      .fetch("/api/me")
      .then((response) => {
        if (active) {
          setReady(response.ok ? sessionKey : null);
          setFailed(!response.ok);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      window.fetch = original;
      provider.dispose();
    };
  }, [hosted, parentOrigin, nonce, sessionKey, allowedOrigins]);
  if (!hosted) return <>{children}</>;
  if (ready !== sessionKey)
    return <p role="status">{t(failed ? "unavailable" : "opening")}</p>;
  return <>{children}</>;
}
