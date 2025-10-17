// scripts/fetch.js
// Node 20.x: kein externes fetch nötig. Nur cheerio.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const URL = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";

function to24h(str) {
  const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return str;
  let [_, h, min, ap] = m;
  h = parseInt(h);
  if (ap.toUpperCase() === "PM" && h !== 12) h += 12;
  if (ap.toUpperCase() === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

function typeDE(t) {
  return t.toLowerCase().includes("high") ? "Hochwasser" : "Niedrigwasser";
}

function parseDate(header) {
  // header z.B. "Saturday 18 October 2025"
  const ms = Date.parse(header + " GMT");
  if (isNaN(ms)) throw new Error("Datum konnte nicht erkannt werden: " + header);
  return new Date(ms).toISOString().slice(0, 10);
}

async function run() {
  console.log("🌊 Lade Gezeiten von:", URL);
  const res = await fetch(URL);
  const html = await res.text();
  const $ = cheerio.load(html);

  const days = [];
  $(".tide-day").each((_, el) => {
    const dateText = $(el).find("h4.tide-day__date").text().trim();
    if (!dateText) return;
    const iso = parseDate(dateText);
    const entries = [];

    $(el)
      .find("table.tide-day-tides tbody tr")
      .each((_, tr) => {
        const type = $(tr).find("td:nth-child(1)").text().trim();
        const time = to24h($(tr).find("td:nth-child(2) b").text().trim());
        const heightTxt = $(tr).find("td:nth-child(3)").text().trim();
        const height = parseFloat(heightTxt.replace(/[^\d.,-]/g, "").replace(",", "."));
        if (type && time && !isNaN(height)) {
          entries.push({ time, type: typeDE(type), height_m: height });
        }
      });

    if (entries.length) days.push({ date: iso, entries });
  });

  if (!days.length) throw new Error("Keine Daten gefunden!");

  const outDir = path.join(__dirname, "..", "public", "data");
  await fs.promises.mkdir(outDir, { recursive: true });
  const updatedAt = new Date().toLocaleString("de-DE", {
    timeZone: "Atlantic/Canary",
    hour12: false,
  });
  const data = { updatedAt, timezone: "WET", days };
  const outFile = path.join(outDir, "latest.json");
  await fs.promises.writeFile(outFile, JSON.stringify(data, null, 2));
  console.log(`✅ Gespeichert: ${days.length} Tage (${updatedAt})`);
}

run().catch((err) => {
  console.error("❌ Fehler:", err.message);
  process.exit(1);
});
