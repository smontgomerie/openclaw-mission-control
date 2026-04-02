"use client";

import { useEffect, useState } from "react";

import { fetchGatewayBrand } from "@/lib/gateway-brand";

const DEFAULT_BRAND_NAME = "OpenClaw";

const getBrandInitials = (name: string) => {
  const parts = name
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (!parts.length) return "OC";
  return parts
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

export function BrandMark() {
  const [brandName, setBrandName] = useState(DEFAULT_BRAND_NAME);

  useEffect(() => {
    let cancelled = false;

    void fetchGatewayBrand()
      .then((response) => {
        if (cancelled) return;
        const nextName =
          response.identity_name?.trim() || response.gateway_name?.trim();
        if (nextName) {
          setBrandName(nextName);
        }
      })
      .catch(() => {
        // Keep the static fallback when no gateway brand can be resolved.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const initials = getBrandInitials(brandName);

  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 text-xs font-semibold text-white shadow-sm">
        <span className="font-heading tracking-[0.2em]">{initials}</span>
      </div>
      <div className="leading-tight">
        <div className="font-heading text-sm uppercase tracking-[0.26em] text-strong">
          {brandName}
        </div>
        <div className="text-[11px] font-medium text-quiet">
          Mission Control
        </div>
      </div>
    </div>
  );
}
