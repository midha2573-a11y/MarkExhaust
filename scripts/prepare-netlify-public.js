"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

async function buildPublicDirectory() {
  const projectRoot = path.join(__dirname, "..");
  const publicDirectory = path.join(projectRoot, "public");
  await fs.rm(publicDirectory, { recursive: true, force: true });
  await fs.mkdir(publicDirectory, { recursive: true });
  await Promise.all(["index.html", "admin.html"].map(filename =>
    fs.copyFile(path.join(projectRoot, filename), path.join(publicDirectory, filename))
  ));
}

buildPublicDirectory().catch(error => {
  console.error("Could not prepare Netlify static files:", error.message);
  process.exitCode = 1;
});
