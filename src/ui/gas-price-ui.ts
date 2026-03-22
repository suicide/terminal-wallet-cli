import { formatUnits } from "ethers";
import { CustomGasEstimate, GasSpeed } from "../models/gas-models";
import { confirmPromptCatch } from "./confirm-ui";
import "colors";

const { Select } = require("enquirer");

export const formatGwei = (value: bigint): string => {
  const formatted = formatUnits(value, "gwei");
  const num = parseFloat(formatted);
  if (num < 0.01) {
    return num.toFixed(6);
  } else if (num < 1) {
    return num.toFixed(4);
  } else {
    return num.toFixed(2);
  }
};

export const runGasSpeedSelectionPrompt = async (
  gasEstimate: CustomGasEstimate,
): Promise<GasSpeed> => {
  const { gasPrice, baseFeePerGas, slowest, slower, slow, average, fast } =
    gasEstimate;

  const networkMaxFee = formatGwei(gasPrice);
  const slowestMaxFee = formatGwei(slowest + baseFeePerGas);
  const slowestPriority = formatGwei(slowest);
  const slowerMaxFee = formatGwei(slower + baseFeePerGas);
  const slowerPriority = formatGwei(slower);
  const slowMaxFee = formatGwei(slow + baseFeePerGas);
  const slowPriority = formatGwei(slow);
  const avgMaxFee = formatGwei(average + baseFeePerGas);
  const avgPriority = formatGwei(average);
  const fastMaxFee = formatGwei(fast + baseFeePerGas);
  const fastPriority = formatGwei(fast);
  const baseFee = formatGwei(baseFeePerGas);

  const header = `
${"Gas Price Selection".bold}
Base Fee: ${baseFee.cyan} gwei

Max Fee / Priority Fee (gwei)
`.grey;

  const prompt = new Select({
    header,
    message: "Select Gas Speed",
    choices: [
      {
        name: "network",
        message: `${"Network".padEnd(10)} | ${networkMaxFee.padStart(8)} / ${"(eth_gasPrice)".grey}`,
        hint: "Current network price",
      },
      {
        name: "slowest",
        message: `${"Slowest".padEnd(10)} | ${slowestMaxFee.padStart(8)} / ${slowestPriority.padStart(8)}`,
        hint: "20th percentile",
      },
      {
        name: "slower",
        message: `${"Slower".padEnd(10)} | ${slowerMaxFee.padStart(8)} / ${slowerPriority.padStart(8)}`,
        hint: "40th percentile",
      },
      {
        name: "slow",
        message: `${"Slow".padEnd(10)} | ${slowMaxFee.padStart(8)} / ${slowPriority.padStart(8)}`,
        hint: "60th percentile",
      },
      {
        name: "average",
        message: `${"Average".padEnd(10)} | ${avgMaxFee.padStart(8)} / ${avgPriority.padStart(8)}`.green,
        hint: "80th percentile (default)",
      },
      {
        name: "fast",
        message: `${"Fast".padEnd(10)} | ${fastMaxFee.padStart(8)} / ${fastPriority.padStart(8)}`,
        hint: "95th percentile",
      },
    ],
    initial: "average",
  });

  const result = await prompt.run().catch(confirmPromptCatch);
  return (result as GasSpeed) ?? "average";
};
