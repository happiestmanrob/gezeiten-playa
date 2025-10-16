// scripts/fetch.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const URL =
  "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";

async function scrapeTides() {
  console.log(`🌊 Lade Seite: ${URL}`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Fehler beim Abruf: ${res.status}`);
  const html = await res.text();

  const $ = cheerio.load(html);

  // Tabellenzeilen mit Zeiten, Typen, Höhen
  const rows = $("table.tide-table tbody tr");
  if (!rows.length) throw new Error("Keine Gezeiten-Tabelle gefunden!");

  let tides = [];
  let currentDate = null;

  rows.each((_, el) => {
    const dateCell = $(el).find("th").text().trim();
    const timeCell = $(el).find("td.time").text().trim();
    const typeCell = $(el).find("td.event").text().trim();
    const heightCell = $(el).find("td.height").text().trim();

    // Neue Tageszeile erkannt (z. B. “Thursday 17 October”)
    if (dateCell && !timeCell) {
      const parsed = parseDate(dateCell);
      currentDate = parsed;
      return;
    }

    // Nur Zeilen mit Uhrzeit etc.
    if (!timeCell || !typeCell || !heightCell || !currentDate) return;

    const zeit = timeCell.replace(/\s+/g, "");
    const typ = typeCell.includes("High") ? "Hochwasser" : "Niedrigwasser";

    // Höhe (ft → m)
    const heightFt = parseFloat(heightCell.replace(/[^\d.]/g, ""));
    const hoehe_m = +(heightFt * 0.3048).toFixed(2);

    tides.push({
      date: currentDate,
      zeit,
      typ,
      hoehe_m
    });
  });

  // Nach Datum gruppieren
  const grouped = {};
  for (const t of tides) {
    if (!grouped[t.date]) grouped[t.date] = [];
    grouped[t.date].push({
      zeit: t.zeit,
      typ: t.typ,
      hoehe_m: t.hoehe_m
    });
  }

  const days = Object.entries(grouped).map(([date, tides]) => ({
    date,
    tides
  }));

  const result = {
    meta: {
      location: "Playa del Inglés",
      timezone: "Atlantic/Canary",
      generatedAt: new Date().toISOString()
    },
    days
  };

  const outputDir = path.resolve("public");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, "latest.json");
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf8");

  console.log(`✅ ./public/latest.json geschrieben mit ${days.length} Tagen`);
}

// Hilfsfunktion für Datumsformat von tide-forecast
function parseDate(dateStr) {
  // Beispiel: “Thursday 17 October”
  const months = {
    January: "01",
    February: "02",
    March: "03",
    April: "04",
    May: "05",
    June: "06",
    July: "07",
    August: "08",
    September: "09",
    October: "10",
    November: "11",
    December: "12"
  };

  const parts = dateStr.split(/\s+/);
  const day = parts.find((p) => /^\d+$/.test(p));
  const month = months[parts.find((p) => months[p])];
  const year = new Date().getFullYear();
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

scrapeTides().catch((err) => {
  console.error("❌ Fehler:", err.message);
  process.exit(1);
});
