"use strict";

const crypto = require("node:crypto");
const { MongoClient } = require("mongodb");

let clientPromise;
let mongoClient;

async function connectToMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Set MONGODB_URI to enable MongoDB storage.");

  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect()
      .then(() => {
        mongoClient = client;
        return client.db(process.env.MONGODB_DB || "markexhaust");
      })
      .catch(error => {
        clientPromise = null;
        client.close().catch(() => {});
        throw error;
      });
  }
  return clientPromise;
}

async function closeMongo() {
  if (!clientPromise) return;
  await clientPromise;
  const client = mongoClient;
  clientPromise = null;
  mongoClient = null;
  if (client) await client.close();
}

async function createMongoStores(database) {
  const submissions = database.collection("submissions");
  const adminSessions = database.collection("admin_sessions");
  await adminSessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  return {
    submissionStore: {
      async append(submission) {
        await submissions.insertOne(submission);
      },
      async list() {
        return submissions.find({}).sort({ _id: 1 }).toArray();
      }
    },
    sessionStore: {
      async get(token) {
        const session = await adminSessions.findOne({ _id: hashToken(token) });
        return session ? session.expiresAt.getTime() : null;
      },
      async set(token, expiresAt) {
        await adminSessions.updateOne(
          { _id: hashToken(token) },
          { $set: { expiresAt: new Date(expiresAt) } },
          { upsert: true }
        );
      },
      async delete(token) {
        await adminSessions.deleteOne({ _id: hashToken(token) });
      }
    }
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { connectToMongo, createMongoStores, closeMongo };
