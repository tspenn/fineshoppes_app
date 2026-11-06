/**
 * Rebuild public/catalog.json from the live shop list.
 * Product rows come from each shop's sitemap (/shop/, /product/, /products/).
 * A handful of new items are marked fresh and shown under New additions.
 * A long drop from one shop, such as a new Shopify vendor, is not.
 */

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const BULK_NEW = 25;
const IMAGE_WORKERS = 12;

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
    collection: "walk-by-faith",
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
  const words = decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\ball over print\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function locsFromSitemap(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
}

const COLLECTION_QUERY = `
  query GetCollectionProducts($handle: String!, $first: Int!, $after: String) {
    collection(handle: $handle) {
      products(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            title
            handle
            images(first: 1) { edges { node { url } } }
          }
        }
      }
    }
  }
`;

async function collectionProducts(shop, siteUrl) {
  const page = await getText(siteUrl);
  const bundlePath = page.text.match(/\/assets\/shopify-[^"]+\.js/)?.[0];
  if (!bundlePath) throw new Error(`no storefront script for ${shop.id}`);
  const bundle = await getText(new URL(bundlePath, page.finalUrl).href);
  const endpoint = bundle.text.match(/https:\/\/[^`"']+\/graphql\.json/)?.[0];
  const token = bundle.text.match(/`([a-f0-9]{32})`/)?.[1];
  if (!endpoint || !token) throw new Error(`no storefront access for ${shop.id}`);

  const products = [];
  let after = null;
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": token,
      },
      body: JSON.stringify({
        query: COLLECTION_QUERY,
        variables: { handle: shop.collection, first: 250, after },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`${response.status} ${shop.id} collection`);
    const payload = await response.json();
    const connection = payload.data?.collection?.products;
    if (!connection) break;
    for (const edge of connection.edges) {
      const node = edge.node;
      if (!node?.handle) continue;
      const image = node.images?.edges?.[0]?.node?.url ?? "";
      products.push({
        id: `${shop.id}/${node.handle}`,
        shop: shop.id,
        title: node.title,
        url: new URL(`/catalog/${node.handle}`, siteUrl).href,
        ...(image ? { image } : {}),
      });
    }
    if (!connection.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }
  return products;
}

async function productsFor(shop, siteUrl) {
  if (shop.collection) return collectionProducts(shop, siteUrl);
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

let refreshing = null;

export function updateCatalog() {
  if (!refreshing) {
    refreshing = buildCatalog().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function buildCatalog() {
  const catalogShops = [];
  const products = [];

  for (const shop of shops) {
  let siteUrl = shop.url;
  try {
    const page = await getText(shop.url);
    siteUrl = page.finalUrl;
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
  });
  console.log(`${shop.id}: ${found.length} products`);
}

const catalogPath = new URL("../public/catalog.json", import.meta.url);
let previous = null;
try {
  previous = JSON.parse(await readFile(catalogPath, "utf8"));
} catch {
  previous = null;
}

const previousByUrl = new Map((previous?.products ?? []).map((product) => [product.url, product]));
const hadCatalog = previousByUrl.size > 0;
const now = new Date().toISOString();
const newcomers = new Map();

for (const product of products) {
  const prior = previousByUrl.get(product.url);
  if (prior?.image && !prior.image.includes("r2.dev/lovp_")) product.image = prior.image;
  if (prior?.fresh) {
    product.fresh = true;
    product.added = prior.added;
  } else if (hadCatalog && !prior) {
    const list = newcomers.get(product.shop) ?? [];
    list.push(product);
    newcomers.set(product.shop, list);
  }
}

let freshCount = 0;
let bulkCount = 0;
for (const [shopId, list] of newcomers) {
  if (list.length >= BULK_NEW) {
    bulkCount += list.length;
    console.log(`${shopId}: ${list.length} new items kept in the main list`);
    continue;
  }
  for (const product of list) {
    product.fresh = true;
    product.added = now;
    freshCount += 1;
  }
}

const missingImages = products.filter((product) => !product.image);
console.log(`fetching ${missingImages.length} images`);
let fetched = 0;
await mapPool(missingImages, IMAGE_WORKERS, async (product) => {
  product.image = await productImage(product.url);
  fetched += 1;
  if (fetched % 100 === 0) console.log(`images ${fetched}/${missingImages.length}`);
});

const catalog = {
  updated: now,
  shops: catalogShops,
  products,
};

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(
    `wrote ${products.length} products, ${freshCount} new additions, ${bulkCount} from a bulk drop`,
  );
  return catalog;
}

const launchedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (launchedDirectly) {
  updateCatalog().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function absoluteImage(value, pageUrl) {
  const raw = decodeHtml(String(value)).trim();
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  return new URL(raw, pageUrl).href;
}

function productImageFromHtml(html, pageUrl) {
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  if (block) {
    try {
      const data = JSON.parse(block);
      const product = data?.["@type"] === "Product" ? data : null;
      const image = Array.isArray(product?.image) ? product.image[0] : product?.image;
      const src = typeof image === "string" ? image : image?.url;
      if (src) return absoluteImage(src, pageUrl);
    } catch {
      // The share image below is the fallback.
    }
  }
  const og = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  return og ? absoluteImage(og, pageUrl) : "";
}

async function productImage(pageUrl) {
  try {
    const page = await getText(pageUrl);
    return productImageFromHtml(page.text, page.finalUrl);
  } catch {
    return "";
  }
}

async function mapPool(items, limit, task) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await task(items[index], index);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}
