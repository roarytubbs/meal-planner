const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const LOCAL_API_FALLBACKS = [
  "http://127.0.0.1:8787",
  "http://localhost:8787",
];

function buildApiUrl(pathname) {
  return `${API_BASE_URL}${pathname}`;
}

async function apiRequest(pathname, options = {}) {
  const response = await fetch(buildApiUrl(pathname), {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let details = "";
    try {
      const payload = await response.json();
      details = payload?.error ? ` ${payload.error}` : "";
    } catch {
      details = "";
    }

    throw new Error(`API request failed (${response.status}).${details}`.trim());
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function fetchPlannerState() {
  return apiRequest("/api/state");
}

export async function savePlannerState(state) {
  return apiRequest("/api/state", {
    method: "PUT",
    body: JSON.stringify(state),
  });
}

export async function parseRecipeFromUrl(url, ingredientCatalog, stores) {
  const payload = {
    url,
    ingredientCatalog,
    stores,
  };

  try {
    return await apiRequest("/api/import/parse", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const isLocalHostBrowser = typeof window !== "undefined"
      && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    // In local dev, Vite proxy can return 500 when the API process is stale/unreachable.
    // Try direct local API hosts before surfacing the error.
    if (API_BASE_URL && !isLocalHostBrowser) {
      throw error;
    }

    for (const baseUrl of LOCAL_API_FALLBACKS) {
      try {
        const response = await fetch(`${baseUrl}/api/import/parse`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          continue;
        }

        return response.json();
      } catch {
        // Try the next fallback.
      }
    }

    throw error;
  }
}
