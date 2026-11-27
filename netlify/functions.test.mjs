import assert from "node:assert/strict";
import test from "node:test";
import { createApiHandler } from "./functions/api.mjs";

const party = {
  "party code": "P-1",
  "party name": "Example Party",
  "party add1": "Address 1",
  "party add 2": "Address 2",
  city: "City",
  state: "State",
  pin: "123456",
  "state 1": "State",
  status: "UNCLOCK",
  "md/td": "MD",
  zone: "EAST"
};
const product = {
  "part number": "PART-1",
  "product code": "CODE-1",
  "product name": "Example Product",
  mrp: 100,
  "standard pack": 6,
  "md price": 80,
  "td price": 85
};
const masterData = { parties: [party], products: [product] };
const adminPassword = "test-password-123";

class MemoryStore {
  values = new Map();

  async get(key, options = {}) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return options.type === "json" ? structuredClone(value) : JSON.stringify(value);
  }

  async setJSON(key, value) {
    this.values.set(key, structuredClone(value));
  }

  async delete(key) {
    this.values.delete(key);
  }

  async list({ prefix }) {
    return {
      blobs: [...this.values.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => ({ key }))
    };
  }
}

function request(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  return new Request(`https://example.netlify.app${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test("Netlify API reports missing master data instead of accepting orders", async () => {
  const handler = createApiHandler({ store: new MemoryStore(), env: {} });
  const response = await handler(request("/api/parties"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Master data has not been imported yet." });

  const deniedImport = await handler(request("/api/admin/import-master-data", {
    method: "POST",
    body: masterData
  }));
  assert.equal(deniedImport.status, 401);
});

test("Netlify import validates and stores private master data", async () => {
  const store = new MemoryStore();
  const handler = createApiHandler({ store, env: { PARTY_ADMIN_PASSWORD: adminPassword } });
  const login = await handler(request("/api/admin/login", {
    method: "POST",
    body: { username: "admin", password: adminPassword }
  }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const imported = await handler(request("/api/admin/import-master-data", {
    method: "POST",
    cookie,
    body: masterData
  }));
  assert.equal(imported.status, 200);
  assert.deepEqual(await imported.json(), { parties: 1, products: 1 });

  const directory = await handler(request("/api/parties"));
  assert.equal(directory.status, 200);
  assert.equal((await directory.json())[0]["party code"], "P-1");
});

test("Netlify submissions validate product quantities and persist orders", async () => {
  const store = new MemoryStore();
  await store.setJSON("master-data", masterData);
  const handler = createApiHandler({ store, env: { PARTY_ADMIN_PASSWORD: adminPassword } });

  const invalid = await handler(request("/api/submissions", {
    method: "POST",
    body: {
      "party code": "P-1",
      products: [{ "part number": "PART-1", quantity: 7 }]
    }
  }));
  assert.equal(invalid.status, 400);
  assert.equal((await store.list({ prefix: "submissions/" })).blobs.length, 0);

  const accepted = await handler(request("/api/submissions", {
    method: "POST",
    body: {
      "party code": "P-1",
      products: [{ "part number": "PART-1", quantity: 12 }]
    }
  }));
  assert.equal(accepted.status, 201);

  const login = await handler(request("/api/admin/login", {
    method: "POST",
    body: { username: "admin", password: adminPassword }
  }));
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const coldStartHandler = createApiHandler({ store, env: { PARTY_ADMIN_PASSWORD: adminPassword } });
  const adminSubmissions = await coldStartHandler(request("/api/admin/submissions", { cookie }));
  assert.equal(adminSubmissions.status, 200);
  const saved = await adminSubmissions.json();
  assert.equal(saved.length, 1);
  assert.equal(saved[0]["party name"], "Example Party");
  assert.equal(saved[0].products[0].quantity, 12);

  const logout = await coldStartHandler(request("/api/admin/logout", {
    method: "POST",
    cookie
  }));
  assert.equal(logout.status, 200);
  const signedOut = await coldStartHandler(request("/api/admin/session", { cookie }));
  assert.deepEqual(await signedOut.json(), { authenticated: false });
});
