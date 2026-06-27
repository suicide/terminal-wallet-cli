import {
  MerkletreeScanUpdateEvent,
  POIProofEventStatus,
  POIProofProgressEvent,
  RailgunBalancesEvent,
  delay,
  isDefined,
} from "@railgun-community/shared-models";
import { type BatchListUpdateEvent} from "@railgun-community/wallet"
import {
  updatePrivateBalancesForChain,
  updatePublicBalancesForChain,
} from "../balance/balance-cache";
import { ChainIDToNameMap } from "../models/network-models";
import { getCurrentNetwork, rescanBalances } from "../engine/engine";
import { walletManager } from "./wallet-manager";
import { setStatusText } from "../ui/status-ui";

export const merkelTreeScanCallback = async (
  callbackInfo: MerkletreeScanUpdateEvent,
) => {
  walletManager.balanceScanProgress = callbackInfo.progress * 100;
  walletManager.lastScanProgressTimestamp = Date.now();

  if (callbackInfo.scanStatus === "Complete") {
    walletManager.merkelScanComplete = true;
    walletManager.lastScanError = undefined;
  }
  if (callbackInfo.scanStatus === "Incomplete") {
    await rescanBalances(getCurrentNetwork());
  }
};

export const formatLatestBalancesEvent = async () => {
  const currentPrivateBalances = walletManager.latestPrivateBalanceEvents;
  if (!isDefined(currentPrivateBalances)) {
    walletManager.latestPrivateBalanceEvents = [];
    return;
  }

  // sort into each balance bucket, only take the latest one.
  const buckets: MapType<RailgunBalancesEvent> = {};
  for (const balanceEvent of currentPrivateBalances) {
    buckets[balanceEvent.balanceBucket] = balanceEvent;
  }

  for (const bucketType in buckets) {
    if (walletManager.merkelScanComplete) {
      const balanceEvent = buckets[bucketType];
      const { chain } = balanceEvent;
      const chainName = ChainIDToNameMap[chain.id];
      await updatePrivateBalancesForChain(chainName, balanceEvent);
      await updatePublicBalancesForChain(chainName);
      if (!walletManager.menuLoaded) {
        walletManager.menuLoaded = true;
      }
    }
  }

  delete walletManager.latestPrivateBalanceEvents;
  walletManager.latestPrivateBalanceEvents = [];
};

export const scanBalancesCallback = async (
  tokenBalances: RailgunBalancesEvent,
) => {
  walletManager.latestPrivateBalanceEvents?.push(tokenBalances);
};

export const latestBalancePoller = async (pollingInterval: number) => {
  await formatLatestBalancesEvent().catch((err) => {
    const msg = (err as Error).message ?? String(err);
    walletManager.lastScanError = `Balance update failed: ${msg}`;
    setStatusText(msg);
  });
  await delay(pollingInterval);
  latestBalancePoller(pollingInterval).catch((err) => {
    const msg = `Balance poller crashed: ${(err as Error).message ?? err}`;
    walletManager.lastScanError = msg;
    console.error(msg);
  });
};

export const getPOIStatusString = () => {
  const event = walletManager.poiProgressEvent;
  if (!isDefined(event)) {
    return "POI Status: Initializing...";
  }
  const progress =
    typeof event.progress === "number" ? event.progress.toFixed(2) : "0.00";
  const status = `POI Status: ${event.status ?? "Unknown"} | TX: ${event.index ?? "?"}/${event.totalCount ?? "?"
    } | Progress: ${progress}\nTxID: ${event.txid ?? ""
    }\nPOI List ID: ${event.listKey ?? ""}`;

  return status;
};

export const poiScanCallback = async (poiProgressEvent: POIProofProgressEvent) => {
  walletManager.poiProgressEvent = poiProgressEvent;

  if (poiProgressEvent.status === POIProofEventStatus.InProgress) {
    const poiStatus = getPOIStatusString();
    setStatusText(poiStatus, 15000, true);
  }
  if (poiProgressEvent.status === POIProofEventStatus.Error) {
    const msg = `POI proof failed for txid ${poiProgressEvent.txid}: ${poiProgressEvent.errMessage ?? "unknown error"}`;
    walletManager.lastScanError = msg;
    setStatusText(msg, 30000, true);
  }
};

export const batchListCallback = async (batchListProgressEvent: BatchListUpdateEvent) =>{
  const status = `${batchListProgressEvent.status}`
  if(status.includes('100%')){
    setStatusText(status, 15000, false);
  } else {
    setStatusText(status, 15000, false);

  }
}
