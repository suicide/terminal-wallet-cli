/**
 * The deck's responsive layout.
 *
 * Three tiers by width: both rails, the portfolio rail only, or neither. The
 * rule that drives all of it is that the centre pane is protected — a rail goes
 * inline only if what remains is still wide enough to compose a transaction in.
 * Below that it becomes an overlay you peek at, because a builder squeezed into
 * twenty columns is worse than one you have to toggle a panel away from.
 *
 * Pure geometry: it takes the terminal size and what the user has asked to see,
 * and returns where everything goes. No widgets, so the awkward cases — the
 * boundaries between tiers, the overlay fallback — can be asserted directly.
 */

export type Tier = "wide" | "medium" | "narrow";

export const LEFT_W = 44;
// Wider than it was by a few columns: the rail carries only activity now, and
// a transaction row was losing its amount to the ellipsis.
export const RIGHT_W = 33;
/** The builder and home pane must always have at least this much. */
export const MIN_CENTER = 46;
export const MIN_W = 50;
/** title + identity + cards + work area + footer */
export const MIN_H = 18;
export const CARD_H = 5;
export const CARD_TOP = 2;
/** The work area starts below the title, identity bar and cards. */
export const TOP = CARD_TOP + CARD_H;

export const tierFor = (width: number): Tier =>
  width >= LEFT_W + RIGHT_W + MIN_CENTER
    ? "wide"
    : width >= LEFT_W + MIN_CENTER
      ? "medium"
      : "narrow";

export interface LayoutRequest {
  width: number;
  height: number;
  /** Whether the user currently wants each rail shown. */
  wantLeft: boolean;
  wantRight: boolean;
}

export const GAS_MIN_BOX = 46;
export const GAS_MIN_CONTENT = GAS_MIN_BOX - 4; // 42
export const OTHER_MIN_BOX = 20;
export const OTHER_MIN_CONTENT = OTHER_MIN_BOX - 4; // 16

export interface Layout {
  /** Terminal is unusably small; show the resize notice instead. */
  tooSmall: boolean;
  tier: Tier;
  /** Left inset of the centre pane — 0 when the rail is hidden or overlaid. */
  centerLeft: number;
  /** Right inset of the centre pane. */
  centerRight: number;
  /** A rail that did not fit inline and is drawn over the centre instead. */
  leftOverlay: boolean;
  rightOverlay: boolean;
  /** How many non-gas status cards fit (wallet, network, status) — 0..3. */
  statusCards: number;
  /** Whether the gas card is shown. When shown it is guaranteed at least GAS_MIN_BOX (46) / GAS_MIN_CONTENT (42). */
  showGas: boolean;
  /** Allocated box width for the gas card (0 when not shown). */
  gasBoxWidth: number;
  /** Content width for the gas card (box minus border+padding, 0 when not shown). */
  gasContentWidth: number;
  /** Allocated box width for each non-gas card (including utilities). */
  otherBoxWidth: number;
  /** Content width for non-gas cards. */
  otherContentWidth: number;
  /** Total number of visible cards including utilities (and gas if shown). */
  totalShown: number;
}

