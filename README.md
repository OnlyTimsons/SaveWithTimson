# VoucherHunt

A Chrome extension that automatically finds and tries discount codes on Shopify checkouts.

Navigate to any Shopify checkout, click the extension, and it searches Reddit, coupon sites, and common code patterns to find working discounts — no API keys needed.

<p align="center">
  <img src="screenshots/searching.png" width="420" alt="Searching for codes">
  &nbsp;&nbsp;
  <img src="screenshots/found.png" width="420" alt="Code found">
</p>

## How it works

1. **Lookup** — Searches Reddit and coupon aggregator sites for codes matching the store
2. **Generate** — Creates likely codes from the brand name + current season/holidays
3. **Common codes** — Tries well-known Shopify patterns (`WELCOME10`, `SAVE20`, etc.)
4. **Test** — Enters each code, clicks Apply, detects success or failure, keeps the best one

## Install

1. Clone this repo
2. Open `chrome://extensions` → enable **Developer mode**
3. Click **Load unpacked** → select the repo folder
4. Navigate to a Shopify checkout and click the extension icon

## Features

- Works on any Shopify store, in any language (EN, DE, FR, ES, IT, NL, PT)
- Tests up to 60 codes per batch, with option to keep going
- Remembers working codes per store
- Runs in the background — switch tabs and come back
- Popup reconnects to active searches after close/reopen
- Zero API keys — Reddit `.json` endpoint + HTML scraping

## Project structure

```
├── manifest.json           Manifest V3 config
├── background/
│   └── service-worker.js   Orchestration + code discovery
├── content/
│   └── shopify.js          Shopify checkout DOM interaction
├── lib/
│   ├── lookup.js           Reddit + coupon site scrapers
│   ├── generator.js        Smart code generation
│   ├── codes.js            Common Shopify discount codes
│   └── seasons.js          Season/holiday detection
└── popup/
    ├── popup.html
    ├── popup.css
    └── popup.js
```

## License

MIT
