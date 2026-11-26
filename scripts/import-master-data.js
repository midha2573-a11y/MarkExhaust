"use strict";

const path = require("node:path");
const dotenv = require("dotenv");
const { closeMongo, connectToMongo } = require("../mongo-storage");
const { loadMasterData } = require("../server");

async function importRows(database, collectionName, key, rows) {
  const operations = rows.map(row => ({
    replaceOne: {
      filter: { [key]: row[key] },
      replacement: row,
      upsert: true
    }
  }));
  const result = await database.collection(collectionName).bulkWrite(operations, { ordered: true });
  return result.matchedCount + result.upsertedCount;
}

async function main() {
  const envResult = dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
  if (envResult.error && envResult.error.code !== "ENOENT") throw envResult.error;

  const { parties, products } = await loadMasterData();
  const database = await connectToMongo();
  try {
    const [partyCount, productCount] = await Promise.all([
      importRows(database, "parties", "party code", parties),
      importRows(database, "products", "part number", products)
    ]);
    console.log(`Imported ${partyCount} party records and ${productCount} product records.`);
  } finally {
    await closeMongo();
  }
}

main().catch(error => {
  if (error.name === "MongoServerSelectionError") {
    console.error("Master-data import failed: MongoDB is unreachable. Check the URI and Atlas Network Access.");
  } else {
    console.error(`Master-data import failed: ${error.message}`);
  }
  process.exitCode = 1;
});
