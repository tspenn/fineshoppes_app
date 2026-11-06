import { readFile } from "node:fs/promises";
import { updateCatalog } from "./refresh-catalog.mjs";

const catalogPath = new URL("../public/catalog.json", import.meta.url);

export function catalogApi() {
  return {
    name: "catalog-api",
    configureServer(server) {
      server.middlewares.use("/api/catalog", (request, response, next) => {
        if (request.method !== "GET") {
          next();
          return;
        }
        void serveCatalog(response);
      });
    },
  };
}

async function serveCatalog(response) {
  let catalog = null;
  try {
    catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  } catch {
    catalog = null;
  }
  const updated = Date.parse(catalog?.updated ?? "");
  const stale = !catalog || Number.isNaN(updated) || Date.now() - updated > 10 * 60 * 1000;
  if (stale) void updateCatalog();
  response.setHeader("Content-Type", "application/json");
  response.setHeader("X-Catalog-Refreshing", stale ? "yes" : "no");
  response.end(JSON.stringify(catalog ?? { updated: "", shops: [], products: [] }));
}
