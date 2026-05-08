import { NetworkName, isDefined } from "@railgun-community/shared-models";
import { formatUnits } from "ethers";
import {
  getProviderForURL,
  getProviderURLsForChain,
} from "../network/network-util";
import { promiseTimeout } from "../util/util";
import { FeeHistoryResponse } from "../models/gas-models";
import { CustomGasEstimate, GasSpeed } from "../models/gas-models";
import { FeeHistoryBlock } from "../models/gas-models";

const avg = (arr: bigint[]): bigint => {
  const sum = arr.reduce((a, v) => a + v);
  const avgsum = BigInt(Math.round(Number(sum) / arr.length));
  return avgsum;
};

export const formatFeeHistory = (
  result: any,
  includePending: boolean,
  historicalBlocks: number,
): FeeHistoryBlock[] => {
  let blockNum = result.oldestBlock;
  let index = 0;
  const blocks: FeeHistoryBlock[] = [];

  while (
    blockNum < result.oldestBlock + BigInt(result.reward.length) &&
    isDefined(result.reward[index])
  ) {
    const newPriorityFeePerGas = result.reward[index].map((x: string) =>
      BigInt(x),
    );
    blocks.push({
      blockNumber: blockNum,
      baseFeePerGas: result.baseFeePerGas[index],
      gasUsedRatio: result.gasUsedRatio[index],
      priorityFeePerGas: newPriorityFeePerGas,
    });
    blockNum += 1n;
    index += 1;
  }

  if (includePending) {
    blocks.push({
      blockNumber: "pending",
      baseFeePerGas: BigInt(result.baseFeePerGas[historicalBlocks]),
      gasUsedRatio: NaN,
      priorityFeePerGas: [],
    });
  }

  return blocks;
};

export const getGasEstimates = async (
  chainName: NetworkName,
): Promise<CustomGasEstimate> => {
  const historicalBlocks = 40;
  const currentBlockNumber = "latest";
  const rewardPercentiles = [20, 40, 60, 80, 95];
  const providerURLs = getProviderURLsForChain(chainName);
  const providerErrors: string[] = [];

  for (const providerURL of providerURLs) {
    const provider = getProviderForURL(providerURL);

    try {
      const gasPriceHex = await promiseTimeout(
        provider.send("eth_gasPrice", []),
        10 * 1000,
      );
      const gasPrice = BigInt(gasPriceHex);

      const feeHistoryPromise = await promiseTimeout(
        provider.send("eth_feeHistory", [
          historicalBlocks,
          currentBlockNumber,
          rewardPercentiles,
        ]),
        10 * 1000,
      );

      if (!isDefined(feeHistoryPromise)) {
        throw new Error("Unable to get gas fee history.");
      }

      const feeHistory = feeHistoryPromise as FeeHistoryResponse;

      const baseFeePerGas = BigInt(
        feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1],
      ) as bigint;

      feeHistory.oldestBlock = BigInt(feeHistory.oldestBlock);

      const blocks: FeeHistoryBlock[] = formatFeeHistory(
        feeHistory,
        false,
        historicalBlocks,
      );
      const slowest = avg(blocks.map((b) => b.priorityFeePerGas[0] as bigint));
      const slower = avg(blocks.map((b) => b.priorityFeePerGas[1] as bigint));
      const slow = avg(blocks.map((b) => b.priorityFeePerGas[2] as bigint));
      const average = avg(blocks.map((b) => b.priorityFeePerGas[3] as bigint));
      const fast = avg(blocks.map((b) => b.priorityFeePerGas[4] as bigint));

      const maxPriorityFeePerGas = average;
      const maxFeePerGas = maxPriorityFeePerGas + baseFeePerGas;

      return {
        gasPrice,
        maxFeePerGas,
        maxPriorityFeePerGas,
        baseFeePerGas,
        slowest,
        slower,
        slow,
        average,
        fast,
      };
    } catch (err) {
      providerErrors.push(`[${providerURL}] ${(err as Error).message}`);
    }
  }

  throw new Error(
    `Unable to get gas estimates for ${chainName}. ${providerErrors.join(" | ")}`,
  );
};

export const getGasEstimateMatrix = (gasEstimate: CustomGasEstimate) => {
  const {
    gasPrice: _gasPrice,
    maxFeePerGas: _maxFeePerGas,
    maxPriorityFeePerGas: _maxPriorityFeePerGas,
    baseFeePerGas,
    slowest,
    slower,
    slow,
    average,
    fast,
  } = gasEstimate;

  const gasPrice = formatUnits(_gasPrice, "gwei");
  const maxFeePerGas = formatUnits(_maxFeePerGas, "gwei");
  const maxPriorityFeePerGas = formatUnits(_maxPriorityFeePerGas, "gwei");

  const matrix = {
    recommended: {
      gasPrice,
      maxFeePerGas,
      maxPriorityFeePerGas,
    },
    slowest: {
      gasPrice,
      maxFeePerGas: formatUnits(slowest + baseFeePerGas, "gwei"),
      maxPriorityFeePerGas: formatUnits(slowest, "gwei"),
    },
    slower: {
      gasPrice,
      maxFeePerGas: formatUnits(slower + baseFeePerGas, "gwei"),
      maxPriorityFeePerGas: formatUnits(slower, "gwei"),
    },
    slow: {
      gasPrice,
      maxFeePerGas: formatUnits(slow + baseFeePerGas, "gwei"),
      maxPriorityFeePerGas: formatUnits(slow, "gwei"),
    },
    average: {
      gasPrice,
      maxFeePerGas: formatUnits(average + baseFeePerGas, "gwei"),
      maxPriorityFeePerGas: formatUnits(average, "gwei"),
    },
    fast: {
      gasPrice,
      maxFeePerGas: formatUnits(fast + baseFeePerGas, "gwei"),
      maxPriorityFeePerGas: formatUnits(fast, "gwei"),
    },
  };
  return matrix;
};

export const getGasValuesForSpeed = (
  estimate: CustomGasEstimate,
  speed: GasSpeed,
): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } => {
  const { gasPrice, baseFeePerGas, slowest, slower, slow, average, fast } =
    estimate;

  switch (speed) {
    case "network":
      return {
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice > baseFeePerGas ? gasPrice - baseFeePerGas : 0n,
      };
    case "slowest":
      return {
        maxFeePerGas: slowest + baseFeePerGas,
        maxPriorityFeePerGas: slowest,
      };
    case "slower":
      return {
        maxFeePerGas: slower + baseFeePerGas,
        maxPriorityFeePerGas: slower,
      };
    case "slow":
      return {
        maxFeePerGas: slow + baseFeePerGas,
        maxPriorityFeePerGas: slow,
      };
    case "fast":
      return {
        maxFeePerGas: fast + baseFeePerGas,
        maxPriorityFeePerGas: fast,
      };
    case "average":
    default:
      return {
        maxFeePerGas: average + baseFeePerGas,
        maxPriorityFeePerGas: average,
      };
  }
};
