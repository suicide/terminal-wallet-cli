import {
  NetworkName,
  RailgunERC20AmountRecipient,
  TXIDVersion,
  TransactionGasDetails,
} from "@railgun-community/shared-models";
import {
  gasEstimateForShield,
  populateShield,
} from "@railgun-community/wallet";
import { formatUnits } from "ethers";
import {
  calculateEstimatedGasCost,
  getPublicGasDetails,
} from "../../gas/gas-util";
import { getCurrentShieldPrivateKey } from "../../wallet/public-utils";
import { PrivateGasEstimate } from "../../models/transaction-models";
import { getWrappedTokenInfoForChain } from "../../network/network-util";
import { GasSpeed } from "../../models/gas-models";

export const getShieldERC20TransactionGasDetails = async (
  chainName: NetworkName,
  erc20AmountRecipients: RailgunERC20AmountRecipient[],
  gasSpeed: GasSpeed = "average",
): Promise<PrivateGasEstimate> => {
  const { shieldPrivateKey, fromWalletAddress } =
    await getCurrentShieldPrivateKey();
  const wrappedInfo = getWrappedTokenInfoForChain(chainName);
  const txIDVersion = TXIDVersion.V2_PoseidonMerkle;

  const { gasEstimate } = await gasEstimateForShield(
    txIDVersion,
    chainName,
    shieldPrivateKey,
    erc20AmountRecipients,
    [], // nftAmountRecipients
    fromWalletAddress,
  );

  const gasDetails = (await getPublicGasDetails(
    chainName,
    gasEstimate,
    true,
    gasSpeed,
  )) as TransactionGasDetails;
  const _estimatedCost = calculateEstimatedGasCost(gasDetails);

  const formattedCost = parseFloat(
    formatUnits(_estimatedCost, wrappedInfo.decimals),
  );

  return {
    symbol: wrappedInfo.symbol,
    overallBatchMinGasPrice: 0n,
    estimatedGasDetails: gasDetails,
    estimatedCost: formattedCost,
    broadcasterFeeERC20Recipient: undefined,
    gasSpeed,
  };
};

export const getProvedShieldERC20Transaction = async (
  chainName: NetworkName,
  erc20AmountRecipients: RailgunERC20AmountRecipient[],
  privateGasEstimate: PrivateGasEstimate,
) => {
  const { shieldPrivateKey, fromWalletAddress } =
    await getCurrentShieldPrivateKey();
  const txIDVersion = TXIDVersion.V2_PoseidonMerkle;

  const { transaction } = await populateShield(
    txIDVersion,
    chainName,
    shieldPrivateKey,
    erc20AmountRecipients,
    [], // nftAmountRecipients
    privateGasEstimate.estimatedGasDetails,
  );

  // Public wallet to shield from.
  transaction.from = fromWalletAddress;
  return transaction;
};
