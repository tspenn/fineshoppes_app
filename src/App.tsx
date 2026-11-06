import { useEffect, useMemo, useState } from "react";
import {
  checkoutLabel,
  isProductPhoto,
  mixByShop,
  shopById,
  type Catalog,
  type Product,
  type Shop,
} from "./catalog.ts";

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

  useEffect(() => {
    let gone = false;
    let followUp = 0;

    async function load(url: string) {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("The catalog did not load.");
      const data = (await response.json()) as Catalog;
      return { data, refreshing: response.headers.get("X-Catalog-Refreshing") === "yes" };
    }

    async function pullLive(again = false) {
      try {
        const live = await load("/api/catalog");
        if (!gone && live.data.products.length > 0) setCatalog(live.data);
        if (live.refreshing && !again) {
          followUp = window.setTimeout(() => {
            void pullLive(true);
          }, 20000);
        }
      } catch {
        // The saved catalog stays on screen when a live pull is unavailable.
      }
    }

    load("/catalog.json")
      .then((saved) => {
        if (!gone) setCatalog(saved.data);
      })
      .catch(() => {
        if (!gone) setError("The catalog did not load.");
      })
      .finally(() => {
        void pullLive();
      });

    const timer = window.setInterval(() => {
      void pullLive();
    }, 10 * 60 * 1000);

    return () => {
      gone = true;
      window.clearTimeout(followUp);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    writeQuery(q, shopId);
  }, [q, shopId]);

  const shops = catalog?.shops ?? [];
  const shop = catalog && shopId ? shopById(catalog, shopId) : undefined;
  const needle = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!catalog) return [];
    return catalog.products.filter((product) => {
      if (shopId && product.shop !== shopId) return false;
      if (!shopId && !isProductPhoto(product)) return false;
      if (!needle) return true;
      const owner = shopById(catalog, product.shop);
      const haystack = `${product.title} ${owner?.name ?? ""} ${product.id}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [catalog, needle, shopId]);

  const shopIds = shops.map((item) => item.id);
  const fresh = shopId
    ? filtered.filter((product) => product.fresh).sort((a, b) => (b.added ?? "").localeCompare(a.added ?? ""))
    : mixByShop(
        filtered.filter((product) => product.fresh),
        shopIds,
      );
  const rest = shopId
    ? filtered.filter((product) => !product.fresh)
    : mixByShop(
        filtered.filter((product) => !product.fresh),
        shopIds,
      );

  function goHome(event: { preventDefault: () => void }) {
    event.preventDefault();
    setQ("");
    setShopId("");
  }

  const atHome = !needle && !shopId;

  return (
    <div className="page">
      <a className="mobile-header" href="/" onClick={goHome}>
        <img src="/banner-shops.jpg" alt="Fineshoppes" />
      </a>
      <header className="site-header">
        <a className="brand" href="/" onClick={goHome}>
          <img className="logo" src="/fineshoppes-logo.png" alt="" />
          <p className="tagline">Carefully curated especially for you!</p>
        </a>
        <nav>
          <a href="/" aria-current={atHome ? "page" : undefined} onClick={goHome}>
            Home
          </a>
        </nav>
      </header>
      <img className="banner" src="/banner-shops.jpg" alt="Fineshoppes storefront banner" />

      <main>
      <div className="intro">
        <h1>Our Shops at Fineshoppes!</h1>
      </div>

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
        <button
          type="button"
          aria-pressed={shopId === "" && !needle}
          onClick={() => {
            setQ("");
            setShopId("");
          }}
        >
          Home
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

      {shop ? <ShopHeading shop={shop} /> : null}

      {catalog && filtered.length === 0 ? (
        <p className="status">{shop ? "No items indexed yet." : "Nothing matches that search."}</p>
      ) : null}
      {catalog && fresh.length > 0 ? (
        <>
          <p className="section-label">New additions</p>
          <Mosaic products={fresh} catalog={catalog} />
        </>
      ) : null}
      {catalog && rest.length > 0 ? <Mosaic products={rest} catalog={catalog} /> : null}

      </main>
      <footer>
        <p>© {new Date().getFullYear()} Fineshoppes</p>
      </footer>
    </div>
  );
}

function ShopHeading({ shop }: { shop: Shop }) {
  return (
    <div className="shop-heading">
      <h2>{shop.name}</h2>
      {shop.tagline ? <p>{shop.tagline}</p> : null}
      <p className="checkout">{checkoutLabel(shop.checkout)}</p>
      <a href={shop.url} target="_blank" rel="noopener noreferrer">
        Open shop
      </a>
    </div>
  );
}

function Mosaic({ products, catalog }: { products: Product[]; catalog: Catalog }) {
  return (
    <section className="mosaic" aria-label="Items">
      {products.map((product) => {
        const owner = shopById(catalog, product.shop);
        return <Tile key={product.id} product={product} name={owner?.name ?? "Shop"} />;
      })}
    </section>
  );
}

function Tile({ product, name }: { product: Product; name: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = isProductPhoto(product) && !failed;
  return (
    <a
      className="tile"
      href={product.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${product.title}. ${name}`}
    >
      {showImage && product.image ? (
        <img
          src={product.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="frame">{product.title}</span>
      )}
      {showImage ? <span className="title">{product.title}</span> : null}
      <span className="store">{name}</span>
    </a>
  );
}
