import type { BrandChannelListSchemaType } from "@bonlift-ai/contracts";
import { apiRequest } from "@/lib/api-client";
import type { BrandChannel, UpdateBrandChannelInput } from "./type";

function channelsPath(brandId: string) {
  return `/brands/${encodeURIComponent(brandId)}/channels`;
}

// Every shared channel, each with this brand's on/off state.
export async function listBrandChannels(brandId: string, signal: AbortSignal) {
  const { channels } = await apiRequest<BrandChannelListSchemaType>(
    channelsPath(brandId),
    { signal },
  );
  return channels;
}

export async function updateBrandChannel(
  brandId: string,
  channelId: string,
  input: UpdateBrandChannelInput,
) {
  return apiRequest<BrandChannel>(
    `${channelsPath(brandId)}/${encodeURIComponent(channelId)}`,
    { method: "PUT", body: input },
  );
}
