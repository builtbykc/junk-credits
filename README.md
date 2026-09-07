# Junk Credits

A mobile-friendly app for setting a weekly junk-food goal, checking in each day, and tracking earned and spent credits.

Live app: https://junkcredits.krishnachigurupati.chatgpt.site

## Features

- Earn credits by logging clean days and spend them when logging junk food.
- Edit previous entries and keep notes without double-counting credits.
- Adjust weekly goals while preserving historical earning rates.
- Confirm spending that would take the balance below zero.
- Store each signed-in user's wallet separately in Cloudflare D1.

## Development

Requires Node.js 22.13 or later and npm.

```sh
npm ci
npm run dev
```

The app uses React, TypeScript, vinext, Tailwind CSS, and Cloudflare Workers/D1. The existing Sites configuration lives in `.openai/hosting.json`; database migrations live in `drizzle/`.

Production identity is supplied by the Sites hosting platform. A separate deployment needs its own trusted authentication integration and D1 configuration. This repository contains application source and migrations, not production wallet data or runtime secrets.

## Checks

```sh
npm run lint
node --experimental-strip-types --test tests/*.test.mjs
npm run build
```

The existing tests cover credit calculations, balance migration, wallet persistence, user isolation, and conflicting edits.

## Deployment

The current application is hosted on Sites. This GitHub copy does not configure automatic deployment. Preserve the existing Sites project binding when updating that site; use your own project and database bindings for an independent deployment.
