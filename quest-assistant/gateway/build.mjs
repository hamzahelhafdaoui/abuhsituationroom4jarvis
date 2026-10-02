import { cp, mkdir } from "node:fs/promises";
await mkdir("public/vendor", { recursive: true });
await cp("node_modules/leaflet/dist/leaflet.js", "public/vendor/leaflet.js");
await cp("node_modules/leaflet/dist/leaflet.css", "public/vendor/leaflet.css");
await cp("node_modules/leaflet/LICENSE", "public/vendor/leaflet-LICENSE.txt");
console.log("Bundled map library. No external JavaScript is loaded.");
