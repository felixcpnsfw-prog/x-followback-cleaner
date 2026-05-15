(function initDonateConfig() {
  "use strict";

  globalThis.XFBC_DONATE_CONFIG = {
    coffeeUrl: "https://www.buymeacoffee.com/ProfitKatze",
    stablecoin: {
      enabled: true,
      label: "Stablecoin",
      tokenHint: "USDT / USDC",
      checkoutUrl: "",
      address: "0x460f5e356b74701E9e8AE8DAa50126bE3968C475",
      network: "EVM-compatible",
      setupHint: "Stablecoin support is ready. Add your Epusdt checkout URL or public wallet address in extension/lib/donate-config.js."
    }
  };
})();
