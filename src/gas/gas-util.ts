import {
  EVMGasType,
  NETWORK_CONFIG,
  NetworkName,
  TransactionGasDetails,
  TransactionGasDetailsType1,
  TransactionGasDetailsType2,
  isDefined,
} from "@railgun-community/shared-models";
import { ContractTransaction, FeeData } from "ethers";
import { promiseTimeout, throwError } from "../util/util";
import {
  getGasEstimateMatrix,
  getGasEstimates,
  getGasFeeSelection,
  getGasValuesForSpeed,
} from "./gas-fee";
import {
  getProviderForChain,
  getProviderForURL,
  getProviderURLsForChain,
} from "../network/network-util";
import { CustomGasEstimate, GasSpeed } from "../models/gas-models";

const isUsableFeeData = (feeData: FeeData | undefined): feeData is FeeData => {
  if (!isDefined(feeData)) {
    return false;
  }

  return (
    isDefined(feeData.gasPrice) ||
    isDefined(feeData.maxFeePerGas) ||
    isDefined(feeData.maxPriorityFeePerGas)
  );
};

const getFallbackFeeDataForChain = async (
  chainName: NetworkName,
): Promise<FeeData> => {
  const providerURLs = getProviderURLsForChain(chainName);
  const providerErrors: string[] = [];

  for (const providerURL of providerURLs) {
    const provider = getProviderForURL(providerURL);

    try {
      const feeData = await promiseTimeout(provider.getFeeData(), 10 * 1000);
      if (isUsableFeeData(feeData)) {
        return feeData;
      }
      providerErrors.push(`[${providerURL}] Missing fee data fields`);
    } catch (err) {
      providerErrors.push(`[${providerURL}] ${(err as Error).message}`);
    }
  }

  const provider = getProviderForChain(chainName);
  try {
    const feeData = await promiseTimeout(provider.getFeeData(), 10 * 1000);
    if (isUsableFeeData(feeData)) {
      return feeData;
    }
    providerErrors.push(`[fallback-provider] Missing fee data fields`);
  } catch (err) {
    providerErrors.push(`[fallback-provider] ${(err as Error).message}`);
  }

  throw new Error(
    `Unable to get Gas Fee Data for ${chainName}. ${providerErrors.join(" | ")}`,
  );
};

export const calculatePublicGasFee = async (
  transaction: ContractTransaction,
) => {
  const { gasPrice, maxFeePerGas, gasLimit } = transaction;

  if (typeof gasLimit !== "undefined") {
    if (typeof gasPrice !== "undefined") {
      return gasPrice * gasLimit;
    }
    if (typeof maxFeePerGas !== "undefined") {
      return maxFeePerGas * gasLimit;
    }
  }
  throw new Error("No Gas present Details in Transaction");
};

export const calculateEstimatedGasCost = (
  estimatedDetails: TransactionGasDetails,
) => {
  const { gasEstimate } = estimatedDetails;

  if (typeof estimatedDetails.gasEstimate !== "undefined") {
    if (
      typeof (estimatedDetails as TransactionGasDetailsType1).gasPrice !==
      "undefined"
    ) {
      return (
        (estimatedDetails as TransactionGasDetailsType1).gasPrice * gasEstimate
      );
    }
    if (
      typeof (estimatedDetails as TransactionGasDetailsType2).maxFeePerGas !==
      "undefined"
    ) {
      return (
        (estimatedDetails as TransactionGasDetailsType2).maxFeePerGas *
        gasEstimate
      );
    }
  }
  throw new Error("No Gas present Details in Transaction");
};

export const getPublicGasEstimate = async (
  chainName: NetworkName,
  transaction: ContractTransaction,
) => {
  try {
    const provider = getProviderForChain(chainName);
    const gasEstimate = await provider
      .estimateGas(transaction)
      .catch(throwError);
    return gasEstimate;
  } catch (error) {
    console.log(error);
    throw new Error("Gas Estimation Error");
  }
};

export const getFeeDetailsForChain = async (
  chainName: NetworkName,
  gasSpeed: GasSpeed = "average",
  customGasEstimate?: CustomGasEstimate,
): Promise<FeeData | undefined> => {
  // A gas fee selected during transaction build overrides the auto-fetched fee data for
  // this chain — applies to every flow, since all gas details funnel through here.
  const selectedFee = getGasFeeSelection(chainName);
  if (isDefined(selectedFee)) {
    return selectedFee;
  }
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (chainName) {
    case NetworkName.Ethereum:
    case NetworkName.Polygon: {
      try {
        const currentGasEstimate = customGasEstimate ?? await getGasEstimates(chainName);
        const { gasPrice } = currentGasEstimate;

        const { maxFeePerGas, maxPriorityFeePerGas } = getGasValuesForSpeed(
          currentGasEstimate,
          gasSpeed,
        );

        return {
          gasPrice,
          maxFeePerGas,
          maxPriorityFeePerGas,
        } as FeeData;
      } catch (err) {
        console.log(
          `Custom gas estimate failed for ${chainName}: ${(err as Error).message}`,
        );
      }
    }
  }
  const feeData = await getFallbackFeeDataForChain(chainName);
  if (isUsableFeeData(feeData)) {
    return feeData;
  }
  throw new Error(`Unable to get Gas Fee Data for ${chainName}`);
};

export const getPublicGasDetails = async (
  chainName: NetworkName,
  gasEstimate: bigint,
  isShield = false,
  gasSpeed: GasSpeed = "average",
) => {
  const feeData = await getFeeDetailsForChain(chainName, gasSpeed);
  if (!isDefined(feeData)) {
    throw new Error("getPublicGasDetails: missing feeData");
  }
  const { gasPrice, maxFeePerGas, maxPriorityFeePerGas } = feeData;
  let gasDetailsInfo: {
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  } = { gasPrice: gasPrice ?? 0n };

  const { defaultEVMGasType } = NETWORK_CONFIG[chainName];

  // SELECTED DEFAULT because these are transacted through a personal wallet.
  switch (defaultEVMGasType) {
    case EVMGasType.Type0:
    case EVMGasType.Type1: {
      gasDetailsInfo.gasPrice = gasPrice ?? 0n;
      break;
    }
    case EVMGasType.Type2: {
      gasDetailsInfo = {
        maxFeePerGas: maxFeePerGas ?? gasPrice ?? 0n,
        maxPriorityFeePerGas: maxPriorityFeePerGas ?? 0n,
      };
      break;
    }
  }

  if (isShield) {
    const gasDetails = {
      evmGasType: defaultEVMGasType,
      gasEstimate,
      ...gasDetailsInfo,
    } as TransactionGasDetails;

    return gasDetails;
  }
  const gasDetails = {
    gasLimit: gasEstimate,
    ...gasDetailsInfo,
  };
  return gasDetails;
};
