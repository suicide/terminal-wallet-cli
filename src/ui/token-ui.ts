import {
  NetworkName,
  RailgunERC20AmountRecipient,
  SelectedBroadcaster,
  isDefined,
} from "@railgun-community/shared-models";
import { delay } from "../util/util";
import { formatUnits, parseUnits } from "ethers";
import { getWakuClient } from "../waku/connect-waku";
import {
  getDisplayStringFromBalance,
  getMaxBalanceLength,
  getMaxSymbolLengthFromBalances,
  getPrivateERC20BalancesForChain,
  getPublicERC20BalancesForChain,
} from "../balance/balance-util";
import {
  RailgunDisplayBalance,
  RailgunReadableAmount,
  RailgunSelectedAmount,
} from "../models/balance-models";
import {
  getChainForName,
  getWrappedTokenInfoForChain,
} from "../network/network-util";
import { getTokenInfo } from "../balance/token-util";
import { resetBroadcasterFilters } from "../waku/broadcaster-util";

const { Select, Input, NumberPrompt } = require("enquirer");
import {
  confirmPromptCatch,
  confirmPrompt,
  confirmPromptCatchRetry,
  confirmPromptCatchMessage,
} from "./confirm-ui";
import { validateEthAddress } from "@railgun-community/wallet";
import { updatePublicBalancesForChain } from "../balance/balance-cache";
import {
  runInputPublicAddress,
  runInputRailgunAddress,
} from "./known-address-ui";
import { getFormattedAddress } from "./address-ui";

export const tokenSelectionPrompt = async (
  chainName: NetworkName,
  display: string = "Token Selection",
  multiple: boolean = true,
  publicBalances: boolean = false,
  amountRecipients?: RailgunERC20AmountRecipient[],
  addGasToken: boolean = false,
  // When provided, only these token addresses are offered (eg. fee tokens that a
  // 7702-capable broadcaster actually accepts).
  allowedTokenAddresses?: string[],
) => {
  const fetchedBalances = publicBalances
    ? await getPublicERC20BalancesForChain(
        chainName,
        publicBalances && addGasToken,
      )
    : await getPrivateERC20BalancesForChain(chainName);

  const balances = isDefined(allowedTokenAddresses)
    ? fetchedBalances.filter((bal: RailgunDisplayBalance) =>
        allowedTokenAddresses.some(
          (address) => address.toLowerCase() === bal.tokenAddress.toLowerCase(),
        ),
      )
    : fetchedBalances;

  if (balances.length === 0) {
    await confirmPromptCatchRetry(
      "There are no spendable balances at this time. ".red,
    );
    return multiple ? [] : undefined;
  }

  const maxSymbolLength = getMaxSymbolLengthFromBalances(balances);
  const maxBalanceLength = getMaxBalanceLength(balances);
  const names = balances.map((bal: RailgunDisplayBalance, i) => {
    let spentBalance = 0n;
    amountRecipients?.forEach((tokenInfo) => {
      if (
        tokenInfo.tokenAddress.toLowerCase() === bal.tokenAddress.toLowerCase()
      ) {
        spentBalance += tokenInfo.amount;
      }
    });

    const newAmount = bal.amount - spentBalance;
    bal.amount = newAmount;
    const balanceDisplayString = getDisplayStringFromBalance(
      bal,
      maxBalanceLength,
      maxSymbolLength,
    );
    return {
      value: `${i}`,
      disabled: newAmount <= 0n,
      message: balanceDisplayString,
    };
  });

  if (names.length === 0) {
    console.log("There are no tokens available to use for fees. ");
    return undefined;
  }

  const valid = names.find((n) => !n.disabled);
  if (!valid) {
    console.log("No spendable tokens available for fees.".red);
    return undefined;
  }

  const prompt = new Select({
    format() {
      if (!this.state.submitted || this.state.cancelled) return "";
      if (Array.isArray(this.selected)) {
        return this.selected
          .map((choice: any) =>
            this.styles.primary(choice.message.split("]")[1].trim()),
          )
          .join(", ");
      }
      return this.styles.primary(this.selected.message.split("]")[1].trim());
    },
    emptyError: "No ERC20s Selected",
    header: " ",
    hint: multiple
      ? "(Use <space> to select, <return> to submit)"
      : "(Use <return> to select)",
    message: display,
    choices: names,
    multiple,
  });

  const result = await prompt.run().catch(confirmPromptCatch);

  if (result) {
    if (multiple) {
      const selections = result?.map((i: number) => {
        return balances[i];
      });
      return selections;
    }
    return balances[parseInt(result)];
  }
  return multiple ? [] : undefined;
};

