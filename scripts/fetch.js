import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";

// URL für die Gezeiten
const URL = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
const OUTPUT_DIR = "./public";
const OUTPUT_FILE = `${OUTPUT_DIR}/latest.json`;

// ------------------- Hauptprogramm -------------------
async function main() {
  console.log("🌊 Lade Seite:", URL);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Fehler beim Laden: ${res.status}`);

  const html = await res.text();
  const tides = parseTides(html);
  console.log(`✅ ${tides.length} Gezeiten-Einträge gefunden`);

  const meta = {
    location: "Playa del Inglés",
    timezone: "Atlantic/Canary",
    generatedAt: new Date().toLocaleString("sv-SE", { timeZone: "Atlantic/Canary" }) // Kanarische Zeit
  };

  const data = { meta, tides };

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
  console.log(`💾 ${OUTPUT_FILE} geschrieben mit ${tides.length} Einträgen`);
}

// ------------------- Parser -------------------
function parseTides(html) {
  const $ = cheerio.load(html);
  const rows = [];

  const table = $("table")
    .filter((_, el) => /Tide/i.test($(el).text()) && /Height/i.test($(el).text()))
    .first();

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

    const tm = timeTxt.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!tm) return;

    // --- Höhe verarbeiten (immer Meter) ---
    const numMatch = heightTxt.match(/([\d.,]+)/);
    if (!numMatch) return;
    let val = parseFloat(numMatch[1].replace(",", "."));

    let height;
    if (/m\b/i.test(heightTxt)) height = val;
    else height = +(val * 0.3048).toFixed(2); // Immer ft → m umrechnen, auch wenn keine Einheit da ist

    const type = /high/i.test(typeTxt) ? "Hochwasser" : "Niedrigwasser";
    const timeStr = to24h(tm[1], tm[2], tm[3]);

    rows.push({ zeit: timeStr, typ: type, hoehe_m: height });
  });

  return rows.slice(0, 8);
}

// ------------------- Uhrzeitformat -------------------
function to24h(h, m, ap) {
  h = parseInt(h);
  m = parseInt(m);
  if (ap) {
    const isPM = ap.toUpperCase() === "PM";
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ------------------- Start -------------------
main().catch(err => {
  console.error("❌ Fehler:", err);
  process.exit(1);
});
