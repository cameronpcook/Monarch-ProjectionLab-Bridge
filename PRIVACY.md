# Privacy Policy — Monarch → ProjectionLab Bridge

**Last updated:** October 31, 2026

## Overview

Monarch → ProjectionLab Bridge ("the Extension") syncs financial data from Monarch Money into ProjectionLab. It has no server of its own: it talks only to Monarch and ProjectionLab, directly from your browser.

## What the Extension stores (on your device only)

All of this is kept in the browser's extension storage (`chrome.storage.local`, or Safari's equivalent) on your computer:

- **Monarch credentials:** your email and password, used to sign in to Monarch's API.
- **Monarch session token:** saved so you don't have to sign in on every use.
- **2FA (TOTP) secret:** only if you choose to save it. Codes are generated in your browser with the Web Crypto API.
- **ProjectionLab Plugin API key:** used to read from and write to ProjectionLab.
- **Cached data and configuration:** account balances, budget categories and amounts, ProjectionLab accounts and expenses, and your mappings, merges and settings.

This storage isn't encrypted. Anyone with access to your computer account could read it.

## Where data is sent

| Service | Purpose | Data sent |
|---|---|---|
| Monarch Money (`api.monarch.com`) | Sign in and read account and budget data | Your credentials (at sign-in), your session token, 2FA codes |
| ProjectionLab (`app.projectionlab.com`) | Read your plan and write synced values | Your Plugin API key, account balances, expense amounts (through the Plugin API in your open ProjectionLab tab) |

Nothing is sent anywhere else. There are no analytics, tracking or ads, and no data is sold or shared.

## Your control

- **Export:** Settings → Backup & Restore exports your mappings and settings to a file. Backup files never include your credentials, ProjectionLab key or 2FA secret.
- **Delete:** removing the extension deletes all of its stored data.

## Open source

You can review the complete source code to verify these practices:
https://github.com/cameronpcook/Monarch-ProjectionLab-Bridge

Questions or concerns: please open an issue on that repository.
