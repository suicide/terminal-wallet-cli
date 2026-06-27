import { ProgressBar } from "../ui/progressBar-ui";
import { KeychainFile, WalletCache } from "../models/wallet-models";
import { Wallet } from "ethers";
import { RailgunReadableAmount } from "../models/balance-models";
import {
  POIProofProgressEvent,
  RailgunBalancesEvent,
} from "@railgun-community/shared-models";
import Web3 from "web3";

export type WalletManager = {
  poiProgressEvent: POIProofProgressEvent;
  progressBar: ProgressBar;
  web3: Web3;
  balanceScanProgress: number;
  merkelScanComplete: boolean;
  railgunWalletAddress: string;
  railgunWalletID: string;
  latestPrivateBalanceEvents: Optional<RailgunBalancesEvent[]>;
  // privateBalanceCache: RailgunReadableAmount[];
  keyChain: KeychainFile;
  activeWalletName: string;
  currentActiveWallet: WalletCache;
  currentEthersWallet: Wallet;
  comparisonRefHash: Optional<string | undefined>;
  menuLoaded: boolean;
  saltedPassword: string;
  hashedPassword: Optional<string | undefined>;
  menuCallback: () => Promise<void>;
  displayPrivate: boolean;
  responsiveMenu: boolean;
  showSenderAddress: boolean;
  lastScanError: Optional<string>;
  lastScanProgressTimestamp: Optional<number>;
};
export const walletManager: WalletManager = {
  merkelScanComplete: false,
  menuLoaded: false,
  displayPrivate: true,
  responsiveMenu: true,
  showSenderAddress: true,
  lastScanError: undefined,
  lastScanProgressTimestamp: undefined,
  poiProgressEvent: undefined as any,
  balanceScanProgress: 0,
  latestPrivateBalanceEvents: [],
} as any;

export const getScanProgressString = () => {
  const parts: string[] = [];
  if (
    walletManager.balanceScanProgress > 0 &&
    walletManager.balanceScanProgress !== 100
  ) {
    parts.push(`Balance Scan Progress  |  [${walletManager.balanceScanProgress.toFixed(2)}%]\n`);
  }
  if (walletManager.lastScanError) {
    parts.push(`\x1b[31m${walletManager.lastScanError}\x1b[0m\n`);
  }
  if (
    walletManager.lastScanProgressTimestamp &&
    Date.now() - walletManager.lastScanProgressTimestamp > 60_000 &&
    !walletManager.merkelScanComplete
  ) {
    parts.push("\x1b[33mScan may be stuck. Try restarting or switching networks.\x1b[0m\n");
  }
  return parts.join("");
};
