/**
 * Copies static HTML pages into dist/ before Firebase Hosting deploy.
 * Run automatically via firebase.json predeploy hook.
 */
const fs = require("fs");
const path = require("path");

const files = [
  "static/auth/callback/index.html",
  "static/admin/index.html",
];

files.forEach((src) => {
  const dest = path.join("dist", src.replace("static/", ""));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("Copied:", dest);
});
