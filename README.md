# Fineshoppes

A catalog you can install. Search the shops, then open that item on its own shop page.

The shop handles the choice and the cart. Checkout stays where that shop already sends it: [pay.fineshoppes.com](https://pay.fineshoppes.com) or [buy.fineshoppes.com](https://buy.fineshoppes.com). This app does not take payment.

## Run locally

```bash
npm install
npm run catalog
npm run dev
```

The app is at [http://127.0.0.1:4741](http://127.0.0.1:4741).

`npm run catalog` reads each shop sitemap and rewrites `public/catalog.json`. Each card uses the shop’s picture and links to that shop’s product page. A few new items are marked for the New additions row. A long drop from one shop, such as a new Shopify vendor, stays in the main mix. `npm run build` typechecks and builds the client.

## Host

This is its own site, separate from Pay. Point `app.fineshoppes.com` at this project with a CNAME to `cname.vercel-dns.com`.
