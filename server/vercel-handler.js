import { createApiHandler } from "./api.js";
import { createStoreFromEnv } from "./store.js";

let apiHandlerPromise;

async function getApiHandler() {
  if (!apiHandlerPromise) {
    apiHandlerPromise = (async () => {
      const store = await createStoreFromEnv();
      return createApiHandler({ store });
    })();
  }

  return apiHandlerPromise;
}

export default async function vercelHandler(req, res) {
  const apiHandler = await getApiHandler();
  return apiHandler(req, res);
}
