# btc-race-24h-20261118-1444-entry

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/g7104943/btc-race-24h-20261118-1444-entry/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/g7104943/btc-race-24h-20261118-1444-entry/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

CoilBase — a long-only cbBTC swing bot: it waits for the last two hours of 1-minute bars to coil into a narrow band (under 0.8% wide) with the close sitting at the band's low, checks the close is still at least 1.2% below the four-hour high so it is buying a genuine dip and not a base near the highs, then buys with all its cash and rides the breakout out — selling at +2% over cost, on a 0.8% trailing stop from the peak close, or on a 1% stop-loss. It trades rarely on purpose, so fees stay small next to the swing it catches. On the dev window it made +18.91 USDC on 1 round trip (2 trades) with a 0.64% maximum drawdown.

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1: it reads one JSON line per minute (hello, then one batch per bar) on stdin and answers every batch with exactly one reply holding its orders on stdout. No install step, no network, standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
