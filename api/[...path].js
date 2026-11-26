"use strict";

const path = require("node:path");
const { createApplication, validateMasterData } = require("../server");
const { connectToMongo, createMongoStores } = require("../mongo-storage");

let contextPromise;

async function getContext() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const database = await connectToMongo();
      const stores = await createMongoStores(database);
      return { database, ...stores };
    })().catch(error => {
      contextPromise = null;
      throw error;
    });
  }
  return contextPromise;
}

module.exports = async function handler(request, response) {
  try {
    const { database, submissionStore, sessionStore } = await getContext();
    const [partyRows, productRows] = await Promise.all([
      database.collection("parties").find({}, { projection: { _id: 0 } }).toArray(),
      database.collection("products").find({}, { projection: { _id: 0 } }).toArray()
    ]);
    const { parties, products } = validateMasterData(partyRows, productRows);
    const application = createApplication({
      parties,
      products,
      submissionStore,
      sessionStore,
      password: process.env.PARTY_ADMIN_PASSWORD,
      webRoot: path.join(__dirname, "..")
    });
    await application(request, response);
  } catch (error) {
    console.error("Vercel request setup failed:", error.name);
    if (!response.writableEnded) {
      response.writeHead(503, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(JSON.stringify({ error: "Service is not configured or temporarily unavailable." }));
    }
  }
};
