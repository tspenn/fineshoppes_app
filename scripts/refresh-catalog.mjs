/**
 * Rebuild public/catalog.json from the live shop list.
 * Product rows come from each shop's sitemap (/shop/, /product/, /products/).
 * Checkout is pay.fineshoppes.com or buy.fineshoppes.com when the shop page says so.
 */

const shops = [
  {
    id: "adored",
    name: "Adored",
    tagline: "",
    url: "https://adored.fineshoppes.com/",
  },
  {
    id: "alley",
    name: "Back Alley Shoppe",
    tagline: "",
    url: "https://alley.fineshoppes.com/",
    checkout: "pay",
  },
  {
    id: "bewell",
    name: "BeWell",
    tagline: "Clean, natural skincare",
    url: "https://bewell.fineshoppes.com/",
  },
  {
    id: "boho",
    name: "BOHO",
    tagline: "",
    url: "https://www.bohostylemag.com/catalog",
    paths: ["/catalog/"],
  },
  {
    id: "everest",
    name: "Everest",
    tagline: "Skincare and self-care",
    url: "https://everest.fineshoppes.com/",
  },
  {
    id: "home",
    name: "Fineshoppes Home",
    tagline: "Pull up a chair. Stay a while.",
    url: "https://home.fineshoppes.com/",
    checkout: "shopify",
  },
  {
    id: "kindr",
    name: "Kindr",
    tagline: "",
    url: "https://kindr.fineshoppes.com/",
  },
  {
    id: "senses",
    name: "Senses Marketplace",
    tagline: "Soaps, skin therapy, and more",
    url: "https://senses.fineshoppes.com/",
  },
  {
    id: "steward",
    name: "Steward Limited",
    tagline: "",
    url: "http://stewardlimited.com/",
  },
  {
    id: "tsteele",
    name: "T Steele Art",
    tagline: "Enter the mind of the artist — Tina Steele Penn",
    url: "https://tsteele.art/",
  },
  {
    id: "faith",
    name: "Walking By Faith",
    tagline: "A magazine of faith, hope, and everyday grace",
    url: "https://faith.skylandpublishing.com/catalog",
    checkout: "pay",
    sitemap: false,
  },
  {
    id: "skyland",
    name: "Skyland Apps",
    tagline: "Tech store · browser-native tools",
    url: "https://www.skylandapps.com/",
    sitemap: false,
  },
];

function titleFromPath(pathname) {
  const slug = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const words = decodeURIComponent(slug).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "Shop item";
  return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sameSite(left, right) {
  const host = (value) => new URL(value).hostname.replace(/^www\./, "");
  return host(left) === host(right);
}

function isProductPath(pathname, extraPrefixes) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/shop/") || path.startsWith("/product/") || /^\/products\/[^/]+/.test(path)) return true;
  return extraPrefixes.some((prefix) => path.startsWith(prefix) && path !== prefix.replace(/\/$/, ""));
}

async function getText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "FineshoppesCatalog/0.1" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return { text: await response.text(), finalUrl: response.url };
}

function checkoutFromHtml(html, preset) {
  if (preset === "pay" || preset === "shopify") return preset;
  const pay = html.includes("pay.fineshoppes.com");
  const shopify = html.includes("buy.fineshoppes.com");
  if (pay && !shopify) return "pay";
  if (shopify && !pay) return "shopify";
  if (pay && shopify) return "pay";
  return null;
}

function locsFromSitemap(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
}

async function productsFor(shop, siteUrl) {
  if (shop.sitemap === false) return [];
  const origin = new URL(siteUrl).origin;
  let xml;
  try {
    xml = (await getText(new URL("/sitemap.xml", origin).href)).text;
  } catch (error) {
    console.warn(`sitemap skipped for ${shop.id}: ${error.message}`);
    return [];
  }

  let locs = locsFromSitemap(xml);
  if (xml.includes("<sitemapindex")) {
    const nested = [];
    for (const loc of locs) {
      try {
        nested.push(...locsFromSitemap((await getText(loc)).text));
      } catch (error) {
        console.warn(`nested sitemap skipped ${loc}: ${error.message}`);
      }
    }
    locs = nested;
  }

  const products = [];
  const seen = new Set();
  for (const loc of locs) {
    let url;
    try {
      url = new URL(loc);
    } catch {
      continue;
    }
    if (!sameSite(url.href, siteUrl) || !isProductPath(url.pathname, shop.paths ?? []) || seen.has(url.pathname)) continue;
    seen.add(url.pathname);
    const slug = url.pathname.split("/").filter(Boolean).at(-1);
    products.push({
      id: `${shop.id}/${slug}`,
      shop: shop.id,
      title: titleFromPath(url.pathname),
      url: url.href,
    });
  }
  return products;
}

const catalogShops = [];
const products = [];

for (const shop of shops) {
  let checkout = shop.checkout ?? null;
  let siteUrl = shop.url;
  try {
    const page = await getText(shop.url);
    siteUrl = page.finalUrl;
    checkout = checkoutFromHtml(page.text, shop.checkout ?? null);
  } catch (error) {
    console.warn(`homepage skipped for ${shop.id}: ${error.message}`);
  }
  const found = await productsFor(shop, siteUrl);
  products.push(...found);
  catalogShops.push({
    id: shop.id,
    name: shop.name,
    tagline: shop.tagline,
    url: shop.url,
    checkout,
  });
  console.log(`${shop.id}: ${found.length} products, checkout ${checkout ?? "on the shop"}`);
}

const catalog = {
  updated: new Date().toISOString(),
  shops: catalogShops,
  products,
};

const { writeFile } = await import("node:fs/promises");
await writeFile(new URL("../public/catalog.json", import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`wrote ${products.length} products across ${catalogShops.length} shops`);