export const feeTokenSelectionPrompt = async (
  chainName: NetworkName,
  publicBalances: boolean = false,
  amountRecipients: RailgunERC20AmountRecipient[],
  // 7702 (relay-adapt) flows: only offer fee tokens that a 7702-capable broadcaster
  // accepts, so the user is never presented a token that has no eligible broadcaster.
  use7702: boolean = false,
) => {
  let allowedTokenAddresses: string[] | undefined;
  if (use7702) {
    const waku = getWakuClient();
    const chain = getChainForName(chainName);
    const broadcasters = waku.findAllBroadcastersForChain(chain, true, true);
    allowedTokenAddresses = [
      ...new Set((broadcasters ?? []).map((b) => b.tokenAddress.toLowerCase())),
    ];
  }

  const selection = await tokenSelectionPrompt(
    chainName,
    "Fee Token Selection",
    false,
    publicBalances,
    amountRecipients,
    false,
    allowedTokenAddresses,
  );

  return selection;
};

const compareBroadcasterFees = (
  a: { feePerUnitGas: string },
  b: { feePerUnitGas: string },
) => {
  const feeA = BigInt(a.feePerUnitGas);
  const feeB = BigInt(b.feePerUnitGas);
  if (feeA < feeB) return -1;
  if (feeA > feeB) return 1;
  return 0;
};

const runBroadcasterSelectionPrompt = async (
  chainName: NetworkName,
  feeTokenAddress: string,
  currentBroadcaster?: SelectedBroadcaster,
  use7702Only = false,
): Promise<SelectedBroadcaster | undefined> => {
  const waku = getWakuClient();
  const chain = getChainForName(chainName);
  const broadcasters = await waku.findBroadcastersForToken(
    chain,
    feeTokenAddress.toLowerCase(),
    true,
    use7702Only,
  );

  if (!isDefined(broadcasters) || broadcasters.length === 0) {
    return undefined;
  }

  const { symbol: tokenSymbol, decimals: tokenDecimals } = await getTokenInfo(
    chainName,
    feeTokenAddress,
  );
  const { symbol: baseSymbol } = getWrappedTokenInfoForChain(chainName);

  broadcasters.sort((a, b) => compareBroadcasterFees(a.tokenFee, b.tokenFee));

  const choices = broadcasters.map((broadcaster, index) => {
    const priceFormatted = parseFloat(
      formatUnits(BigInt(broadcaster.tokenFee.feePerUnitGas), tokenDecimals),
    )
      .toFixed(6)
      .replace(/\.?0+$/, "");
    const reliability = (broadcaster.tokenFee.reliability * 100).toFixed(0);
    const isCurrent =
      currentBroadcaster?.railgunAddress.toLowerCase() ===
      broadcaster.railgunAddress.toLowerCase();

    return {
      name: `${index}`,
      message: `${priceFormatted} ${tokenSymbol} : 1 ${baseSymbol} -- ${getFormattedAddress(
        broadcaster.railgunAddress,
        10,
        8,
      )} (${reliability}%)${isCurrent ? " [current]" : ""}`,
    };
  });

  choices.push({ name: "cancel", message: "Cancel Selection".grey });

  const prompt = new Select({
    header: " ",
    message: `Select Broadcaster (${tokenSymbol})`,
    choices,
    multiple: false,
  });

  const result = await prompt.run().catch(confirmPromptCatch);
  if (!result || result === "cancel") {
    return undefined;
  }

  return broadcasters[parseInt(result)];
};

