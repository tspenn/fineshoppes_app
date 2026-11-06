import { useEffect, useMemo, useState } from "react";
import { checkoutLabel, shopById, type Catalog, type Shop } from "./catalog.ts";

const PAGE = 48;

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    shop: params.get("shop") ?? "",
  };
}

function writeQuery(q: string, shop: string) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (shop) params.set("shop", shop);
  const search = params.toString();
  const next = search ? `/?${search}` : "/";
  window.history.replaceState(null, "", next);
}

export default function App() {
  const initial = readQuery();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState(initial.q);
  const [shopId, setShopId] = useState(initial.shop);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let gone = false;
    fetch("/catalog.json")
      .then((response) => {
        if (!response.ok) throw new Error("The catalog did not load.");
        return response.json() as Promise<Catalog>;
      })
      .then((data) => {
        if (!gone) setCatalog(data);
      })
      .catch(() => {
        if (!gone) setError("The catalog did not load.");
      });
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    writeQuery(q, shopId);
    setShown(PAGE);
  }, [q, shopId]);

  const shops = catalog?.shops ?? [];
  const shop = catalog && shopId ? shopById(catalog, shopId) : undefined;
  const needle = q.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!catalog) return [];
    return catalog.products.filter((product) => {
      if (shopId && product.shop !== shopId) return false;
      if (!needle) return Boolean(shopId);
      const owner = shopById(catalog, product.shop);
      const haystack = `${product.title} ${owner?.name ?? ""} ${product.id}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [catalog, needle, shopId]);

  const visibleShops = useMemo(() => {
    if (!catalog || shopId) return [];
    if (!needle) return catalog.shops;
    return catalog.shops.filter((item) => {
      const haystack = `${item.name} ${item.tagline}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [catalog, needle, shopId]);

  const browsingShops = !needle && !shopId;

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">The shops</p>
          <h1>Fineshoppes</h1>
        </div>
        <a className="directory" href="https://fineshoppes.com/">
          All shops
        </a>
      </header>

      <p className="lede">
        Search the catalog, then open the item on its shop. The shop sends checkout to
        pay.fineshoppes.com or buy.fineshoppes.com.
      </p>

      <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="q">Search shops and items</label>
        <input
          id="q"
          value={q}
          placeholder="Tote, scarf, soap, shop name"
          autoComplete="off"
          onChange={(event) => setQ(event.target.value)}
        />
      </form>

      <div className="shops" role="listbox" aria-label="Shops">
        <button type="button" aria-pressed={shopId === ""} onClick={() => setShopId("")}>
          All shops
        </button>
        {shops.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={shopId === item.id}
            onClick={() => setShopId(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>

      {error ? <p className="status">{error}</p> : null}
      {!catalog && !error ? <p className="status">Loading the shops…</p> : null}

      {shop ? (
        <ShopBanner shop={shop} count={matches.length} />
      ) : null}

      {browsingShops ? (
        <section className="grid" aria-label="Shops">
          {shops.map((item) => (
            <ShopCard key={item.id} shop={item} onOpen={() => setShopId(item.id)} />
          ))}
        </section>
      ) : null}

      {!browsingShops && catalog ? (
        <>
          {visibleShops.length > 0 ? (
            <section className="grid" aria-label="Matching shops">
              {visibleShops.map((item) => (
                <ShopCard key={item.id} shop={item} onOpen={() => setShopId(item.id)} />
              ))}
            </section>
          ) : null}
          {matches.length === 0 && !shop ? (
            <p className="status">Nothing in the catalog matches that search.</p>
          ) : matches.length === 0 ? null : (
            <section className="grid" aria-label="Items">
              {matches.slice(0, shown).map((product) => {
                const owner = shopById(catalog, product.shop);
                return (
                  <article key={product.id} className="card">
                    <p className="shop-name">{owner?.name ?? product.shop}</p>
                    <h2>{product.title}</h2>
                    <p className="checkout">{checkoutLabel(owner?.checkout ?? null)}</p>
                    <a className="open" href={product.url} target="_blank" rel="noopener noreferrer">
                      View at {owner?.name ?? "the shop"}
                    </a>
                  </article>
                );
              })}
            </section>
          )}
          {shown < matches.length ? (
            <button className="more" type="button" onClick={() => setShown((count) => count + PAGE)}>
              Show more ({matches.length - shown} left)
            </button>
          ) : null}
        </>
      ) : null}

      <footer>
        <p>A directory of the shops. Descriptions, choices, and checkout stay on the shop.</p>
      </footer>
    </div>
  );
}

function ShopBanner({ shop, count }: { shop: Shop; count: number }) {
  return (
    <div className="banner-shop">
      <div>
        <h2>{shop.name}</h2>
        {shop.tagline ? <p>{shop.tagline}</p> : null}
        <p className="checkout">{checkoutLabel(shop.checkout)}</p>
        <p className="count">{count === 0 ? "No items indexed yet." : `${count} items in the catalog.`}</p>
      </div>
      <a className="open" href={shop.url} target="_blank" rel="noopener noreferrer">
        Open {shop.name}
      </a>
    </div>
  );
}

function ShopCard({ shop, onOpen }: { shop: Shop; onOpen: () => void }) {
  return (
    <article className="card">
      <h2>{shop.name}</h2>
      {shop.tagline ? <p>{shop.tagline}</p> : null}
      <p className="checkout">{checkoutLabel(shop.checkout)}</p>
      <div className="actions">
        <button type="button" onClick={onOpen}>
          Items
        </button>
        <a className="open" href={shop.url} target="_blank" rel="noopener noreferrer">
          Open shop
        </a>
      </div>
    </article>
  );
}
