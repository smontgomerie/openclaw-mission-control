"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import {
  type listGatewaysApiV1GatewaysGetResponse,
  useListGatewaysApiV1GatewaysGet,
} from "@/api/generated/gateways/gateways";
import type { GatewayRead } from "@/api/generated/model";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import SearchableSelect from "@/components/ui/searchable-select";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

import { GatewayFilesystemMemoryView } from "./GatewayFilesystemMemoryView";

export default function MemoryPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string>("");

  const gatewaysQuery = useListGatewaysApiV1GatewaysGet<
    listGatewaysApiV1GatewaysGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });

  const gateways = useMemo(
    () =>
      gatewaysQuery.data?.status === 200
        ? (gatewaysQuery.data.data.items ?? [])
        : [],
    [gatewaysQuery.data],
  );

  const gatewayOptions = useMemo(
    () =>
      gateways.map((gateway: GatewayRead) => ({
        value: gateway.id,
        label: gateway.name,
      })),
    [gateways],
  );

  const effectiveSelectedGatewayId =
    selectedGatewayId &&
    gateways.some((gateway) => gateway.id === selectedGatewayId)
      ? selectedGatewayId
      : (gateways[0]?.id ?? "");

  const selectedGateway = gateways.find(
    (gateway) => gateway.id === effectiveSelectedGatewayId,
  );

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to inspect memory.",
        forceRedirectUrl: "/memory",
        signUpForceRedirectUrl: "/memory",
      }}
      title="Memory"
      description="Inspect gateway-main workspace memory outside the board page."
      isAdmin={isAdmin}
      adminOnlyMessage="Only organization owners and admins can inspect workspace memory."
      stickyHeader
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900">
                Gateway
              </label>
              <SearchableSelect
                ariaLabel="Select gateway"
                value={effectiveSelectedGatewayId}
                onValueChange={setSelectedGatewayId}
                options={gatewayOptions}
                placeholder={
                  gatewaysQuery.isLoading ? "Loading gateways..." : "Select gateway"
                }
                searchPlaceholder="Search gateways..."
                emptyMessage="No gateways found."
                disabled={!gateways.length || gatewaysQuery.isLoading}
                triggerClassName="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                contentClassName="rounded-xl border border-slate-200 shadow-lg"
                itemClassName="px-4 py-3 text-sm text-slate-700 data-[selected=true]:bg-slate-50 data-[selected=true]:text-slate-900"
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {selectedGateway ? (
                <>
                  Viewing filesystem-backed memory for{" "}
                  <span className="font-semibold text-slate-900">
                    {selectedGateway.name}
                  </span>
                  .
                </>
              ) : gatewaysQuery.isLoading ? (
                "Loading gateways…"
              ) : (
                "Create a gateway before inspecting workspace memory."
              )}
            </div>
          </div>
          {gatewaysQuery.error ? (
            <p className="mt-4 text-sm text-red-500">
              {gatewaysQuery.error.message}
            </p>
          ) : null}
        </section>

        {effectiveSelectedGatewayId ? (
          <GatewayFilesystemMemoryView
            active
            gatewayId={effectiveSelectedGatewayId}
          />
        ) : null}
      </div>
    </DashboardPageLayout>
  );
}
