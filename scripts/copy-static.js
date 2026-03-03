/**
 * Copies static HTML pages into dist/ before Firebase Hosting deploy.
 * Also injects Ionicons @font-face CSS into dist/index.html so icons
 * render correctly on web without waiting for JS to load fonts.
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

// Copy Ionicons font to a stable path (no content hash in URL)
const ioniconsSource = path.join(
  "node_modules",
  "@expo",
  "vector-icons",
  "build",
  "vendor",
  "react-native-vector-icons",
  "Fonts",
  "Ionicons.ttf"
);
const ioniconsDestDir = path.join("dist", "fonts");
const ioniconsDest = path.join(ioniconsDestDir, "Ionicons.ttf");
fs.mkdirSync(ioniconsDestDir, { recursive: true });
fs.copyFileSync(ioniconsSource, ioniconsDest);
console.log("Copied:", ioniconsDest);

// Inject @font-face into dist/index.html so icons are available before JS runs
const indexPath = path.join("dist", "index.html");
let html = fs.readFileSync(indexPath, "utf8");
const fontStyle = `  <style>@font-face { font-family: 'Ionicons'; src: url('/fonts/Ionicons.ttf') format('truetype'); font-display: block; }</style>\n`;
html = html.replace("</head>", fontStyle + "</head>");
fs.writeFileSync(indexPath, html, "utf8");
console.log("Injected Ionicons @font-face into dist/index.html");
