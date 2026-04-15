# 20-State Ladder

This project now uses a **continuous composite market score** in the range `-100` to `+100`, mapped into **20 canonical creature states**.

## Signal model

The creature state is determined from a weighted composite built from current market structure, momentum, derivatives positioning, and sentiment:

- **15 pts** Fear & Greed contribution from Alternative.me
- **35 pts** Market bias from Coinbase spot regime plus 24h and 7d BTC change
- **25 pts** Momentum from Coinbase hourly RSI and MACD
- **25 pts** Derivatives positioning from Binance funding, basis, open interest, and taker flow

### Component formulas

```text
fear_greed_score = scoreBand(fng, 35, 65) * 15

regime_score = scoreBand(((price - ema200) / ema200) * 100, -4, 4)
day_score = scoreBand(price_change_24h, -3, 3)
week_score = scoreBand(price_change_7d, -8, 8)
market_bias_score = round((regime_score * 0.45 + day_score * 0.20 + week_score * 0.35) * 35)

macd_score = scoreBand(macd_histogram, -120, 120)
rsi_score = scoreBand(rsi14, 42, 58)
momentum_score = round((macd_score * 0.55 + rsi_score * 0.45) * 25)

funding_score = scoreBand_or_extreme_cap(funding_rate)
basis_score = scoreBand(basis_pct, -0.08, 0.08)
oi_score = scoreBand(open_interest_change_1h, -2.5, 2.5)
taker_score = scoreBand(taker_buy_sell_ratio, 0.96, 1.04)
derivatives_score = round((funding_score * 0.30 + basis_score * 0.20 + oi_score * 0.30 + taker_score * 0.20) * 25)

final_score = clamp(
  market_bias_score + momentum_score + derivatives_score + fear_greed_score,
  -100,
  100
)
```

## Canonical band map

| State | Score Range | Label |
|---|---:|---|
| 01 | -100 to -85 | Extremely Bearish |
| 02 | -84 to -75 | Very Strong Bearish |
| 03 | -74 to -65 | Strong Bearish |
| 04 | -64 to -55 | Firmly Bearish |
| 05 | -54 to -45 | Bearish |
| 06 | -44 to -35 | Moderately Bearish |
| 07 | -34 to -25 | Lean Bearish |
| 08 | -24 to -15 | Slightly Bearish |
| 09 | -14 to -5 | Mildly Bearish |
| 10 | -4 to +4 | Neutral |
| 11 | +5 to +14 | Mildly Bullish |
| 12 | +15 to +24 | Slightly Bullish |
| 13 | +25 to +34 | Lean Bullish |
| 14 | +35 to +44 | Moderately Bullish |
| 15 | +45 to +54 | Bullish |
| 16 | +55 to +64 | Firmly Bullish |
| 17 | +65 to +74 | Strong Bullish |
| 18 | +75 to +84 | Very Strong Bullish |
| 19 | +85 to +94 | Exceptionally Bullish |
| 20 | +95 to +100 | Extremely Bullish |

## Generation policy

V1 product behavior:

- Evaluate the composite score **hourly**
- Map the score to one of the **20 canonical states**
- Update the live creature only when the mapped state changes
- Use **pre-generated stills and animation loops** for each state

## Why pre-generate

Pre-generating the 20 states gives the product:

- stronger identity consistency
- lower runtime cost
- instant state switching
- more reliable animation quality
- tighter artistic control
