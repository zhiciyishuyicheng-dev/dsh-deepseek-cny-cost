# dsh-deepseek-cny-cost

**See what the chat you are reading has cost, in CNY, inside the DeepSeek Harness Web GUI.**

A small badge sits under the composer next to the session statistics:

```
≈¥0.0123
```

- The number is the running total for **the chat you are looking at**; switching chats switches the number, and it grows as the chat works;
- Hovering (or a screen reader) reveals the breakdown: uncached input, cache-hit input, and output tokens, each with its own cost;
- It renders only while the selected provider is a DeepSeek official route, because third-party relays are not billed at DeepSeek's peak / off-peak rates.

## How it prices

It reads two projections the session already exposes and issues no requests of its own:

| Data | Source |
| --- | --- |
| Token usage | `tokenUsage` (`uncachedInputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `outputTokens`) |
| Current model | `modelSelection` |

Prices come from the official [Models & Pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) page (checked 2026-10), in CNY per million tokens:

| Model | Cache hit | Cache miss | Output |
| --- | --- | --- | --- |
| `deepseek-flash` | 0.04 | 2 | 8 |
| `deepseek-v4-pro` | 0.30 | 9 | 27 |

Those are **peak** rates. Off-peak is half of peak; peak is Beijing time Monday–Friday (excluding Chinese statutory holidays) 09:00–12:00 and 14:00–18:00, and every other hour — weekends and holidays included — is off-peak.

- Cache writes are billed at the cache-miss input rate, matching DeepSeek's rule that there is no separate write fee;
- Legacy names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are priced as Flash, per the official note;
- An unknown model name **hides the badge** instead of inventing a price.

## Known limits

- **An estimate, not an invoice.** It excludes per-request Search / Fetch charges; the official bill wins.
- **Chats that switched models** are priced with the currently selected model, because `tokenUsage` is a whole-chat total with no per-model split.
- **Holidays**: the built-in table covers 2026. A year without an entry falls back to weekends only, so its holiday weekdays would be priced as peak.
- Shown for DeepSeek official providers (`deepseek-official`, `deepseek-account`, or any new provider id starting with `deepseek`).

## Install

Desktop: **Plugins → Add plugin**, enter the **absolute path of this directory** (the installer records a `link:` dependency), then install and enable. Restart DSH completely if it asks, then refresh the page.

Command line, for a non-desktop profile:

```bash
dsh plugin --profile web add /absolute/path/to/dsh-deepseek-cny-cost
```

## Develop

```bash
node --check client.js
node tools/test-cny-cost.mjs   # pricing, peak windows, formatting, slot registration, component behavior
```

`client.js` is the whole browser half: a lazy factory registered through `window.__ModuleLoader__.load({ id, factory })`, with React supplied by the host module table. To make an edit take effect, remove the bundle and install it again from the same source (`ambiguous-install` otherwise).

## License

MIT.
