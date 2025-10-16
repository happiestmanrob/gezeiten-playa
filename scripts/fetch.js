// scripts/fetch.js
// Holt aktuelle Gezeiten für Playa del Inglés von tide-forecast.com
// und schreibt sie als frontend/data.json

import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const TIDE_URL = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
const TIMEZONE = "Atlantic/Canary";

// Hilfsfunktionen
function pad(n) { return String(n).padStart(2, "0"); }
function to24h(h, m, ampm) {
  let hour = parseInt(h, 10);
  const min = parseInt(m, 10);
  if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${pad(hour)}:${pad(min)}`;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} beim Abruf von ${url}`);
  return await res.text();
}

function parseTides(html) {
  const $ = cheerio.load(html);
  const h2 = $('h2:contains("Today\'s tide times for Playa del Ingles")').first();
  let rows = [];
  if (h2.length) {
    const table = h2.parent().find("table").first();
    table.find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      const typeTxt = $(tds[0]).text().trim();
      const timeTxt = $(tds[1]).text().trim();
      const heightTxt = $(tds[2]).text().trim();
      if (!typeTxt || !timeTxt || !heightTxt) return;
      const m = timeTxt.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      const h = m ? to24h(m[1], m[2], m[3]) : timeTxt;
      const height = parseFloat((heightTxt.match(/([\d.]+)/) || [])[1]);
      rows.push({
        type: /high/i.test(typeTxt) ? "Hochwasser" : "Niedrigwasser",
        zeit: h,
        hoehe: height
      });
    });
  }
  return rows.slice(0, 4);
}

(async () => {
  const html = await fetchHtml(TIDE_URL);
  const tides = parseTides(html);

  // Trend bestimmen (ansteigend oder fallend)
  let trend = "unbekannt";
  if (tides.length >= 2) {
    const diff = tides[1].hoehe - tides[0].hoehe;
    trend = diff > 0 ? "Das Wasser steigt" : "Das Wasser fällt";
  }

  const out = {
    meta: {
      location: "Playa del Inglés",
      timezone: TIMEZONE,
      generatedAt: new Date().toISOString(),
      trend,
      source: {
        tides: "tide-forecast.com (geparst)",
        astronomy: "Open-Meteo"
      }
    },
    tides
  };

  // In frontend/data.json schreiben
  const outDir = path.join(process.cwd(), "frontend");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "data.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log("✅ Daten aktualisiert:", out.tides.length, "Einträge,", trend);
})().catch(err => {
  console.error("❌ Fehler beim Abruf:", err);
  process.exit(1);
});
