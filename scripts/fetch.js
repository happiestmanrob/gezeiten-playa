// scripts/fetch.js
// Node 20.x – ohne extra fetch-Paket. Einzige Lib: cheerio (im package.json).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Quelle
const START_URL =
  "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";

// Helper: aus "Friday 17 October 2025" -> "2025-10-17"
function englishDateToISO(dText) {
  // Sicherheit: nur rechten Teil nach ":" nehmen (Header enthält Präfixe)
  const pure = dText.split(":").pop().trim(); // z.B. "Friday 17 October 2025"
  // Date.parse kann das im Englischen parsen. Wir hängen GMT an, damit keine lokale TZ verfälscht.
  const ms = Date.parse(`${pure} 00:00 GMT`);
  if (Number.isNaN(ms)) throw new Error(`Konnte Datum nicht parsen: "${dText}"`);
  return new Date(ms).toISOString().slice(0, 10);
}

// Helper: "5:20 AM" -> "05:20", "12:09 PM" -> "12:09", "00:03 AM" -> "00:03"
function to24h(t12) {
  const m = t12.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return t12; // falls schon 24h
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = m[3].toUpperCase();
  if (ap === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return `${String(h).padStart(2, "0")}:${min}`;
}

function mapTypeToDE(t) {
  t = t.toLowerCase();
  if (t.includes("high")) return "Hochwasser";
  if (t.includes("low")) return "Niedrigwasser";
  return t;
}

function parseFloatSafe(txt) {
  // erwartet z.B. "1.68 m" -> 1.68
  const m = String(txt).replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

const log = (...a) => console.log("•", ...a);

async function run() {
  log("Lade Seite:", START_URL);
  const res = await fetch(START_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Die „Monatsübersicht“-Tage stehen jeweils in .tide-day
  const dayBlocks = $(".tide-day");
  if (dayBlocks.length === 0) {
    throw new Error("Keine Gezeiten-Tage gefunden ('.tide-day' leer).");
  }

  const days = [];

  dayBlocks.each((_, el) => {
    const $el = $(el);
    const headerText = $el.find("h4.tide-day__date").first().text().trim();
    if (!headerText) return;

    const isoDate = englishDateToISO(headerText);

    const entries = [];
    $el.find("table.tide-day-tides tbody tr").each((_, tr) => {
      const $tr = $(tr);
      const tds = $tr.find("td");
      if (tds.length < 3) return;

      const typeEn = $(tds[0]).text().trim();
      const time12 = $(tds[1]).find("b").first().text().trim();
      const heightTxt = $(tds[2]).text().trim();

      if (!time12) return;

      entries.push({
        time: to24h(time12),
        type: mapTypeToDE(typeEn),
        height_m: parseFloatSafe(heightTxt),
      });
    });

    if (entries.length) {
      days.push({
        date: isoDate, // "YYYY-MM-DD"
        entries,
      });
    }
  });

  if (!days.length) throw new Error("Kein einziger Tag mit Einträgen geparst.");

  // Metadaten
  const updatedAt = new Date().toLocaleString("de-DE", {
    timeZone: "Atlantic/Canary",
    hour12: false,
  });

  const payload = {
    timezone: "WET",
    updatedAt,
    days,
  };

  // Zielordner/Datei
  const outDir = path.join(__dirname, "..", "public", "data");
  const outFile = path.join(outDir, "latest.json");
  await fs.promises.mkdir(outDir, { recursive: true });
  await fs.promises.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");

  log(`Gespeichert: ${days.length} Tage → ${outFile}`);
}

run().catch((err) => {
  console.error("FEHLER:", err.message);
  process.exit(1);
});
