# Stablecoin Donations

The extension supports a quiet stablecoin donate entry in the popup footer.

Configure it in:

```text
extension/lib/donate-config.js
```

## Recommended Epusdt Setup

Use Epusdt as a self-hosted payment gateway and expose one public donation checkout URL from your own backend.

Do not put the Epusdt `secret_key` in the Chrome extension. The extension is client-side code, so any bundled secret can be inspected by users.

Recommended flow:

1. Deploy Epusdt.
2. Create merchant credentials in the Epusdt admin panel.
3. Build a small backend endpoint that creates a donation order with Epusdt.
4. Return or redirect to Epusdt's hosted checkout `payment_url`.
5. Put that public donation URL in `stablecoin.checkoutUrl`.

```js
globalThis.XFBC_DONATE_CONFIG = {
  coffeeUrl: "https://www.buymeacoffee.com/ProfitKatze",
  stablecoin: {
    enabled: true,
    label: "Stablecoin",
    tokenHint: "USDT / USDC",
    checkoutUrl: "https://pay.example.com/donate/profitkatze",
    address: "",
    network: ""
  }
};
```

## Simple Address Mode

If you do not want a payment gateway yet, you can show a public wallet address instead.

```js
stablecoin: {
  enabled: true,
  label: "Stablecoin",
  tokenHint: "USDT",
  checkoutUrl: "",
  address: "YOUR_PUBLIC_WALLET_ADDRESS",
  network: "TRC20"
}
```

Always make the token and network explicit. Sending a stablecoin on the wrong network can permanently lose funds.
