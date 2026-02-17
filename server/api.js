import http from "node:http";
import { URL } from "node:url";

import {
  extractRecipeFromWebText,
  normalizeStoreList,
} from "../src/lib/meal-planner.js";
import {
  createRecipe,
  deleteRecipe,
  getOrSeedState,
  normalizeIncomingState,
  updateRecipe,
} from "./state-service.js";

const MAX_REQUEST_BYTES = 1_000_000;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function parseJsonBody(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      return req.body;
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
    const bodyBytes = Buffer.byteLength(rawBody);
    if (bodyBytes > MAX_REQUEST_BYTES) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }

    if (!rawBody.trim()) {
      return {};
    }

    return parseJsonBody(rawBody);
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_REQUEST_BYTES) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return parseJsonBody(Buffer.concat(chunks).toString("utf8"));
}

function normalizeHttpUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }

  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
  const candidate = hasProtocol ? value : `https://${value}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function buildImportHeaders() {
  return {
    "user-agent": "meal-planner-importer/1.0",
    accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
  };
}

async function fetchRecipeSourceDirect(url) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: buildImportHeaders(),
  });

  if (!response.ok) {
    const error = new Error(`Direct import failed with status ${response.status}`);
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }

  const text = await response.text();
  if (!String(text).trim()) {
    const error = new Error("Direct import response was empty");
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }

  return {
    sourceText: text,
    source: "direct",
  };
}

async function fetchRecipeSourceViaJina(url) {
  const proxyUrl = `https://r.jina.ai/${url}`;
  const response = await fetch(proxyUrl, {
    method: "GET",
    redirect: "follow",
    headers: buildImportHeaders(),
  });

  if (!response.ok) {
    const error = new Error(`Proxy import failed with status ${response.status}`);
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }

  const text = await response.text();
  if (!String(text).trim()) {
    const error = new Error("Proxy import response was empty");
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }

  return {
    sourceText: text,
    source: "jina-proxy",
  };
}

function importedRecipeScore(recipe) {
  if (!recipe || typeof recipe !== "object") {
    return 0;
  }
  const isMeaningful = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized || normalized.length < 3) {
      return false;
    }
    if (/^[-_=~*•|]+$/.test(normalized)) {
      return false;
    }
    if (/^!\[[^\]]*]\([^)]+\)$/.test(normalized)) {
      return false;
    }
    if (/^(image|photo)\b/i.test(normalized)) {
      return false;
    }
    if (/^\[[^\]]+]\(https?:\/\/[^)]+\)$/.test(normalized)) {
      return false;
    }
    return /[a-zA-Z]/.test(normalized);
  };
  const titleScore = String(recipe.title || "").trim() ? 1 : 0;
  const descriptionScore = String(recipe.description || "").trim() ? 1 : 0;
  const ingredientValues = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const stepValues = Array.isArray(recipe.steps) ? recipe.steps : [];
  const validIngredientCount = ingredientValues.filter((item) =>
    isMeaningful(item?.name || item),
  ).length;
  const validStepCount = stepValues.filter((step) => isMeaningful(step)).length;
  const invalidIngredientCount = ingredientValues.length - validIngredientCount;
  const invalidStepCount = stepValues.length - validStepCount;
  const oversizedIngredientPenalty = validIngredientCount > 25 ? (validIngredientCount - 25) * 3 : 0;
  const oversizedStepPenalty = validStepCount > 15 ? (validStepCount - 15) * 10 : 0;
  return (
    titleScore
    + descriptionScore
    + validIngredientCount * 4
    + validStepCount * 4
    - invalidIngredientCount * 2
    - invalidStepCount * 2
    - oversizedIngredientPenalty
    - oversizedStepPenalty
  );
}

function sanitizeImportedRecipe(recipe) {
  if (!recipe || typeof recipe !== "object") {
    return {
      title: "",
      description: "",
      mealType: "dinner",
      servings: 4,
      ingredients: [],
      steps: [],
      sourceUrl: "",
    };
  }

  const isMeaningful = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized || normalized.length < 3) {
      return false;
    }
    if (/^[-_=~*•|]+$/.test(normalized)) {
      return false;
    }
    if (/^!\[[^\]]*]\([^)]+\)$/.test(normalized)) {
      return false;
    }
    if (/^(image|photo)\b/i.test(normalized)) {
      return false;
    }
    if (/^\[[^\]]+]\(https?:\/\/[^)]+\)$/.test(normalized)) {
      return false;
    }
    return /[a-zA-Z]/.test(normalized);
  };

  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.filter((item) => isMeaningful(item?.name || item))
    : [];
  const steps = Array.isArray(recipe.steps)
    ? recipe.steps.filter((step) => isMeaningful(step))
    : [];

  return {
    ...recipe,
    ingredients: ingredients.slice(0, 40),
    steps: steps.slice(0, 25),
  };
}

