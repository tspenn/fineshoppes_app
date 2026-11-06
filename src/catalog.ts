export type Shop = {
  id: string;
  name: string;
  tagline: string;
  url: string;
};

export type Product = {
  id: string;
  shop: string;
  title: string;
  url: string;
  image?: string;
  fresh?: boolean;
  added?: string;
};

export function isProductPhoto(product: Product) {
  const image = product.image ?? "";
  if (!image) return false;
  if (product.url.includes("/catalog/category/")) return false;
  if (/product-share|banner|logo|header/i.test(image)) return false;
  if (/[-_]\d{6,}/.test(image)) return false;
  return true;
}

export function mixByShop(products: Product[], shopIds: string[]) {
  const buckets = new Map(shopIds.map((id) => [id, [] as Product[]]));
  const extras: Product[] = [];
  for (const product of products) {
    const bucket = buckets.get(product.shop);
    if (bucket) bucket.push(product);
    else extras.push(product);
  }
  const lists = [...buckets.values()].filter((list) => list.length > 0);
  const mixed: Product[] = [];
  const longest = lists.reduce((max, list) => Math.max(max, list.length), 0);
  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      const product = list[index];
      if (product) mixed.push(product);
    }
  }
  return mixed.concat(extras);
}

export type Catalog = {
  updated: string;
  shops: Shop[];
  products: Product[];
};

export function shopById(catalog: Catalog, id: string) {
  return catalog.shops.find((shop) => shop.id === id);
}
