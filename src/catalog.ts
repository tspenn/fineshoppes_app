export type Checkout = "pay" | "shopify";

export type Shop = {
  id: string;
  name: string;
  tagline: string;
  url: string;
  checkout: Checkout | null;
};

export type Product = {
  id: string;
  shop: string;
  title: string;
  url: string;
};

export type Catalog = {
  updated: string;
  shops: Shop[];
  products: Product[];
};

export function checkoutLabel(checkout: Checkout | null) {
  if (checkout === "pay") return "Checkout on pay.fineshoppes.com";
  if (checkout === "shopify") return "Checkout on buy.fineshoppes.com";
  return "Checkout opens from the shop";
}

export function shopById(catalog: Catalog, id: string) {
  return catalog.shops.find((shop) => shop.id === id);
}
