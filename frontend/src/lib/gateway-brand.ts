import { customFetch } from "@/api/mutator";

export type GatewayBrand = {
  gateway_id?: string | null;
  gateway_name?: string | null;
  identity_name?: string | null;
};

export const fetchGatewayBrand = async (): Promise<GatewayBrand> => {
  const response = await customFetch<{ data: GatewayBrand }>("/api/v1/gateways/brand", {
    method: "GET",
  });
  return response.data;
};
