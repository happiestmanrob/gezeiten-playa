// scripts/fetch.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const URL = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";

async function scrapeTides() {
  console.log("🌊 Lade Gezeiten für Playa del Inglés ...");
  console.log("🔗 URL:", URL);

  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} beim Laden der Seite.`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const days = [];

  // Finde ALLE h3-Überschriften mit Tagesinfos
  $("h3").each((_, el) => {
    const title = $(el).text().trim();
    if (!title.match(/Playa del Ingles/i)) return;

    // Versuche, das Datum aus dem Text zu extrahieren
    const dateMatch = title.match(/([A-Za-z]+day) (\d{1,2}) ([A-Za-z]+) (\d{4})/);
    if (!dateMatch) return;

    const [, , day, month, year] = dateMatch;
    const dateStr = `${day} ${month} ${year}`;
    const dateISO = new Date(`${month} ${day}, ${year}`).toISOString().split("T")[0];

    // Tabelle direkt nach der Überschrift suchen
    const table = $(el).next("table");
    if (!table.length) return;

    const tides = [];

    table.find("tr").each((_, row) => {
      const cols = $(row).find("td");
      if (cols.length < 3) return;

      const typeText = $(cols[0]).text().trim();
      const timeText = $(cols[1]).text().trim().split(/\s+/)[0];
      const heightText = $(cols[2]).text().trim();

      if (!typeText || !timeText || !heightText) return;

      const typ = typeText.includes("High") ? "Hochwasser" : "Niedrigwasser";
      const meterMatch = heightText.match(/([\d.]+)\s*m/);
      const hoehe_m = meterMatch ? parseFloat(meterMatch[1]) : null;

      if (!hoehe_m) return;

      tides.push({
        zeit: timeText.replace(/^0/, ""), // z.B. "04:27" statt "04:27 AM"
        typ,
        hoehe_m,
      });
    });

    if (tides.length) {
      days.push({ date: dateISO, tides });
    }
  });

  if (!days.length) {
    throw new Error("❌ Keine Gezeiten-Tabelle gefunden!");
  }

  const result = {
    meta: {
      location: "Playa del Inglés",
      timezone: "Atlantic/Canary",
      generatedAt: new Date().toISOString(),
    },
    days,
  };

  const outputDir = path.resolve("public");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, "latest.json");
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf8");

  console.log(`✅ Erfolgreich geschrieben: ${outputFile} (${days.length} Tage)`);
}

scrapeTides().catch((err) => {
  console.error("🚨 Fehler:", err.message);
  process.exit(1);
});
