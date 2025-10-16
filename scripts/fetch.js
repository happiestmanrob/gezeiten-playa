// scripts/fetch.js
// ------------------------------------------------------
// Holt exakte Tageszeiten von tide-forecast.com (Playa del Inglés),
// speichert sie als public/latest.json
// ------------------------------------------------------

import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

// Falls Node < 18: optionales Fetch-Fallback
const fetch = global.fetch || ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

// ------------------------------------------------------
// Konfiguration
// ------------------------------------------------------
const TIDE_URL = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
const TIMEZONE = "Atlantic/Canary";

// ------------------------------------------------------
// Hilfsfunktionen
// ------------------------------------------------------
function pad(n) {
  return String(n).padStart(2, "0");
}

function to24h(h, m, ampm) {
  let hour = parseInt(h, 10);
  const min = parseInt(m, 10);
  if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${pad(hour)}:${pad(min)}`;
}

function todayYMD(tz) {
  const d = new Date();
  return new Date(d.toLocaleString("en-US", { timeZone: tz }));
}

// ------------------------------------------------------
// HTML abrufen
// ------------------------------------------------------
async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TideBot/1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// ------------------------------------------------------
// Gezeiten aus HTML extrahieren (robust)
// ------------------------------------------------------
function parseTides(html) {
  const $ = cheerio.load(html);
  const rows = [];

  const table = $("table").filter((_, el) => {
    const text = $(el).text();
    return /Tide/i.test(text) && /Height/i.test(text);
  }).first();

  if (!table || table.length === 0) {
    console.warn("⚠️ Keine Gezeiten-Tabelle gefunden!");
    return [];
  }

  table.find("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) return;

    const typeTxt = $(tds[0]).text().trim();
    const timeTxt = $(tds[1]).text().trim();
    const heightTxt = $(tds[2]).text().trim();

    const tm = timeTxt.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!tm) return;

    // --- Höhe verarbeiten ---
let height = null;

// Versuche zuerst explizite Meter
const mMatch = heightTxt.match(/([\d.,]+)\s*m/i);
if (mMatch) {
  height = parseFloat(mMatch[1].replace(",", "."));
}

// Wenn keine Meter-Angabe, prüfe auf Fuß
if (height === null) {
  const ftMatch = heightTxt.match(/([\d.,]+)\s*ft/i);
  if (ftMatch) {
    const ft = parseFloat(ftMatch[1].replace(",", "."));
    height = +(ft * 0.3048).toFixed(2); // in Meter konvertieren
  }
}

// Falls gar keine Einheit angegeben ist, gehe von ft aus (Standard tide-forecast.com)
if (height === null) {
  const numMatch = heightTxt.match(/([\d.,]+)/);
  if (numMatch) {
    const ft = parseFloat(numMatch[1].replace(",", "."));
    height = +(ft * 0.3048).toFixed(2);
  }
}

    }

    const timeStr = to24h(tm[1], tm[2], tm[3]);
    const type = /high/i.test(typeTxt) ? "High" : "Low";

    rows.push({ timeStr, type, height });
  });

  console.log(`✅ ${rows.length} Gezeiten-Einträge gefunden`);
  return rows.slice(0, 4);
}

// ------------------------------------------------------
// ISO-Zeit hinzufügen
// ------------------------------------------------------
function attachDateToTimeStr(timeStr, tz) {
  const today = todayYMD(tz);
  const [hh, mm] = timeStr.split(":").map(Number);
  today.setHours(hh, mm, 0, 0);
  return today.toISOString();
}

// ------------------------------------------------------
// Hauptablauf
// ------------------------------------------------------
(async () => {
  console.log("🌐 Lade Seite:", TIDE_URL);
  const html = await fetchHtml(TIDE_URL);
  const tides = parseTides(html);

  const tidesWithIso = tides.map((t) => ({
    ...t,
    iso: attachDateToTimeStr(t.timeStr, TIMEZONE),
  }));

  const out = {
    meta: {
      location: "Playa del Inglés",
      timezone: TIMEZONE,
      generatedAt: new Date().toISOString(),
      source: "tide-forecast.com (parsed)",
    },
    tides: tidesWithIso,
  };

  const outDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(out, null, 2));

  console.log(`✅ public/latest.json geschrieben mit ${tidesWithIso.length} Einträgen`);
})().catch((err) => {
  console.error("❌ Fetch failed:", err);
  process.exit(1);
});
