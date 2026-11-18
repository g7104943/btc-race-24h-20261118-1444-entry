// CoilBase: a long-only cbBTC swing bot for agent-fun/bars-replay/v1.
//
// How it works, in one paragraph: the hello message opens the session with
// the universe, the capital, the caps and the fees. After that the harness
// sends one batch per minute, each carrying the bar that just closed, and
// this bot answers every batch with exactly one reply holding its orders
// for that bar. Orders decided on a bar fill at the next bar's open, so
// every decision here is made on closes the bot has already seen, never on
// a bar still forming.
//
// The idea: on one-minute bars Bitcoin often goes quiet for a couple of
// hours, coiling into a narrow band, and then breaks out of that base in a
// move worth a percent or two — while a full round trip costs about 26 bps
// in fees, slippage and price impact, so only a real swing pays. The bot
// watches the last 120 bars (two hours) and buys with all its cash when
// that window has compressed to under 0.8% wide, the close is sitting
// within 0.2% of the window's low, the last five bars have stopped falling
// fast, and — the level filter — the close is still at least 1.2% below
// the high of the last 240 bars (four hours), so it is buying a dip off a
// low base and not chasing a base that formed near the highs. It then rides
// the swing out: it sells the whole position when it is worth 2% over what
// the buy cost, when the close trails 0.8% below the highest close since
// the entry, or when it is worth 1% under its cost. After a sell it waits
// 30 bars before it will buy again, so it never re-enters the same base
// twice in a row.
//
// Everything here is deterministic: plain float64 arithmetic over the bars
// seen so far, no clock, no environment, no randomness (hello.seed is read
// and ignored, since the strategy needs none). The same bars always produce
// the same orders, so two runs of the entry log identical actions.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

/** Bars of history the coil window is read from: 120 one-minute bars, two hours. */
const COIL_BARS = 120;
/** Bars of history the level filter reads its high from: 240 bars, four hours. */
const LEVEL_BARS = 240;
/** Buy only when the coil window's high-to-low range is under this fraction. */
const COMPRESS_MAX = 0.008;
/** Buy only when the close is within this fraction above the coil window's low. */
const NEAR_LOW = 0.002;
/** Buy only when the close is at least this far below the 240-bar high. */
const DIP_MIN = 0.012;
/** Buy only when the 5-bar return is above this: the base has stopped falling fast. */
const R5_MIN = -0.0005;
/** Take profit: sell when the position is worth this far over its cost. */
const TAKE_PROFIT = 0.02;
/** Trailing stop: sell when the close is this far below the peak close since entry. */
const TRAIL = 0.008;
/** Hard stop: sell when the position is worth this far under its cost. */
const STOP_LOSS = 0.01;
/** Bars to wait after a sell before buying again. */
const COOLDOWN_BARS = 30;
/** Cap on how far a fill may move from the latest close, in bps. */
const MAX_SLIPPAGE_BPS = 120;

interface SeenBar {
  h: number;
  l: number;
  c: number;
}

/** The last LEVEL_BARS bars, oldest first. */
const history: SeenBar[] = [];

/** Highest close seen since the current position was opened, in raw price units. */
let peakClose: number | null = null;
/** Batch seq of the last sell, so the cooldown can be measured in batches. */
let lastSellSeq = -1_000_000;

function pushBar(bar: { h: string; l: string; c: string }): void {
  history.push({ h: Number(bar.h), l: Number(bar.l), c: Number(bar.c) });
  if (history.length > LEVEL_BARS) history.shift();
}

/** Highest high and lowest low of the last `n` bars, or null before `n` bars. */
function windowRange(n: number): { hi: number; lo: number } | null {
  if (history.length < n) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = history.length - n; i < history.length; i++) {
    const b = history[i]!;
    if (b.h > hi) hi = b.h;
    if (b.l < lo) lo = b.l;
  }
  return { hi, lo };
}

/** Highest high of all the history kept (up to LEVEL_BARS bars). */
function levelHigh(): number | null {
  if (history.length === 0) return null;
  let hi = -Infinity;
  for (const b of history) if (b.h > hi) hi = b.h;
  return hi;
}

await runBars({
  onBatch(state: BarsState, batch) {
    // Fold this batch's bar into history. A minute with no bar adds nothing,
    // and a batch with no fresh bar is not decided on.
    let fresh = false;
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) {
        pushBar(bar);
        fresh = true;
      }
    }
    if (!fresh || state.warmingUp) return [];

    // Only a confirmed sell clears the trailing-stop peak and starts the
    // cooldown: a sell the market rejects leaves the position held, so the
    // peak must survive and the exit must simply be sent again next bar.
    for (const fill of batch.fills) {
      if (fill.symbol === SYMBOL && fill.side === 'sell' && fill.status === 'filled') {
        peakClose = null;
        lastSellSeq = state.seq;
      }
    }

    const held = state.positions.get(SYMBOL);
    const holding = held !== undefined && held.qty > 0n;
    const close = state.close(SYMBOL);
    if (close === null) return [];

    const closeNum = Number(close);
    const orders: (BuyInput | SellInput)[] = [];

    if (holding) {
      // Track the peak close since entry, then check the exits.
      if (peakClose === null || closeNum > peakClose) peakClose = closeNum;
      const value = state.value(SYMBOL, held.qty);
      const cost = held.cost;
      const atProfit = value * 100n >= cost * 102n;
      const trailed = peakClose !== null && closeNum < peakClose * (1 - TRAIL);
      const stopped = value * 100n <= cost * 99n;
      if (atProfit || trailed || stopped) {
        orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
      return orders;
    }

    // Flat: only buy from a compressed coil at its low, well below the
    // four-hour high, after the cooldown, and not while still falling fast.
    if (state.seq < lastSellSeq + COOLDOWN_BARS) return [];
    const coil = windowRange(COIL_BARS);
    if (coil === null) return [];
    const span = coil.hi - coil.lo;
    if (span <= 0 || span / coil.lo >= COMPRESS_MAX) return [];
    if ((closeNum - coil.lo) / coil.lo >= NEAR_LOW) return [];
    const hi240 = levelHigh();
    if (hi240 === null || (hi240 - closeNum) / hi240 < DIP_MIN) return [];
    const n = history.length;
    const r5 = n >= 6 ? closeNum / history[n - 6]!.c - 1 : 0;
    if (r5 <= R5_MIN) return [];

    // Spend all the cash on hand, capped by the weight room the caps allow.
    const room = state.weightRoom(SYMBOL);
    const spend = state.cash < room ? state.cash : room;
    if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS });
    return orders;
  },
});
