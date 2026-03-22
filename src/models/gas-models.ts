export type GasSpeed =
  | 'network'
  | 'slowest'
  | 'slower'
  | 'slow'
  | 'average'
  | 'fast';

export type FeeHistoryResponse = {
    oldestBlock: bigint;
    reward: [string[]];
    baseFeePerGas: bigint[];
    gasUsedRatio: bigint[];
  };
export type CustomGasEstimate = {
  gasPrice: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  baseFeePerGas: bigint;
  slowest: bigint;
  slower: bigint;
  slow: bigint;
  average: bigint;
  fast: bigint;
};
export type FeeHistoryBlock = {
  blockNumber: number | string;
  baseFeePerGas: bigint;
  gasUsedRatio: number;
  priorityFeePerGas: bigint[];
};
  
