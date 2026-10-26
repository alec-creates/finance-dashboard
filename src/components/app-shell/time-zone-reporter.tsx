"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { TIME_ZONE_COOKIE } from "@/lib/time-zone";

/**
 * Tells the server which time zone this browser is in (a non-sensitive IANA name, e.g. "America/Chicago"), so pages
 * can open on the owner's local month. If it was missing or changed (travel), the current page is refreshed once.
 */
export function TimeZoneReporter() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) {
      return;
    }
    const current = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.slice(TIME_ZONE_COOKIE.length + 1);
    if (current && decodeURIComponent(current) === zone) {
      return;
    }
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    router.refresh();
  }, [router]);
  return null;
}