const selectBroadcasterForFeeToken = async (
  chainName: NetworkName,
  amountRecipients: RailgunERC20AmountRecipient[],
  currentBroadcaster?: SelectedBroadcaster,
  use7702 = false,
  feeTokenAddress?: string,
): Promise<{ selectedBroadcaster: SelectedBroadcaster } | undefined> => {
  let nextFeeTokenAddress = feeTokenAddress;

  if (!nextFeeTokenAddress) {
    const feeToken = await feeTokenSelectionPrompt(
      chainName,
      false,
      amountRecipients,
      use7702,
    );
    if (!feeToken) {
      return undefined;
    }
    nextFeeTokenAddress = feeToken.tokenAddress;
  }

  if (!nextFeeTokenAddress) {
    return undefined;
  }

  const selectedBroadcaster = await runBroadcasterSelectionPrompt(
    chainName,
    nextFeeTokenAddress,
    currentBroadcaster,
    use7702,
  );
  if (selectedBroadcaster) {
    return { selectedBroadcaster };
  }

  return undefined;
};

export async function runFeeTokenSelector(
  chainName: NetworkName,
  amountRecipients: RailgunERC20AmountRecipient[],
  currentBroadcaster?: SelectedBroadcaster,
  requires7702 = false,
): Promise<{ selectedBroadcaster: SelectedBroadcaster } | undefined> {
  const feeTokenOptionPrompt = new Select({
    header: " ",
    message: "Transaction Submission Options",
    choices: [
      { name: "relayed", message: "Select Broadcaster" },
      {
        name: "self-signed",
        message: `Self Sign Transaction ${"Self-Broadcast".yellow}`,
      },
      { name: "go-back", message: "Cancel Selection".grey },
    ],
    multiple: false,
  });
  const feeOption = await feeTokenOptionPrompt.run().catch(confirmPromptCatch);
  if (feeOption) {
    switch (feeOption) {
      case "relayed": {
        const selection = await selectBroadcasterForFeeToken(
          chainName,
          amountRecipients,
          currentBroadcaster,
          requires7702,
        );
        return selection ?? runFeeTokenSelector(
          chainName,
          amountRecipients,
          currentBroadcaster,
          requires7702,
        );
      }
      case "self-signed": {
        return undefined;
      }
      case "clear-broadcaster-list": {
        resetBroadcasterFilters();
        return runFeeTokenSelector(
          chainName,
          amountRecipients,
          undefined,
          requires7702,
        );
      }
      case "go-back": {
        throw new Error("Going back to previous menu.");
      }
    }
  } else {
    throw new Error("No Fee Selection Made");
  }
}

export const getTokenAmountSelectionPrompt = async (
  token: RailgunReadableAmount,
  currentBalance: string,
  recipientAddress?: string,
): Promise<string | undefined> => {
  const recipentString = isDefined(recipientAddress)
    ? `Recipient: ${getFormattedAddress(recipientAddress)}\n`
    : "";

  const selectionHeader = `
  `;
  const prompt = new Input({
    header: `\nHow much ${token.name.cyan} do you wish to transfer?\n${
      recipentString.cyan
    }Your Balance: ${currentBalance.toString().yellow}\n`,
    message: `${token.symbol}:`,
    min: 0,
    initial: currentBalance,
    max: currentBalance,
    result(value: string) {
      return parseUnits(value, token.decimals) <
        parseUnits(currentBalance, token.decimals)
        ? value
        : currentBalance;
    },
    validate(value: string) {
      return (
        typeof value !== "undefined" && parseUnits(value, token.decimals) > 0
      );
    },
  });
  const result = await prompt.run().catch(async (err: any) => {
    await confirmPromptCatchMessage(
      `[${token.symbol.cyan}] Transfer Skipped. `,
    );
  });

  if (result === false) {
    return undefined;
  }

  return result;
};

