import assert from "node:assert/strict";
import test from "node:test";

import { createApiHandler } from "../server/api.js";
import { createInitialState } from "../src/lib/meal-planner.js";

function createInMemoryStore() {
  let state = createInitialState();
  return {
    engine: "memory",
    async getState() {
      return state;
    },
    async setState(nextState) {
      state = nextState;
    },
  };
}

async function invoke(handler, { method, url, body }) {
  const req = {
    method,
    url,
    headers: {
      host: "localhost:8787",
    },
    body,
    [Symbol.asyncIterator]: async function* iterator() {
      if (body === undefined || body === null) {
        return;
      }
      const asText = typeof body === "string" ? body : JSON.stringify(body);
      yield Buffer.from(asText, "utf8");
    },
  };

  return new Promise((resolve, reject) => {
    const responseData = {
      statusCode: 200,
      headers: {},
      body: "",
    };
    const res = {
      writeHead(statusCode, headers) {
        responseData.statusCode = statusCode;
        responseData.headers = headers || {};
      },
      end(chunk = "") {
        responseData.body = String(chunk || "");
        try {
          responseData.json = responseData.body ? JSON.parse(responseData.body) : null;
        } catch {
          responseData.json = null;
        }
        resolve(responseData);
      },
    };

    handler(req, res).catch(reject);
  });
}

test("GET /api/stores/lookup rejects empty query", async () => {
  const handler = createApiHandler({ store: createInMemoryStore() });
  const response = await invoke(handler, {
    method: "GET",
    url: "/api/stores/lookup?query=",
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.json?.error || "", /lookup query/i);
});

test("GET /api/stores/lookup returns 503 when GOOGLE_MAPS_API_KEY is missing", async () => {
  const previousApiKey = process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;

  try {
    const handler = createApiHandler({ store: createInMemoryStore() });
    const response = await invoke(handler, {
      method: "GET",
      url: "/api/stores/lookup?query=123+Main+St+Austin",
    });

    assert.equal(response.statusCode, 503);
    assert.match(response.json?.error || "", /GOOGLE_MAPS_API_KEY/i);
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = previousApiKey;
    }
  }
});