export const computeLayout = ({
  width,
  height,
  wantLeft,
  wantRight,
}: LayoutRequest): Layout => {
  const tier = tierFor(width);

  if (width < MIN_W || height < MIN_H) {
    return {
      tooSmall: true,
      tier,
      centerLeft: 0,
      centerRight: 0,
      leftOverlay: false,
      rightOverlay: false,
      statusCards: 0,
      showGas: false,
      gasBoxWidth: 0,
      gasContentWidth: 0,
      otherBoxWidth: 0,
      otherContentWidth: 0,
      totalShown: 0,
    };
  }

  // Card allocation — layout-level width guarantee for gas (monotonic).
  //
  // The old equal-width scheme gave gas only 16 content columns at 104 width
  // (5 cards => 20 box => 16 content), far below the ~28-42 needed for the
  // full three-row labels `net: … slowest: …` etc with high real-world gas
  // prices (e.g. 342.5 gwei). The fix is layout-level: gas is treated as a
  // wide card requiring at least GAS_MIN_BOX (46) / GAS_MIN_CONTENT (42)
  // whenever it is shown; other cards require at least OTHER_MIN_BOX (20) /
  // 16 content to stay usable. 42 content is chosen to fit the worst-case
  // realistic three-row gas card with 6 high values (e.g. baseFee 300 +
  // fast priority) without wrapping.
  //
  // Cards are: wallet, network, status (up to 3 non-gas) + gas (optional) +
  // utilities (always). We choose the most cards that fit while respecting
  // minima and keeping visibility monotonic: once gas appears it never
  // disappears as the terminal widens.
  //
  // Rule: prefer to keep the wide gas card whenever the available width can
  // meet GAS_MIN_BOX and the remaining shown cards meet OTHER_MIN_BOX, even
  // if that means showing fewer non-gas status cards. Concretely at 86–105
  // we show wallet+gas+util (1 non-gas + gas) rather than hide gas to show
  // wallet+network+status+util (3 non-gas). Gas requires at least wallet to
  // be present (86 = 46 + 2*20), so visibility is monotonic false → true at
  // 86 and thereafter true for all larger widths, with more non-gas added as
  // space allows.
  //
  // Thresholds (exact, tested — see layout.test.ts / deck-allocation):
  //   width < 86:  no gas.  40–59 → 1 non-gas + util (2 cards),
  //                60–85 → 2 non-gas + util (3 cards).
  //   86–105:     gas with 1 non-gas (wallet+gas+util, 3 cards)
  //   106–125:    gas with 2 non-gas (wallet+network+gas+util, 4 cards)
  //   >=126:      gas with 3 non-gas (all five cards)
  // Below MIN_W (50) the layout is tooSmall; within that 50–85 is 1–2 no-gas.
  // Examples: width 85 → showGas false, statusCards 2, total 3 (wallet, network, util)
  //           width 86 → showGas true,  statusCards 1, total 3 (wallet, gas, util)
  //           width 90 → showGas true,  statusCards 1, total 3 (not 3 non-gas)
  //           width 105→ showGas true,  statusCards 1, total 3
  //           width 106→ showGas true,  statusCards 2, total 4
  //           width 126→ showGas true,  statusCards 3, total 5
  let statusCards: number;
  let showGas: boolean;
  let totalShown: number;
  if (width >= GAS_MIN_BOX + 4 * OTHER_MIN_BOX) {
    statusCards = 3; showGas = true; totalShown = 5; // 116
  } else if (width >= GAS_MIN_BOX + 3 * OTHER_MIN_BOX) {
    statusCards = 2; showGas = true; totalShown = 4; // 96
  } else if (width >= GAS_MIN_BOX + 2 * OTHER_MIN_BOX) {
    statusCards = 1; showGas = true; totalShown = 3; // 76
  } else if (width >= 3 * OTHER_MIN_BOX) {
    statusCards = 2; showGas = false; totalShown = 3; // 60
  } else if (width >= 2 * OTHER_MIN_BOX) {
    statusCards = 1; showGas = false; totalShown = 2; // 40
  } else if (width >= 1 * OTHER_MIN_BOX) {
    statusCards = 0; showGas = false; totalShown = 1; // 20 — util only
  } else {
    statusCards = 1; showGas = false; totalShown = 2; // fallback (should not reach, MIN_W=50)
  }

  let gasBoxWidth = 0;
  let otherBoxWidth = 0;
  if (showGas) {
    // If equal division already gives gas >=46, keep equal for symmetry at very wide widths;
    // otherwise give gas its minimum and distribute the remainder among the other cards.
    if (Math.floor(width / totalShown) >= GAS_MIN_BOX) {
      const equal = Math.floor(width / totalShown);
      gasBoxWidth = equal;
      otherBoxWidth = equal;
    } else {
      gasBoxWidth = GAS_MIN_BOX;
      otherBoxWidth = Math.floor((width - gasBoxWidth) / (totalShown - 1));
    }
  } else {
    otherBoxWidth = Math.floor(width / totalShown);
  }
  const gasContentWidth = showGas ? Math.max(0, gasBoxWidth - 4) : 0;
  const otherContentWidth = Math.max(0, otherBoxWidth - 4);

  let centerLeft = 0;
  let centerRight = 0;
  let leftOverlay = false;
  let rightOverlay = false;

  if (wantLeft) {
    if (width - LEFT_W - (wantRight ? RIGHT_W : 0) >= MIN_CENTER) {
      centerLeft = LEFT_W;
    } else {
      leftOverlay = true;
    }
  }
  if (wantRight) {
    if (width - centerLeft - RIGHT_W >= MIN_CENTER) {
      centerRight = RIGHT_W;
    } else {
      rightOverlay = true;
    }
  }

  return {
    tooSmall: false,
    tier,
    centerLeft,
    centerRight,
    leftOverlay,
    rightOverlay,
    statusCards,
    showGas,
    gasBoxWidth,
    gasContentWidth,
    otherBoxWidth,
    otherContentWidth,
    totalShown,
  };
};

/** What the rails should default to at a given width. */
export const defaultRails = (width: number): { left: boolean; right: boolean } => {
  const tier = tierFor(width);
  return { left: tier !== "narrow", right: tier === "wide" };
};

/**
 * Pure card allocation extracted for testing (no blessed).
 *
 * Order is wallet → network → status → gas → utilities when all fit; when
 * narrower, lower-priority non-gas cards are omitted first while retaining
 * the wide gas card whenever the width meets GAS_MIN_BOX + remaining.
 * Allocation mirrors entry.ts: non-last cards get their ideal width
 * (gasBoxWidth / otherBoxWidth), last card takes the remainder so widths
 * exactly fill the terminal.
 *
 * Single source of card keys — entry.ts imports these to define CardDef
 * keys, so a mismatch (e.g. sync vs status) cannot silently omit the
 * status card when all five should be visible.
 */
export const NON_GAS_KEYS = ["wallet", "network", "status"] as const;
export const GAS_KEY = "gas" as const;
export const UTIL_KEY = "utilities" as const;

export const getDeckCardOrder = (layout: Layout): string[] => {
  const order: string[] = [...NON_GAS_KEYS.slice(0, layout.statusCards)];
  if (layout.showGas) order.push(GAS_KEY);
  order.push(UTIL_KEY);
  return order;
};

export interface DeckCardAllocation {
  key: string;
  boxWidth: number;
}

export const allocateDeckCards = (width: number, layout: Layout): DeckCardAllocation[] => {
  const order = getDeckCardOrder(layout);
  const out: DeckCardAllocation[] = [];
  let left = 0;
  order.forEach((key, idx) => {
    const isLast = idx === order.length - 1;
    const isGas = key === GAS_KEY;
    let w: number;
    if (isLast) w = width - left;
    else if (isGas) w = layout.gasBoxWidth;
    else w = layout.otherBoxWidth;
    out.push({ key, boxWidth: w });
    left += w;
  });
  return out;
};
