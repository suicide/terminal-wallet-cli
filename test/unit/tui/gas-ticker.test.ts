/**
 * Gas ticker: five percentile tiers plus a separate Network quote.
 *
 * gasTicker() renders exactly five effective prices (priority + baseFee) so the
 * 5-value line fits a narrow card; the Network/native eth_gasPrice is rendered
 * via formatNetworkGasPrice() using the same precision policy without adding
 * baseFee (no double-count).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "ethers";
import {
  gasTicker,
  formatNetworkGasPrice,
  formatGwei,
} from "../../../src/tui/format/deck";
import { CustomGasEstimate } from "../../../src/models/gas-models";

const gwei = (n: string) => parseUnits(n, "gwei");

const estimate = (
  base: string,
  slowest: string,
  slower: string,
  slow: string,
  average: string,
  fast: string,
  network: string,
): CustomGasEstimate =>
  ({
    baseFeePerGas: gwei(base),
    slowest: gwei(slowest),
    slower: gwei(slower),
    slow: gwei(slow),
    average: gwei(average),
    fast: gwei(fast),
    gasPrice: gwei(network),
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
  }) as CustomGasEstimate;

test("five tiers that differ by less than a gwei still read as different", () => {
  const ticker = gasTicker(estimate("14", "0.01", "0.1", "0.15", "0.45", "0.9", "0.8"));
  // Percentile tiers: priority + baseFee — five values only.
  assert.equal(ticker, "14.01 / 14.10 / 14.15 / 14.45 / 14.90 gwei");
  // Network is separate, formatted without baseFee.
  assert.equal(formatNetworkGasPrice(gwei("0.8")), "0.8 gwei");
});

test("the base fee is included for percentile tiers", () => {
  assert.equal(
    gasTicker(estimate("20", "0.3", "0.5", "1", "2", "3", "1.5")),
    "20.30 / 20.50 / 21.00 / 22.00 / 23.00 gwei",
  );
  assert.equal(formatNetworkGasPrice(gwei("1.5")), "1.50 gwei");
});

test("a busy chain stays on one line", () => {
  // Three-digit gas with two decimals each would run the stat card over, and
  // at 120 gwei the second decimal is not a number anyone acts on.
  assert.equal(
    gasTicker(estimate("120", "1", "3", "5", "10", "20", "8")),
    "121.0 / 123.0 / 125.0 / 130.0 / 140.0 gwei",
  );
  assert.equal(formatNetworkGasPrice(gwei("8")), "8.00 gwei");
});

test("sub-gwei keeps the precision that is the whole figure", () => {
  // An L2 at 0.001 gwei base fee — every tier is sub-gwei and each must keep
  // enough digits to be distinguishable.
  const ticker = gasTicker(
    estimate("0.001", "0.001", "0.002", "0.003", "0.004", "0.006", "0.005"),
  );
  assert.match(ticker, /0\.002 \/ 0\.003 \/ 0\.004 \/ 0\.005 \/ 0\.007 gwei/);
  // Network = gasPrice directly = 0.005, sub-gwei precision preserved.
  assert.equal(formatNetworkGasPrice(gwei("0.005")), "0.005 gwei");
});

test("a zero estimate does not print a decimal fringe", () => {
  assert.equal(
    gasTicker(estimate("0", "0", "0", "0", "0", "0", "0")),
    "0 / 0 / 0 / 0 / 0 gwei",
  );
  assert.equal(formatNetworkGasPrice(gwei("0")), "0 gwei");
});

test("slowest and slower are not silently swallowed when nonzero", () => {
  // Regression: the helper used to hard-code slowest/slower to zero, masking
  // formatting bugs in those tiers.
  const ticker = gasTicker(estimate("10", "0.2", "0.5", "1", "2", "4", "3"));
  // slowest (0.2 + 10 = 10.20) must differ from slower (0.5 + 10 = 10.50).
  assert.ok(ticker.startsWith("10.20 / 10.50 / 11.00 / 12.00 / 14.00"), ticker);
  assert.equal(formatNetworkGasPrice(gwei("3")), "3.00 gwei");
});

test("ticker contains exactly five slash-separated tiers", () => {
  const ticker = gasTicker(estimate("14", "0.01", "0.1", "0.15", "0.45", "0.9", "0.8"));
  const parts = ticker.split(" / ");
  // 4 slashes → 5 tiers, last part ends with " gwei"
  assert.equal(parts.length, 5, `expected 5 tiers, got ${parts.length}`);
  assert.ok(parts[4].endsWith(" gwei"), "last tier must end with ' gwei'");
});

test("network formatter reflects raw gasPrice, not priority + baseFee", () => {
  // The network price shows gasPrice directly (the total the node quotes),
  // while the percentile tiers show priority + baseFee.
  const raw = formatNetworkGasPrice(gwei("3"));
  assert.equal(raw, "3.00 gwei", `network tier missing: ${raw}`);
  // Must NOT be 13.00 (= old behavior of gasPrice + baseFee where baseFee=10).
  const est = estimate("10", "0.2", "0.5", "1", "2", "4", "3");
  const networkViaEstimate = formatNetworkGasPrice(est);
  assert.equal(networkViaEstimate, "3.00 gwei");
  assert.ok(!networkViaEstimate.includes("13.00"), `old network+baseFee double-counted: ${networkViaEstimate}`);
  // gasTicker itself must not contain the raw network value as a sixth tier.
  const ticker = gasTicker(est);
  assert.ok(!ticker.split(" / ").some((p) => p.trim() === "3.00 gwei"), "ticker should not include network tier");
});

test("formatNetworkGasPrice accepts bigint and estimate object", () => {
  assert.equal(formatNetworkGasPrice(gwei("1.5")), "1.50 gwei");
  assert.equal(formatNetworkGasPrice({ gasPrice: gwei("1.5") }), "1.50 gwei");
});

test("formatGwei shares the same precision policy as the ticker", () => {
  assert.equal(formatGwei(gwei("0")), "0");
  assert.equal(formatGwei(gwei("0.0001")), "0.001");
  assert.equal(formatGwei(gwei("0.005")), "0.005");
  assert.equal(formatGwei(gwei("0.8")), "0.8");
  assert.equal(formatGwei(gwei("1.5")), "1.50");
  assert.equal(formatGwei(gwei("14.01")), "14.01");
  assert.equal(formatGwei(gwei("120")), "120.0");
  // busy-chain rounding: 121 gwei -> 1 decimal
  assert.equal(formatGwei(gwei("121")), "121.0");
});

test("network formatter does not double-count baseFee", () => {
  const est = estimate("10", "0.2", "0.5", "1", "2", "4", "3");
  // Raw gasPrice 3 gwei must not become 13 gwei (gasPrice+baseFee).
  const formatted = formatNetworkGasPrice(est.gasPrice);
  assert.equal(formatted, "3.00 gwei");
  assert.ok(!formatted.includes("13"), `double-counted baseFee: ${formatted}`);
  // Also when gasPrice < baseFee, still raw.
  const est2 = estimate("20", "0.3", "0.5", "1", "2", "3", "1.5");
  assert.equal(formatNetworkGasPrice(est2.gasPrice), "1.50 gwei");
});

// --- narrow-terminal sanity ------------------------------------------------

test("ticker fits in a 30-column card for the zero case", () => {
  // The gas card is Math.floor(width / shown.length) columns, with 2 columns
  // of padding.  At 104 columns with 4 cards that is 26 columns (24 content).
  // Five tiers with the zero case: "0 / 0 / 0 / 0 / 0 gwei" = 22 chars.
  const zero = gasTicker(estimate("0", "0", "0", "0", "0", "0", "0"));
  assert.ok(zero.length <= 30, `zero ticker too wide: ${zero.length}`);
});

test("sub-gwei five-tier ticker stays under 55 chars", () => {
  // Five tiers with sub-gwei precision produce a longer line but must still
  // fit the 55-char ceiling so it never wraps inside the card.
  const sub = gasTicker(
    estimate("0.001", "0.001", "0.002", "0.003", "0.004", "0.006", "0.005"),
  );
  assert.ok(sub.length > 20, "expected multi-char ticker");
  assert.ok(sub.length <= 55, `ticker grew past 55 chars: ${sub.length}`);
  // Separate network quote is short and always visible on its own line.
  const net = formatNetworkGasPrice(gwei("0.005"));
  assert.ok(net.length <= 12, `network quote too wide: ${net}`);
});