export const runTokenAmountSelection = async (
  currentBalance: string,
  token: RailgunReadableAmount,
  publicTransfer: boolean,
  isShieldEvent = false,
): Promise<RailgunSelectedAmount | undefined> => {
  const recipientAddress = publicTransfer
    ? await runInputPublicAddress(`[${token.symbol}] `, isShieldEvent)
    : await runInputRailgunAddress(`[${token.symbol}] `, isShieldEvent);

  if (!recipientAddress) {
    return undefined;
  }

  const result = await getTokenAmountSelectionPrompt(
    token,
    currentBalance,
    recipientAddress,
  );
  if (!isDefined(result)) {
    return undefined;
  }
  const newSelection = {
    ...token,
    selectedAmount: parseUnits(result, token.decimals),
    recipientAddress,
  };
  return newSelection;
};

export const tokenAmountSelectionPrompt = async (
  balances: RailgunReadableAmount[],
  publicTransfer: boolean,
  singleTransfer = false,
  isShieldEvent = false,
): Promise<RailgunSelectedAmount[]> => {
  const selections = [];

  const addressType = publicTransfer ? "[0x]" : "[0zk]";
  const transferType = publicTransfer ? "PUBLIC" : "PRIVATE";

  try {
    for (const bal of balances) {
      const { symbol } = bal;
      let currentBalance = bal.amount;
      let currentMax = formatUnits(currentBalance, bal.decimals);

      let completed = false;
      while (!completed) {
        currentMax = formatUnits(currentBalance, bal.decimals);
        const selection = await runTokenAmountSelection(
          currentMax,
          bal,
          publicTransfer,
          isShieldEvent,
        );
        if (selection) {
          currentBalance = currentBalance - selection.selectedAmount;
          const newSelection = { ...selection, amount: currentBalance };
          selections.push(newSelection);
          if (!singleTransfer && currentBalance > 0n) {
            const addAddress = await confirmPrompt(
              `Add another ${addressType} ${transferType} address to this ${symbol} transfer?`,
            );
            completed = !addAddress;
          } else {
            completed = true;
          }
        } else {
          completed = true;
        }
        await delay(200);
      }
    }
  } catch (err: any) {
    /* empty */
  }
  return selections;
};

export const transferTokenAmountSelectionPrompt = async (
  chainName: NetworkName,
  publicBalances = false,
  publicTransfer = false,
  singleAddressSelection = false,
  isShieldEvent = false,
) => {
  const transferType = publicBalances ? "Publicly" : "Privately";
  const selections = await tokenSelectionPrompt(
    chainName,
    `Send ERC20 Tokens ${transferType}`,
    true,
    publicBalances,
  );

  const amountSelections = await tokenAmountSelectionPrompt(
    selections,
    publicTransfer,
    singleAddressSelection,
    isShieldEvent,
  );
  return { amountSelections };
};

export const runAddTokenPrompt = async (
  chainName: NetworkName,
): Promise<void> => {
  const prompt = new Input({
    header: " ",
    message: `Please enter Token Address.`,
    validate: (value: string) => {
      return validateEthAddress(value);
    },
  });

  const resultAddress = await prompt.run().catch(confirmPromptCatch);

  if (resultAddress) {
    try {
      console.log("Collecting Token Info...".yellow);
      await getTokenInfo(chainName, resultAddress);
      console.log("Updating Balance.".yellow);
      await updatePublicBalancesForChain(chainName);
      return;
    } catch (error) {
      console.log("Unable to get Token Info from Address provided.");
    }
  }

  const confirm = await confirmPrompt(
    `Unable to get Token Info from Address provided. Would you like to try again?`,
    {
      initial: true,
    },
  ).catch(confirmPromptCatch);

  if (confirm) {
    return runAddTokenPrompt(chainName);
  }
};
