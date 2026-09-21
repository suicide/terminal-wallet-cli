import { baseBlockList, isWakuLoaded, wakuClient } from "./connect-waku";

/**
 * Undefined, not `[]`, until a mutation gives it content.
 *
 * The SDK's rule is `!blocklist || !blocklist.includes(address)`. An empty
 * ARRAY is truthy, so `[]` is not "no restriction" there either — it is a
 * harmless no-op here, but `undefined` is what the allow list uses to mean
 * "admit everyone", so both lists stay undefined until populated.
 */
let currentBlockList: Optional<string[]> = undefined;

/** A mutable copy, so pushing to the filter never edits the base list in place. */
const startFrom = (base: Optional<string[]>): string[] => [...(base ?? [])];

export const addRemovedBroadcaster = (broadcasterAddress: string) => {
  if (!isWakuLoaded()) {
    throw new Error("Waku Client is not Loaded");
  }
  if (!wakuClient) {
    return;
  }
  if (!currentBlockList) {
    currentBlockList = startFrom(baseBlockList);
  }
  currentBlockList.push(broadcasterAddress);
  // The allow list is passed as `undefined` on purpose: admission is decided by
  // the SDK's trusted-fee-signer variance band, not by an address allow list.
  // Blocking may only ever subtract from that set.
  wakuClient.setAddressFilters(undefined, currentBlockList);
};

export const resetBroadcasterFilters = () => {
  if (!isWakuLoaded()) {
    throw new Error("Waku Client is not Loaded");
  }
  if (!wakuClient) {
    return;
  }
  currentBlockList = baseBlockList ? startFrom(baseBlockList) : undefined;
  wakuClient.setAddressFilters(undefined, currentBlockList);
};
