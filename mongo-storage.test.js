"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createMongoStores } = require("./mongo-storage");

test("MongoDB stores append and list submissions and persist hashed admin sessions", async () => {
  const rows = new Map();
  const collections = new Map();
  const database = {
    collection(name) {
      if (!collections.has(name)) {
        const documents = [];
        rows.set(name, documents);
        collections.set(name, {
          async createIndex(keys, options) {
            return { keys, options };
          },
          async insertOne(document) {
            documents.push({ ...document, _id: documents.length });
          },
          find() {
            return {
              sort() {
                return this;
              },
              async toArray() {
                return documents;
              }
            };
          },
          async findOne(filter) {
            return documents.find(document => document._id === filter._id) || null;
          },
          async updateOne(filter, update, options) {
            const existing = documents.find(document => document._id === filter._id);
            if (existing) Object.assign(existing, update.$set);
            else if (options.upsert) documents.push({ _id: filter._id, ...update.$set });
          },
          async deleteOne(filter) {
            const index = documents.findIndex(document => document._id === filter._id);
            if (index >= 0) documents.splice(index, 1);
          }
        });
      }
      return collections.get(name);
    }
  };
  const { submissionStore, sessionStore } = await createMongoStores(database);
  const submission = { "party code": "P-1" };
  await submissionStore.append(submission);
  assert.deepEqual(await submissionStore.list(), [{ ...submission, _id: 0 }]);

  const token = "admin-session-token";
  const expiry = Date.now() + 60_000;
  await sessionStore.set(token, expiry);
  assert.equal(rows.get("admin_sessions")[0]._id, require("node:crypto")
    .createHash("sha256").update(token).digest("hex"));
  assert.equal(await sessionStore.get(token), expiry);
  await sessionStore.delete(token);
  assert.equal(await sessionStore.get(token), null);
});
