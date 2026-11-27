import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import serverModule from "../../server.js";

const {
  hasAvailablePartyZone,
  MAX_PRODUCT_RESULTS,
  MAX_REQUEST_BYTES,
  PARTY_FIELDS,
  partyAccessError,
  safeEqual,
  validateMasterData
} = serverModule;

const STORE_NAME = "markexhaust-data";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_IMPORT_BYTES = 1024 * 1024;
const HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
};

function jsonResponse(status, value, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function readCookie(request, name) {
  for (const cookie of (request.headers.get("cookie") || "").split(";")) {
    const separator = cookie.indexOf("=");
    if (separator >= 0 && cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return null;
}

async function readJsonBody(request, limit = MAX_REQUEST_BYTES) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new HttpError(413, "Request is too large.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limit) {
    throw new HttpError(413, "Request is too large.");
  }
  if (!text) throw new HttpError(400, "Request body is required.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}

async function getMasterData(store) {
  const storedData = await store.get("master-data", { type: "json" });
  if (!storedData) return null;
  try {
    return validateMasterData(storedData.parties, storedData.products);
  } catch (error) {
    console.error("Stored master data is invalid:", error.message);
    throw new HttpError(503, "Master data is invalid. Import the master data again.");
  }
}

async function getValidSession(request, store) {
  const token = readCookie(request, "admin_session");
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const sessionKey = `sessions/${token}`;
  const session = await store.get(sessionKey, { type: "json" });
  if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
    if (session) await store.delete(sessionKey);
    return null;
  }
  return token;
}

function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `admin_session=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function getSessionCookie(request, token) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `admin_session=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

async function getSubmissions(store) {
  const { blobs } = await store.list({ prefix: "submissions/" });
  const records = await Promise.all(blobs.map(blob =>
    store.get(blob.key, { type: "json" })
  ));
  return records.filter(Boolean).sort((left, right) =>
    Date.parse(left["submitted at"] || "") - Date.parse(right["submitted at"] || "")
  );
}

export function createApiHandler({ store, env = process.env } = {}) {
  return async request => {
    try {
      const activeStore = store || getStore({ name: STORE_NAME, consistency: "strong" });
      const url = new URL(request.url);
      const route = url.pathname;
      const method = request.method.toUpperCase();

      if (method === "GET" && route === "/api/parties") {
        const masterData = await getMasterData(activeStore);
        if (!masterData) {
          return jsonResponse(503, { error: "Master data has not been imported yet." });
        }
        return jsonResponse(200, masterData.parties.filter(hasAvailablePartyZone));
      }

      if (method === "GET" && route === "/api/products") {
        const masterData = await getMasterData(activeStore);
        if (!masterData) {
          return jsonResponse(503, { error: "Master data has not been imported yet." });
        }

        const partyCode = url.searchParams.get("partyCode") || "";
        const query = (url.searchParams.get("q") || "").trim().toLowerCase();
        const party = masterData.parties.find(row => row["party code"] === partyCode);
        if (!party) {
          return jsonResponse(400, { error: "Select a valid party before searching products." });
        }
        if (!hasAvailablePartyZone(party)) {
          return jsonResponse(400, { error: "Select a party from East, West, North, or South." });
        }
        const accessError = partyAccessError(party);
        if (accessError) return jsonResponse(403, { error: accessError });

        const priceType = String(party["md/td"] || "").trim().toUpperCase();
        if (priceType !== "MD" && priceType !== "TD") {
          return jsonResponse(400, { error: "This party has no valid MD/TD price type." });
        }

        const priceField = priceType === "MD" ? "md price" : "td price";
        const matches = [];
        for (const product of masterData.products) {
          const fields = ["part number", "product code", "product name"];
          if (query && !fields.some(field =>
            String(product[field] ?? "").toLowerCase().includes(query)
          )) {
            continue;
          }
          matches.push({
            "part number": product["part number"],
            "product code": product["product code"],
            "product name": product["product name"],
            mrp: product.mrp,
            "standard pack": product["standard pack"],
            price: product[priceField],
            "price type": priceType
          });
          if (matches.length >= MAX_PRODUCT_RESULTS) break;
        }
        return jsonResponse(200, matches);
      }

      if (method === "POST" && route === "/api/submissions") {
        const payload = await readJsonBody(request);
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new HttpError(400, "Invalid request.");
        }
        const masterData = await getMasterData(activeStore);
        if (!masterData) {
          return jsonResponse(503, { error: "Master data has not been imported yet." });
        }

        const partyCode = String(payload["party code"] ?? "");
        const party = masterData.parties.find(row => row["party code"] === partyCode);
        if (!party) return jsonResponse(400, { error: "Select a valid party before submitting." });
        if (!hasAvailablePartyZone(party)) {
          return jsonResponse(400, { error: "Select a party from East, West, North, or South." });
        }
        const accessError = partyAccessError(party);
        if (accessError) return jsonResponse(403, { error: accessError });

        const requestedProducts = payload.products;
        if (!Array.isArray(requestedProducts) || requestedProducts.length < 1 || requestedProducts.length > 50) {
          return jsonResponse(400, { error: "Add between 1 and 50 products before submitting." });
        }
        const priceType = String(party["md/td"] || "").trim().toUpperCase();
        if (priceType !== "MD" && priceType !== "TD") {
          return jsonResponse(400, { error: "This party has no valid MD/TD price type." });
        }

        const priceField = priceType === "MD" ? "md price" : "td price";
        const submittedProducts = [];
        for (const requestedProduct of requestedProducts) {
          const partNumber = String(requestedProduct?.["part number"] ?? "");
          const product = masterData.products.find(row =>
            String(row["part number"]).toLowerCase() === partNumber.toLowerCase()
          );
          if (!product) {
            return jsonResponse(400, { error: "A submitted product is not in the product list." });
          }

          const quantity = Number(requestedProduct.quantity);
          const standardPack = Number(product["standard pack"]);
          if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000000 || quantity % standardPack !== 0) {
            return jsonResponse(400, {
              error: `Product quantity must be a positive multiple of ${standardPack} and no more than 10,000,000.`
            });
          }
          submittedProducts.push({
            "part number": product["part number"],
            "product code": product["product code"],
            "product name": product["product name"],
            mrp: product.mrp,
            "standard pack": standardPack,
            "price type": priceType,
            price: product[priceField],
            quantity
          });
        }

        const submission = Object.fromEntries(PARTY_FIELDS.map(field => [field, party[field]]));
        submission.products = submittedProducts;
        submission["submitted at"] = new Date().toISOString();
        await activeStore.setJSON(`submissions/${crypto.randomUUID()}`, submission, {
          metadata: { submittedAt: submission["submitted at"] }
        });
        return jsonResponse(201, { message: "Submission received." });
      }

      if (method === "POST" && route === "/api/admin/login") {
        if (typeof env.PARTY_ADMIN_PASSWORD !== "string" || env.PARTY_ADMIN_PASSWORD.length < 12) {
          return jsonResponse(503, { error: "Admin password is not configured." });
        }
        const payload = await readJsonBody(request);
        const providedUsername = String(payload?.username ?? "");
        const providedPassword = String(payload?.password ?? "");
        if (providedUsername !== "admin" || !safeEqual(providedPassword, env.PARTY_ADMIN_PASSWORD)) {
          return jsonResponse(401, { error: "Incorrect username or password." });
        }

        const token = crypto.randomBytes(32).toString("base64url");
        await activeStore.setJSON(`sessions/${token}`, {
          expiresAt: Date.now() + SESSION_TTL_MS
        });
        return jsonResponse(200, { message: "Signed in." }, {
          "Set-Cookie": getSessionCookie(request, token)
        });
      }

      if (method === "GET" && route === "/api/admin/session") {
        return jsonResponse(200, {
          authenticated: Boolean(await getValidSession(request, activeStore))
        });
      }

      if (route.startsWith("/api/admin/")) {
        const token = await getValidSession(request, activeStore);
        if (!token) {
          return jsonResponse(401, { error: "Admin sign-in required." }, {
            "Set-Cookie": clearSessionCookie(request)
          });
        }

        if (method === "GET" && route === "/api/admin/submissions") {
          return jsonResponse(200, await getSubmissions(activeStore));
        }

        if (method === "POST" && route === "/api/admin/import-master-data") {
          const payload = await readJsonBody(request, MAX_IMPORT_BYTES);
          try {
            const masterData = validateMasterData(payload?.parties, payload?.products);
            await activeStore.setJSON("master-data", masterData);
            return jsonResponse(200, {
              parties: masterData.parties.length,
              products: masterData.products.length
            });
          } catch (error) {
            throw new HttpError(400, error.message);
          }
        }

        if (method === "POST" && route === "/api/admin/logout") {
          await activeStore.delete(`sessions/${token}`);
          return jsonResponse(200, { message: "Signed out." }, {
            "Set-Cookie": clearSessionCookie(request)
          });
        }
      }

      return jsonResponse(404, { error: "Not found." });
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse(error.statusCode, { error: error.message });
      }
      console.error("Netlify API request failed:", error);
      return jsonResponse(500, { error: "Server error." });
    }
  };
}

export default createApiHandler();

export const config = {
  path: "/api/*"
};
