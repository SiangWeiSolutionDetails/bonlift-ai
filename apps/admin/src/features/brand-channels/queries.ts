import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { brandKeys } from "../brands/queries";
import { listBrandChannels, updateBrandChannel } from "./api";
import type { UpdateBrandChannelInput } from "./type";

export const brandChannelKeys = {
  list: (brandId: string) => [...brandKeys.detail(brandId), "channels"] as const,
};

// Shared by the Channels tab and the API key dialog's channel picker.
export function useBrandChannels(brandId: string) {
  return useQuery({
    queryKey: brandChannelKeys.list(brandId),
    queryFn: ({ signal }) => listBrandChannels(brandId, signal),
  });
}

export function useUpdateBrandChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      brandId,
      channelId,
      input,
    }: {
      brandId: string;
      channelId: string;
      input: UpdateBrandChannelInput;
    }) => updateBrandChannel(brandId, channelId, input),
    onSuccess: (channel) =>
      queryClient.invalidateQueries({ queryKey: brandChannelKeys.list(channel.brandId) }),
  });
}
