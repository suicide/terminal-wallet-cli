import {
  Chain,
  isDefined,
  NetworkName,
} from "@railgun-community/shared-models";
import { getChainForName, remoteConfig } from "../network/network-util";
import { createLogger } from "../../platform/logger";
import {
  WakuBroadcasterClient,
  WakuBroadcasterTransaction,
  BroadcasterOptions,
} from "../../models/waku-models";

const log = createLogger("waku");

let wakuBroadcasterTransaction: WakuBroadcasterTransaction;
let wakuLoaded = false;
let isConnected = false;
export let baseBlockList: string[] | undefined = undefined;
export let wakuClient: WakuBroadcasterClient;

const DEFAULT_TRUSTED_FEE_SIGNER =
  "0zk1qyzgh9ctuxm6d06gmax39xutjgrawdsljtv80lqnjtqp3exxayuf0rv7j6fe3z53laetcl9u3cma0q9k4npgy8c8ga4h6mx83v09m8ewctsekw4a079dcl5sw4k";
const broadcasterOptions: BroadcasterOptions = {
  trustedFeeSigner: DEFAULT_TRUSTED_FEE_SIGNER,
};

/**
 * Normalize a config value that is declared `string | string[]`.
 *
 * Used for the blocklist, and for counting the configured trusted fee signers
 * in the boot log. On an array `includes` is a membership test; on a string it
 * is a SUBSTRING test, which is a different question with a coincidentally
 * similar answer.
 */
const asList = (value: string | string[] | undefined): string[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

/**
 * The broadcaster address filter.
 *
 * The allow list is deliberately left undefined, which the SDK reads as "no
 * address restriction": `!allowlist || allowlist.includes(address)`.
 * Broadcaster admission is decided by the SDK's own trusted-fee-signer
 * mechanism instead — `broadcasterOptions.trustedFeeSigner` sets the
 * authorized fee each trusted signer publishes, and any other broadcaster is
 * admitted only while its quote stays within the SDK's variance band of that
 * authorized fee. That is the "in range of the trusted fee signer" set the app
 * wants to show.
 *
 * The app previously set the allow list to the trusted signer addresses
 * themselves. Because `AddressFilter.filter` runs over the fee-cache keys
 * (`feeMessageData.railgunAddress`), that left only the signers reachable and
 * made the SDK variance band unreachable — every in-range broadcaster from a
 * different signer was hidden.
 *
 * The blocklist remains local and user-controlled. Passing an empty ARRAY for
 * the allow list would admit nobody (`[]` is truthy and `[].includes` is
 * always false), so `undefined` is the only value that means "no restriction".
 */
export const initializeLists = (blockList: string[]) => {
  baseBlockList = blockList.length > 0 ? blockList : undefined;
  wakuClient.setAddressFilters(undefined, baseBlockList);
};

const wakuStatusCallback = (chain: Chain, status: string) => {
  if (status === "Connected") {
    isConnected = true;
  } else {
    isConnected = false;
  }
};

export const isWakuLoaded = () => {
  return wakuLoaded;
};

export const isWakuConnected = () => {
  return isConnected;
};

export const getWakuClient = () => {
  if (!isWakuLoaded()) {
    throw new Error("Waku Client is not Loaded.");
  }
  return wakuClient;
};

export const getWakuTransaction = () => {
  if (!isWakuLoaded()) {
    throw new Error("Waku Client is not Loaded.");
  }
  return wakuBroadcasterTransaction;
};

export const initWakuClient = async () => {
  if (isWakuLoaded()) {
    return;
  }
  const waku = await import("@railgun-community/waku-broadcaster-client-node");
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  wakuClient = waku.WakuBroadcasterClient; // as WakuBroadcasterClient;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  wakuBroadcasterTransaction = waku.BroadcasterTransaction; // as WakuBroadcasterTransaction;
  wakuLoaded = true;
  const configuredSigners = asList(remoteConfig.trustedFeeSigner);
  const blocked = asList(remoteConfig.blacklist);
  // The signer count decides how many authorized fee baselines exist, and it
  // arrives from an on-chain artifact that is edited by hand. A publish that
  // dropped four of five, or shipped a bare string where a list was meant, is
  // otherwise silent until it surfaces much later as "no broadcasters available
  // for your tokens". Only the SDK's variance band uses these; the address
  // allow list stays open so in-range broadcasters from other signers show up.
  const configured = isDefined(remoteConfig.trustedFeeSigner);
  log.info(
    `broadcaster trust: ${configuredSigners.length || 1} trusted fee signer(s)` +
      `${configured ? "" : " (remote config carried none — using the built-in)"}` +
      `, ${blocked.length} blocked`,
  );
  initializeLists(blocked);
};

export const switchWakuNetwork = async (chainName: NetworkName) => {
  const chain = getChainForName(chainName);
  await wakuClient.setChain(chain);
};

export const startWakuClient = async (chainName: NetworkName) => {
  if (!isWakuLoaded()) {
    throw new Error("Waku Client is not Loaded");
  }
  if (!wakuClient) {
    throw new Error("No Waku Client?...");
  }
  const chain = getChainForName(chainName);
  const peerOverrides = remoteConfig.additionalDirectPeers ?? [];
  broadcasterOptions.additionalDirectPeers = peerOverrides;
  broadcasterOptions.pubSubTopic = "/waku/2/rs/5/1"; //remoteConfig.wakuPubSubTopic;
  if (isDefined(remoteConfig.trustedFeeSigner)) {
    broadcasterOptions.trustedFeeSigner = remoteConfig.trustedFeeSigner;
  }
  wakuClient.start(chain, broadcasterOptions, wakuStatusCallback, undefined);
};

export const stopWakuClient = async () => {
  if (!wakuClient) {
    return;
  }
  await wakuClient?.stop();
};

export const resetWakuClient = async () => {
  await wakuClient.tryReconnect();
};
