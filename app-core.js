"use strict";

const crypto = require("node:crypto");

const PARTY_FIELDS = [
  "party code",
  "party name",
  "party add1",
  "party add 2",
  "city",
  "state",
  "pin",
  "state 1",
  "status",
  "md/td",
  "zone"
];
const PRODUCT_FIELDS = ["part number", "product code", "product name", "mrp", "standard pack", "md price", "td price"];
const PARTY_ZONES = new Set(["EAST", "WEST", "NORTH", "SOUTH"]);
const SOURCE_PARTY_ZONES = new Set([...PARTY_ZONES, "EXPORT"]);
const LOCKED_PARTY_STATUSES = new Set(["LOCK"]);
const UNLOCKED_PARTY_STATUSES = new Set(["UNCLOCK"]);
const LOCKED_PARTY_MESSAGE = "Your account are lock please contact with regional manager";
const MAX_REQUEST_BYTES = 65536;
const MAX_PRODUCT_RESULTS = 40;

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function hasAvailablePartyZone(party) {
  return PARTY_ZONES.has(String(party?.zone ?? "").trim().toUpperCase());
}

function partyAccessError(party) {
  const status = String(party?.status ?? "").trim().toUpperCase();
  if (LOCKED_PARTY_STATUSES.has(status)) return LOCKED_PARTY_MESSAGE;
  if (UNLOCKED_PARTY_STATUSES.has(status)) return null;
  return "Party status is not recognized. Please contact with regional manager.";
}

function normalizeRows(rows, fields, filename, stringifyValues) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`${filename} must contain a non-empty JSON array.`);
  }

  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`${filename} row ${index + 1} must be an object.`);
    }

    const record = {};
    for (const field of fields) {
      if (!hasOwn(row, field)) {
        throw new Error(`${filename} row ${index + 1} is missing the required "${field}" field.`);
      }
      const value = row[field];
      record[field] = stringifyValues ? (value == null ? "" : String(value)) : value;
    }
    return record;
  });
}

function validateMasterData(partyRows, productRows) {
  const parties = normalizeRows(partyRows, PARTY_FIELDS, "Party data", true);
  const partyCodes = new Set();
  for (const party of parties) {
    const code = party["party code"].toLowerCase();
    if (partyCodes.has(code)) throw new Error("Party data contains duplicate party codes.");
    partyCodes.add(code);

    party.zone = party.zone.trim().toUpperCase();
    if (party.zone && !SOURCE_PARTY_ZONES.has(party.zone)) {
      throw new Error(`Party data contains an unsupported zone for party code "${party["party code"]}".`);
    }
  }

  const products = normalizeRows(productRows, PRODUCT_FIELDS, "Product data", false);
  const partNumbers = new Set();
  for (const [index, product] of products.entries()) {
    const partNumber = String(product["part number"] ?? "");
    const key = partNumber.toLowerCase();
    if (!partNumber.trim() || partNumbers.has(key)) {
      throw new Error("Product data contains an empty or duplicate part number.");
    }
    partNumbers.add(key);

    const standardPack = Number(product["standard pack"]);
    if (!Number.isSafeInteger(standardPack) || standardPack <= 0) {
      throw new Error(`Product data row ${index + 1} must have a positive integer standard pack.`);
    }
    product["standard pack"] = standardPack;
  }

  return { parties, products };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  hasAvailablePartyZone,
  MAX_PRODUCT_RESULTS,
  MAX_REQUEST_BYTES,
  PARTY_FIELDS,
  partyAccessError,
  safeEqual,
  validateMasterData
};
