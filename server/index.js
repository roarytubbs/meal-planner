import { createApiServer } from "./api.js";
import { createStoreFromEnv } from "./store.js";

const host = process.env.API_HOST || "127.0.0.1";
const port = Number(process.env.API_PORT || 8787);
const store = await createStoreFromEnv();

const api = createApiServer({
  store,
  host,
  port,
});

await api.listen();

console.log(`[api] listening on http://${host}:${port} (${store.engine})`);

async function shutdown(signal) {
  console.log(`\n[api] shutting down (${signal})`);
  await api.close();
  await store.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error("[api] shutdown error", error);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error("[api] shutdown error", error);
    process.exit(1);
  });
});
