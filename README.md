# Monarch → ProjectionLab Bridge

A Chrome and Safari extension that syncs account balances and budget data from [Monarch Money](https://monarchmoney.com) into [ProjectionLab](https://projectionlab.com), so your financial projections stay current without manual entry.

The extension talks to Monarch **directly from your browser**. There's no server, proxy or account to sign up for.

> Originally created by [Trey Corple](https://github.com/Treygec/Monarch-ProjectionLab-Bridge). This version removes the hosted service and the local proxy, and adds Safari support.

<p align="center">
  <img src="docs/screenshots/sync%20preview.png" alt="Sync preview showing accounts and budgets ready to push" width="700" />
</p>

---

## Why?

Monarch Money is great at tracking what you **have** and what you **spend**. ProjectionLab is great at projecting where you're **headed**. This extension bridges the two — pull real account balances and spending data from Monarch and push them into ProjectionLab's plans, so your projections always start from reality and stay there.

---

## Features

### Account Mapping
Connect each Monarch account to a ProjectionLab account. Use **Auto-map by name** for one-click fuzzy matching, or pick manually from a dropdown grouped by account type. Don't see a match? Create new PL accounts right from the dropdown — individually or in bulk with **Create all unmapped**.

<p align="center">
  <img src="docs/screenshots/map%20or%20create%20new%20accounts.png" alt="Account mapping with dropdown selector and inline account creation" width="700" />
</p>

### Budget Mapping
Map Monarch budget categories to ProjectionLab plan expenses. Choose whether to sync your **budgeted** (planned) amounts or **actual** historical spending with configurable lookback windows and averaging — override the source per category or per group.

<p align="center">
  <img src="docs/screenshots/use%20budgeted%20or%20actual%20spending.png" alt="Budget mapping with budgeted vs actual source selector" width="700" />
</p>

### Merges
Combine multiple Monarch accounts or budget categories into a single ProjectionLab entry. Roll all your checking + savings into one "Cash" balance, map a mortgage balance with a zillow value into one Home asset in PL, or group related spending like "Diapers", "Child Care", and "Baby Sitting" into a single "Childcare" expense — then apply it across any combination of plans.

<p align="center">
  <img src="docs/screenshots/combine%20accounts%20and%20budgets%20together.png" alt="Merge groups combining accounts and budget categories" width="700" />
</p>

### Sync Preview
Before anything is written, review every value that will be pushed. Account items show the mapped balance; budget items show the converted amount at the target frequency. One click to push it all to ProjectionLab.

<p align="center">
  <img src="docs/screenshots/sync%20preview.png" alt="Sync preview with accounts and budgets" width="700" />
</p>

---

## How it works

- **Monarch:** you enter your Monarch email and password once. The extension signs in to Monarch's API (`api.monarch.com`) from your browser and saves the session, so you don't sign in again until it expires.
- **ProjectionLab:** the extension writes through ProjectionLab's official Plugin API, using your Plugin API key, in an open ProjectionLab tab.
- **Your data:** everything stays in your browser's extension storage. Nothing is sent anywhere except Monarch and ProjectionLab.

> **Heads-up:** Monarch has no official public API, and its [Terms of Use](https://www.monarch.com/terms) prohibit accessing the service "programmatically by macro or other automated means." Read them and decide for yourself before using this. Monarch could change its API and break the extension at any time.

---

## Install

### Chrome (or any Chromium browser: Edge, Brave, Vivaldi, Arc)

1. Download this repo: click the green **Code** button, then **Download ZIP**, and unzip it. Put the folder somewhere permanent, such as your home folder, not Downloads.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `monarch-extension` folder.
4. Pin the extension to your toolbar.

**Updating without losing your settings:** replace the files *inside the same folder* with the new version, then click the **↻ reload** icon on the extension's card in `chrome://extensions`. If you remove the extension or load it from a different folder, Chrome treats it as a new extension and your saved login, key and mappings start empty. To be safe, use **Settings → Backup & Restore → Export to File** before updating.

### Safari (Mac)

Safari extensions have to be wrapped in a small Mac app, which you build once with Xcode. See [`safari/README.md`](safari/README.md).

---

## Getting Started

### 1 — Connect ProjectionLab

Open [ProjectionLab](https://app.projectionlab.com) in a tab. In the extension's **Setup** tab, paste your Plugin API key (ProjectionLab → Account Settings → Plugins) and click **Fetch from PL**.

### 2 — Connect Monarch

Enter your Monarch email and password and click **Load from Monarch**. If you use two-factor authentication, enter the 6-digit code when asked. After that, the extension reuses your Monarch session until it expires.

### 3 — Map your accounts

Go to **Mapping → Accounts**. Use **Auto-map by name** for a head start, then fine-tune. Accounts without a PL match can be created inline or in bulk with **Create all unmapped**.

### 4 — Map your budgets

Go to **Mapping → Budgets**. Connect each Monarch category to a PL plan expense, choose which plans to apply it to, and pick the expense frequency. Select **Actual** as the source to use real spending instead of budgeted amounts.

### 5 — Set up merges (optional)

Use the **Merge** tab to combine multiple Monarch accounts or budget categories into single PL entries.

### 6 — Sync

Go to the **Sync** tab, review the preview, and click **Push to ProjectionLab**.

---

## Saved login and two-factor codes

Your Monarch email, password, session and ProjectionLab key are saved in the extension's local storage, so you only enter them once.

If your Monarch account uses an authenticator app, you can save its secret key in **Settings → Monarch Authentication**. The extension then generates the 6-digit codes itself whenever it needs to sign in again.

**Security note:** this storage isn't encrypted. Anyone with access to your computer account could read it. Only save your password and 2FA secret on a computer you trust. Backup files never include them. To avoid saving your password, turn off **Settings → Monarch Login → Remember Monarch Password**. The extension then keeps only your Monarch session, and you type your password again when it expires.

## Sync reminder

If you haven't synced for a while (7 days by default), the toolbar icon shows a small badge such as "8d". Change or disable it in **Settings → Sync → Sync Reminder**. It's only a reminder: the extension never syncs or contacts Monarch on its own.

---

## Development

The extension itself needs no build step. To run the automated tests (Node.js 22+):

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm test
```

The tests use fake Monarch and ProjectionLab responses, so they need no accounts or network access. They also run automatically on GitHub for every push.

## Contributing

Pull requests are welcome. Please open an issue first for significant changes.

## License

[MIT](LICENSE). Original work © Trey Corple.
