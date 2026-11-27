"use strict";

const path = require("node:path");
const { loadMasterData } = require("../server");

async function importMasterData() {
  const siteUrl = process.env.NETLIFY_SITE_URL;
  const password = process.env.PARTY_ADMIN_PASSWORD;
  if (!siteUrl) throw new Error("Set NETLIFY_SITE_URL to the deployed Netlify site URL.");
  if (!password) throw new Error("Set PARTY_ADMIN_PASSWORD in this PowerShell session.");

  const baseUrl = new URL(siteUrl);
  if (baseUrl.protocol !== "https:") {
    throw new Error("Master data can only be imported to an HTTPS site.");
  }

  const { parties, products } = await loadMasterData(path.join(__dirname, ".."));
  const loginResponse = await fetch(new URL("/api/admin/login", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password })
  });
  if (!loginResponse.ok) {
    throw new Error(`Admin login failed with HTTP ${loginResponse.status}.`);
  }

  const setCookie = loginResponse.headers.get("set-cookie");
  const cookie = setCookie?.split(";")[0];
  if (!cookie) throw new Error("Admin login did not return a session cookie.");

  const response = await fetch(new URL("/api/admin/import-master-data", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({ parties, products })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `Master-data import failed with HTTP ${response.status}.`);
  }

  console.log(`Imported ${result.parties} parties and ${result.products} products.`);
}

importMasterData().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
