// scripts/fetch.js
// Holt Gezeiten-Daten von tide-forecast.com für Playa del Inglés
// und erstellt 3 Dateien (data-0.json, data-1.json, data-2.json)
// für heute, morgen und übermorgen.

import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

// ---- Konfiguration ----
const BASE_URL = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
const LAT = 27.7416;
const LON = -15.5989;
const TIMEZONE = "Atlantic/Canary";
const OUT_DIR = path.join(process.cwd(), "public");

// ---- Helper-Funktionen ----
function pad(n) { return String(n).padStart(2, "0"); }

function to24h(h, m, ampm) {
  let hour = parseInt(h, 10);
  const min = parseInt(m, 10);
  if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${pad(hour)}:${pad(min)}`;
}

function toIsoForDay(baseDate, timeStr, tz) {
  const [hh, mm] = timeStr.split(":").map(Number);
  const d = new Date(baseDate.toLocaleString("en-US", { timeZone: tz }));
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

// ---- HTML abrufen ----
async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; GezeitenBot/1.0; +https://github.com/)",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} beim Abrufen von ${url}`);
  return await res.text();
}

// ---- Gezeiten aus HTML parsen ----
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

      const m = timeTxt.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!m) return;

      const timeStr = to24h(m[1], m[2], m[3]);
      const height = parseFloat((heightTxt.match(/([\d.]+)/) || [])[1]);
      const type = /high/i.test(typeTxt) ? "High" : "Low";

      rows.push({ type, timeStr, height });
    });
  }

  // Fallback falls Tabelle nicht gefunden
  if (rows.length < 4) {
    const allText = $("body").text().replace(/\s+/g, " ");
    const re = /(Low Tide|High Tide)[^0-9]*?(\d{1,2}):(\d{2})\s*(AM|PM)[^0-9]*?([\d.]+)\s*m/gi;
    let m;
    while ((m = re.exec(allText)) && rows.length < 4) {
      rows.push({
        type: /high/i.test(m[1]) ? "High" : "Low",
        timeStr: to24h(m[2], m[3], m[4]),
        height: parseFloat(m[5]),
      });
    }
  }

  return rows.slice(0, 4);
}

// ---- Hauptfunktion: Daten abrufen und speichern ----
async function fetchTidesForDay(offset = 0) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + offset);

  const html = await fetchHtml(BASE_URL);
  const tides = parseTides(html);

  const tidesWithIso = tides.map(t => ({
    ...t,
    iso: toIsoForDay(targetDate, t.timeStr, TIMEZONE)
  }));

  const out = {
    meta: {
      location: "Playa del Inglés",
      lat: LAT,
      lon: LON,
      timezone: TIMEZONE,
      generatedAt: new Date().toISOString(),
      dayOffset: offset,
      source: "tide-forecast.com (parsed)",
    },
    tides: tidesWithIso,
  };

  const fileName = `data-${offset}.json`;
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, fileName), JSON.stringify(out, null, 2));
  console.log(`✅ ${fileName} geschrieben (${tides.length} Einträge)`);
}

// ---- Starte alle drei Tage ----
(async () => {
  for (let i = 0; i <= 2; i++) {
    await fetchTidesForDay(i);
  }
  console.log("🎉 Alle 3 Tage erfolgreich abgerufen!");
})().catch(err => {
  console.error("❌ Fehler beim Abrufen:", err);
  process.exit(1);
});
