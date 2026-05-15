# Chrome Extension

This folder contains the browser-first version of X Followback Cleaner. It replaces the dependency on third-party snapshot extensions by capturing local snapshots from the X/Twitter tab you already have open.

Created by [@ProfitKatze](https://x.com/ProfitKatze).

The popup includes modest creator support links: [Buy me a coffee](https://www.buymeacoffee.com/ProfitKatze) and an optional stablecoin donate entry.

If you are loading the extension from Chrome's **Load unpacked** button, select either this `extension/` folder or the repository root `x-followback-cleaner/`. The repository root has a development manifest that points back into this folder.

## Install Locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `x-followback-cleaner/extension`.

## Workflow

1. Open any logged-in `https://x.com/` page.
2. Enter your handle in the popup, then run **Open + Scan** for followers.
3. When followers finish, run **Open + Scan** for following.
4. Wait for the following completion hint.
5. Choose both snapshots, click **Compare**, then **Export CSV** or **Fast API unfollow**.
6. For unfollow actions, review the confirmation panel, then click **Start batch**. The popup closes and the X page overlay handles pause, resume, and stop.

You can also enter your handle in the popup and use **Open + Scan** to navigate to the correct followers/following page and start scanning automatically.

Common official accounts such as `openai`, `tesla`, `spacex`, `x`, `google`, and `youtube` are protected by default. Add extra handles in **Protected handles** when you want to keep more accounts out of export and unfollow batches.

Snapshots are stored in `chrome.storage.local` on your machine. The extension does not ask for your password and does not send data to a server.

The extension requests `unlimitedStorage` because repeated follower snapshots can exceed Chrome's default local extension storage quota.

Stablecoin donations are configured in `lib/donate-config.js`. For Epusdt, keep the merchant `secret_key` on a backend and expose only a public checkout/donation URL to the extension.

## Current Scanner

The first scanner is DOM-based and API-free. It scrolls the open X page, reads visible user cells, stores unique handles, and stops when no new accounts appear for several passes.

Before scanning, the extension temporarily sets the active tab zoom to 67% so more user cells fit in each viewport. It restores the tab's original zoom when the scan finishes or errors.

That design is safer for an open-source default, but X markup can change. If the scanner starts missing users, update `content.js` selectors and keep the compare/export core unchanged.

## Assisted Unfollow

The unfollow feature is **Fast API mode**. It uses your logged-in X web session to call X's web friendship endpoint from the X tab, so it does not open each profile one by one. It waits between accounts, records progress locally, and stops on auth errors or rate limits.

The batch can be paused, resumed, or stopped from the on-page overlay. It can also be stopped from the popup before it closes. It does not use private API tokens and does not attempt to bypass platform limits.