export function createApiHandler({ store }) {
  return async function apiHandler(req, res) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }

    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = requestUrl.pathname;

    try {
      if (req.method === "GET" && pathname === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          database: store.engine,
        });
        return;
      }

      if (req.method === "GET" && pathname === "/api/state") {
        const state = await getOrSeedState(store);
        sendJson(res, 200, state);
        return;
      }

      if (req.method === "PUT" && pathname === "/api/state") {
        const body = await readJsonBody(req);
        const normalized = normalizeIncomingState(body);

        if (!normalized) {
          sendJson(res, 400, { error: "State payload is invalid." });
          return;
        }

        await store.setState(normalized);
        sendJson(res, 200, normalized);
        return;
      }

      if (req.method === "GET" && pathname === "/api/recipes") {
        const state = await getOrSeedState(store);
        sendJson(res, 200, state.recipes);
        return;
      }

      if (req.method === "POST" && pathname === "/api/recipes") {
        const body = await readJsonBody(req);
        const recipe = await createRecipe(store, body);
        sendJson(res, 201, recipe);
        return;
      }

      const recipeIdMatch = pathname.match(/^\/api\/recipes\/([^/]+)$/);
      if (recipeIdMatch && req.method === "PUT") {
        const recipeId = decodeURIComponent(recipeIdMatch[1]);
        const body = await readJsonBody(req);
        const normalized = await updateRecipe(store, recipeId, body);
        sendJson(res, 200, normalized);
        return;
      }

      if (recipeIdMatch && req.method === "DELETE") {
        const recipeId = decodeURIComponent(recipeIdMatch[1]);
        const result = await deleteRecipe(store, recipeId);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/import/parse") {
        const body = await readJsonBody(req);
        const normalizedUrl = normalizeHttpUrl(body.url);

        if (!normalizedUrl) {
          sendJson(res, 400, { error: "A valid recipe URL is required." });
          return;
        }

        const availableStores = normalizeStoreList(body.stores);
        const ingredientCatalog =
          body.ingredientCatalog && typeof body.ingredientCatalog === "object"
            ? body.ingredientCatalog
            : {};

        const candidates = [];
        try {
          candidates.push(await fetchRecipeSourceDirect(normalizedUrl));
        } catch {
          // Ignore direct import failures and continue with proxy fallback.
        }
        try {
          candidates.push(await fetchRecipeSourceViaJina(normalizedUrl));
        } catch {
          // Ignore proxy failures if direct import succeeded.
        }

        if (candidates.length === 0) {
          const error = new Error("Unable to fetch recipe content from this URL.");
          error.statusCode = 422;
          error.expose = true;
          throw error;
        }

        const extractedCandidates = candidates
          .map((candidate) => {
            try {
              const extracted = sanitizeImportedRecipe(
                extractRecipeFromWebText(
                  candidate.sourceText,
                  normalizedUrl,
                  ingredientCatalog,
                  availableStores,
                ),
              );
              return {
                extracted,
                source: candidate.source,
                score: importedRecipeScore(extracted),
              };
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        if (extractedCandidates.length === 0) {
          const error = new Error("Could not parse recipe sections from this URL.");
          error.statusCode = 422;
          error.expose = true;
          throw error;
        }
        const best = extractedCandidates.sort((a, b) => b.score - a.score)[0];

        sendJson(res, 200, {
          ...best.extracted,
          source: best.source,
        });
        return;
      }

      notFound(res);
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      const shouldExposeMessage = error?.expose === true || statusCode < 500;
      sendJson(res, statusCode, {
        error: shouldExposeMessage ? error.message : "Internal server error",
      });
    }
  };
}

export function createApiServer({ store, port = 8787, host = "127.0.0.1" }) {
  const handler = createApiHandler({ store });
  const server = http.createServer((req, res) => {
    handler(req, res).catch((error) => {
      const statusCode = Number(error?.statusCode) || 500;
      sendJson(res, statusCode, {
        error: statusCode >= 500 ? "Internal server error" : error.message,
      });
    });
  });

  return {
    server,
    listen() {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          const address = server.address();
          const resolvedPort = typeof address === "object" && address ? address.port : port;
          resolve({ host, port: resolvedPort });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
