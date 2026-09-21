/**
 * Deck geometry.
 *
 * The layout is where a terminal UI goes wrong quietly: it does not crash, it
 * just squeezes the pane you are typing an amount into down to nothing. The
 * rule being asserted here is that the centre is protected — a rail is only
 * given room inline if what remains is still wide enough to compose in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLayout,
  tierFor,
  defaultRails,
  LEFT_W,
  RIGHT_W,
  MIN_CENTER,
  MIN_W,
  MIN_H,
  GAS_MIN_BOX,
  GAS_MIN_CONTENT,
  OTHER_MIN_BOX,
  OTHER_MIN_CONTENT,
  getDeckCardOrder,
  allocateDeckCards,
} from "../../../src/tui/layout";

const at = (width: number, height = 40, wantLeft = true, wantRight = true) =>
  computeLayout({ width, height, wantLeft, wantRight });

test("tiers switch exactly at the width that fits them", () => {
  assert.equal(tierFor(LEFT_W + RIGHT_W + MIN_CENTER), "wide");
  assert.equal(tierFor(LEFT_W + RIGHT_W + MIN_CENTER - 1), "medium");
  assert.equal(tierFor(LEFT_W + MIN_CENTER), "medium");
  assert.equal(tierFor(LEFT_W + MIN_CENTER - 1), "narrow");
});

test("a wide terminal gets both rails inline", () => {
  const l = at(200);
  assert.equal(l.centerLeft, LEFT_W);
  assert.equal(l.centerRight, RIGHT_W);
  assert.equal(l.leftOverlay, false);
  assert.equal(l.rightOverlay, false);
});

test("the centre never drops below its minimum, whatever is asked for", () => {
  // Every width from unusable to generous: if the centre is inline at all, it
  // has at least MIN_CENTER. This is the invariant the tiers exist to keep.
  for (let w = MIN_W; w <= 220; w++) {
    const l = at(w);
    if (l.tooSmall) continue;
    const centre = w - l.centerLeft - l.centerRight;
    assert.ok(
      centre >= MIN_CENTER,
      `width ${w}: centre was ${centre}, below the ${MIN_CENTER} minimum`,
    );
  }
});

test("a rail that will not fit becomes an overlay rather than shrinking the centre", () => {
  // One column too narrow for both rails inline. The left is considered first,
  // so it is the one that peeks — and only reachable by explicitly asking for
  // both, since the tier defaults never request more than fits.
  const l = at(LEFT_W + RIGHT_W + MIN_CENTER - 1);
  assert.equal(l.leftOverlay, true);
  assert.equal(l.centerLeft, 0);
  assert.equal(l.centerRight, RIGHT_W);
});

test("the tier defaults never need an overlay", () => {
  // An overlay is a response to the user asking for more than fits. Arriving at
  // one without asking would mean the defaults themselves are wrong.
  for (let w = MIN_W; w <= 220; w++) {
    const { left, right } = defaultRails(w);
    const l = computeLayout({ width: w, height: 40, wantLeft: left, wantRight: right });
    if (l.tooSmall) continue;
    assert.equal(l.leftOverlay, false, `width ${w} overlaid the left rail by default`);
    assert.equal(l.rightOverlay, false, `width ${w} overlaid the right rail by default`);
  }
});

test("asking for nothing gives the centre the whole width", () => {
  const l = at(200, 40, false, false);
  assert.equal(l.centerLeft, 0);
  assert.equal(l.centerRight, 0);
});

test("an unusably small terminal reports itself rather than laying out", () => {
  assert.equal(at(MIN_W - 1).tooSmall, true);
  assert.equal(at(200, MIN_H - 1).tooSmall, true);
  assert.equal(at(MIN_W, MIN_H).tooSmall, false);
});

test("cards are allocated with layout-level gas width guarantee (monotonic)", () => {
  // Gas is a wide card: 46 box / 42 content whenever shown. Other cards need at
  // least 20 box / 16 content to stay usable. Layout-level allocation ensures
  // gas never gets the old equal-width 16 content at 104 wide and now fits
  // high real-world values (300+ gwei) at 42 content.
  // Monotonic preference — once gas appears it stays:
  //  126+: 3 non-gas + gas + util =5 (all)
  //  106+: 2 non-gas + gas + util =4 with gas (drops status to keep gas wide)
  //   86+: 1 non-gas + gas + util =3 with gas (wallet+gas+util, prefers gas over 3 non-gas)
  //   60+: 2 non-gas + util =3
  //   40+: 1 non-gas + util =2
  // Thresholds: gas appears at 86 and never disappears; at 90–105 we show fewer
  // non-gas cards rather than hide gas (see layout.ts for exact examples).
  const cases: Array<{ w: number; statusCards: number; showGas: boolean; total: number }> = [
    { w: 200, statusCards: 3, showGas: true, total: 5 },
    { w: 140, statusCards: 3, showGas: true, total: 5 },
    { w: 126, statusCards: 3, showGas: true, total: 5 },
    { w: 125, statusCards: 2, showGas: true, total: 4 },
    { w: 106, statusCards: 2, showGas: true, total: 4 },
    { w: 105, statusCards: 1, showGas: true, total: 3 },
    { w: 90, statusCards: 1, showGas: true, total: 3 },
    { w: 86, statusCards: 1, showGas: true, total: 3 },
    { w: 85, statusCards: 2, showGas: false, total: 3 },
    { w: 70, statusCards: 2, showGas: false, total: 3 },
    { w: 60, statusCards: 2, showGas: false, total: 3 },
    { w: 56, statusCards: 1, showGas: false, total: 2 },
    { w: 50, statusCards: 1, showGas: false, total: 2 },
  ];
  for (const { w, statusCards, showGas, total } of cases) {
    const l = at(w);
    assert.equal(l.statusCards, statusCards, `width ${w}: statusCards`);
    assert.equal(l.showGas, showGas, `width ${w}: showGas`);
    assert.equal(l.totalShown, total, `width ${w}: totalShown`);
  }
});

test("the card count never increases as the terminal shrinks (totalShown)", () => {
  let previous = Infinity;
  for (let w = 220; w >= MIN_W; w--) {
    const l = at(w);
    if (l.tooSmall) continue;
    assert.ok(
      l.totalShown <= previous,
      `width ${w}: totalShown went up from ${previous} to ${l.totalShown}`,
    );
    previous = l.totalShown;
  }
});

test("gas has at least 46 box / 42 content whenever shown", () => {
  for (let w = MIN_W; w <= 220; w++) {
    const l = at(w);
    if (l.tooSmall || !l.showGas) continue;
    assert.ok(l.gasBoxWidth >= GAS_MIN_BOX, `width ${w}: gasBoxWidth ${l.gasBoxWidth} < ${GAS_MIN_BOX}`);
    assert.ok(l.gasContentWidth >= GAS_MIN_CONTENT, `width ${w}: gasContentWidth ${l.gasContentWidth} < ${GAS_MIN_CONTENT}`);
    assert.ok(l.gasContentWidth >= 42, `width ${w}: gasContentWidth <42`);
  }
});

test("other cards remain usable (at least 20 box / 16 content) whenever shown", () => {
  for (let w = MIN_W; w <= 220; w++) {
    const l = at(w);
    if (l.tooSmall) continue;
    assert.ok(l.otherBoxWidth >= OTHER_MIN_BOX || l.totalShown === 1, `width ${w}: otherBoxWidth ${l.otherBoxWidth} < ${OTHER_MIN_BOX}`);
    assert.ok(l.otherContentWidth >= OTHER_MIN_CONTENT || l.totalShown === 1, `width ${w}: otherContentWidth < ${OTHER_MIN_CONTENT}`);
  }
});

test("representative width 126 gives gas adequate width while keeping others usable", () => {
  const l = at(126);
  assert.equal(l.showGas, true, "gas should be visible at 126");
  assert.ok(l.gasBoxWidth >= 46, `126 gasBoxWidth ${l.gasBoxWidth} <46`);
  assert.ok(l.gasContentWidth >= 42, `126 gasContentWidth ${l.gasContentWidth} <42`);
  assert.ok(l.otherBoxWidth >= 20, `126 otherBoxWidth ${l.otherBoxWidth} <20`);
  assert.ok(l.otherContentWidth >= 16, `126 otherContentWidth ${l.otherContentWidth} <16`);
  assert.equal(l.totalShown, 5);
  assert.equal(l.statusCards, 3);
  // At exactly 126, equal division would be 25 <46 so uses minimum branch:
  // gas 46, other floor((126-46)/4)=20
  assert.equal(l.gasBoxWidth, 46, "gasBoxWidth at 126 should be 46");
  assert.equal(l.otherBoxWidth, 20, "otherBoxWidth at 126 should be 20");
});

test("wider layouts retain all cards", () => {
  for (const w of [126, 140, 180, 200, 220]) {
    const l = at(w);
    assert.equal(l.showGas, true, `width ${w} should show gas`);
    assert.equal(l.statusCards, 3, `width ${w} should have 3 non-gas cards`);
    assert.equal(l.totalShown, 5, `width ${w} should show 5 total cards`);
    assert.ok(l.gasBoxWidth >= 46);
    assert.ok(l.gasContentWidth >= 42);
  }
});

test("narrower widths suppress gas intentionally rather than shrinking it", () => {
  // Gas threshold is 86 (wallet+gas+util). Below that gas is suppressed to keep wallet visible.
  for (const w of [50, 56, 60, 70, 85]) {
    const l = at(w);
    assert.equal(l.showGas, false, `width ${w} should not show gas (intentional suppression)`);
  }
  // At and above 86, gas appears and stays (monotonic)
  for (const w of [86, 90, 100, 105, 106, 126]) {
    assert.equal(at(w).showGas, true, `width ${w} should show gas`);
  }
});

test("gas visibility is monotonic (never true → false → true)", () => {
  let seenGas = false;
  for (let w = MIN_W; w <= 220; w++) {
    const l = at(w);
    if (l.tooSmall) continue;
    if (l.showGas) seenGas = true;
    else if (seenGas) {
      assert.fail(`width ${w}: gas disappeared after being shown — non-monotonic`);
    }
  }
  // Exact threshold examples (documented in layout.ts)
  assert.equal(at(85).showGas, false, "85 just below threshold");
  assert.equal(at(86).showGas, true, "86 at threshold");
  assert.equal(at(90).showGas, true, "90 keeps gas with fewer non-gas");
  assert.equal(at(105).showGas, true, "105 keeps gas");
  assert.equal(at(106).showGas, true, "106 adds second non-gas");
  assert.deepEqual(getDeckCardOrder(at(90)), ["wallet", "gas", "utilities"], "90 should be wallet+gas+util, not 3 non-gas");
  assert.deepEqual(getDeckCardOrder(at(105)), ["wallet", "gas", "utilities"], "105 same as 90");
  assert.deepEqual(getDeckCardOrder(at(86)), ["wallet", "gas", "utilities"], "86 threshold order");
  assert.deepEqual(getDeckCardOrder(at(85)), ["wallet", "network", "utilities"], "85 just below threshold");
});

test("allocated widths fill terminal without overflow", () => {
  for (let w = MIN_W; w <= 220; w++) {
    const l = at(w);
    if (l.tooSmall) continue;
    // Simulate entry's allocation: sum of widths should not exceed w, and last card gets remainder so exactly w
    let sum: number;
    if (l.showGas) {
      if (Math.floor(w / l.totalShown) >= GAS_MIN_BOX) {
        // equal branch: all equal, last gets remainder => total exactly w (due to floor + remainder)
        // Check that equal allocation still respects minima
        assert.ok(Math.floor(w / l.totalShown) >= GAS_MIN_BOX);
      } else {
        sum = l.gasBoxWidth + (l.totalShown - 1) * l.otherBoxWidth;
        // Due to floor, sum may be slightly less than w, remainder goes to last card
        assert.ok(sum <= w, `width ${w}: allocated sum ${sum} > ${w}`);
        assert.ok(w - sum < l.otherBoxWidth, `width ${w}: remainder too large`);
      }
    } else {
      sum = l.totalShown * l.otherBoxWidth;
      assert.ok(sum <= w);
      assert.ok(w - sum < l.otherBoxWidth);
    }
  }
});

test("deck card order and allocation — all fit preserves wallet → network → status → gas → utilities", () => {
  const l = at(200);
  assert.deepEqual(getDeckCardOrder(l), ["wallet", "network", "status", "gas", "utilities"]);
  const alloc = allocateDeckCards(200, l);
  assert.deepEqual(alloc.map((a) => a.key), ["wallet", "network", "status", "gas", "utilities"]);
  // widths sum exactly to terminal width via last-card remainder
  const sum = alloc.reduce((s, a) => s + a.boxWidth, 0);
  assert.equal(sum, 200, "allocations must exactly fill width");
  // last card gets remainder
  const withoutLast = alloc.slice(0, -1).reduce((s, a) => s + a.boxWidth, 0);
  assert.equal(alloc[alloc.length - 1]!.boxWidth, 200 - withoutLast);
  // gas has at least min, others same when equal branch (200/5=40 <46 so not equal; gas 46, other 38? actually 200/5=40 <46 so branch is min)
  assert.ok(alloc.find((a) => a.key === "gas")!.boxWidth >= GAS_MIN_BOX);
});

test("deck allocation widths correct including last-card remainder (narrow and wide)", () => {
  for (const w of [50, 86, 90, 105, 106, 126, 200, 230]) {
    const l = at(w);
    if (l.tooSmall) continue;
    const alloc = allocateDeckCards(w, l);
    const sum = alloc.reduce((s, a) => s + a.boxWidth, 0);
    assert.equal(sum, w, `width ${w}: allocations must sum to width, got ${sum}`);
    // each non-last has ideal width, last may be larger due to remainder
    const order = getDeckCardOrder(l);
    alloc.forEach((a, idx) => {
      const isLast = idx === alloc.length - 1;
      if (isLast) return;
      const expected = a.key === "gas" ? l.gasBoxWidth : l.otherBoxWidth;
      assert.equal(a.boxWidth, expected, `width ${w} key ${a.key} ideal width`);
    });
    // order matches layout
    assert.deepEqual(alloc.map((a) => a.key), order, `width ${w}: order mismatch`);
  }
});

test("representative narrow layout keeps gas and omits lower-priority non-gas intentionally", () => {
  // 86–105 should keep gas with wallet only, omitting network/status intentionally
  for (const w of [86, 90, 100, 105]) {
    const l = at(w);
    assert.equal(l.showGas, true, `width ${w} should keep gas`);
    assert.equal(l.statusCards, 1, `width ${w} should have 1 non-gas (wallet)`);
    const order = getDeckCardOrder(l);
    assert.deepEqual(order, ["wallet", "gas", "utilities"], `width ${w} narrow order`);
    const alloc = allocateDeckCards(w, l);
    const sum = alloc.reduce((s, a) => s + a.boxWidth, 0);
    assert.equal(sum, w);
    // gas width guaranteed
    assert.ok(l.gasBoxWidth >= GAS_MIN_BOX);
    assert.ok(alloc.find((a) => a.key === "gas")!.boxWidth >= GAS_MIN_BOX);
  }
  // Just below threshold, gas omitted but more non-gas shown (not gas hidden arbitrarily)
  const below = at(85);
  assert.equal(below.showGas, false);
  assert.equal(below.statusCards, 2);
  assert.deepEqual(getDeckCardOrder(below), ["wallet", "network", "utilities"]);
  // At 106 we keep gas and drop only status
  const mid = at(106);
  assert.deepEqual(getDeckCardOrder(mid), ["wallet", "network", "gas", "utilities"]);
});

test("wide threshold includes status card and allocation fills width with five keys", () => {
  // Regression for the sync/status mismatch: layout must use "status" (not "sync")
  // and the wide allocation must include it and exactly fill the terminal.
  const w = GAS_MIN_BOX + 4 * OTHER_MIN_BOX; // 126
  const l = at(w);
  assert.equal(l.showGas, true, "gas should be visible at wide threshold");
  assert.equal(l.statusCards, 3, "should have 3 non-gas cards at wide threshold");
  assert.equal(l.totalShown, 5);
  const order = getDeckCardOrder(l);
  assert.deepEqual(order, ["wallet", "network", "status", "gas", "utilities"], "wide order must include status key, not sync");
  assert.ok(order.includes("status"), "wide order must contain status");
  assert.ok(!order.includes("sync"), "wide order must not contain stale sync key");
  const alloc = allocateDeckCards(w, l);
  assert.equal(alloc.length, 5, "allocation must have five entries at wide threshold");
  assert.deepEqual(alloc.map((a) => a.key), order, "allocation keys must match order");
  const sum = alloc.reduce((s, a) => s + a.boxWidth, 0);
  assert.equal(sum, w, "wide allocation must exactly fill width");
  // Every key is present exactly once
  for (const k of ["wallet", "network", "status", "gas", "utilities"]) {
    assert.ok(alloc.some((a) => a.key === k), `missing key ${k} in wide allocation`);
  }
  // And even wider still retains status
  const l2 = at(200);
  assert.deepEqual(getDeckCardOrder(l2), ["wallet", "network", "status", "gas", "utilities"]);
});

test("defaults follow the tier", () => {
  assert.deepEqual(defaultRails(200), { left: true, right: true });
  assert.deepEqual(defaultRails(LEFT_W + MIN_CENTER), { left: true, right: false });
  assert.deepEqual(defaultRails(MIN_W), { left: false, right: false });
});
