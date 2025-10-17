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

  // Neuer Selektor: .tide-day bleibt, aber h4.tide-day__date gibt es nicht mehr
  $(".tide-day").each((_, el) => {
    const title =
      $(el).find(".tide-day__date").text().trim() ||
      $(el).find("caption").text().trim(); // Fallback

    if (!title) return;

    // Beispiel: "Friday 17 October 2025"
    const dateMatch = title.match(/([A-Za-z]+day)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (!dateMatch) return;

    const [, , day, month, year] = dateMatch;
    const dateISO = new Date(`${month} ${day}, ${year}`).toISOString().split("T")[0];

    const tides = [];

    // Neuer Tabellen-Selektor: war "table.tide-day-tides", ist jetzt "table.tide-table"
    $(el)
      .find("table.tide-table tbody tr")
      .each((_, row) => {
        const cols = $(row).find("td");
        if (cols.length < 3) return;

        const timeText = $(cols[0]).text().trim();
        const typeText = $(cols[1]).text().trim();
        const heightText = $(cols[2]).text().trim();

        if (!timeText || !typeText || !heightText) return;

        const typ = typeText.includes("High") ? "Hochwasser" : "Niedrigwasser";

        // Höhe kann in ft angegeben sein -> in m umrechnen
        const heightMatch = heightText.match(/([\d.,]+)/);
        let hoehe_m = null;
        if (heightMatch) {
          const ft = parseFloat(heightMatch[1].replace(",", "."));
          hoehe_m = (ft * 0.3048).toFixed(2); // Umrechnung ft → m
        }

        if (!hoehe_m) return;

        tides.push({
          zeit: timeText.replace(/^0/, ""), // 00:03 → 0:03
          typ,
          hoehe_m: parseFloat(hoehe_m),
        });
      });

    if (tides.length) {
      days.push({ date: dateISO, tides });
      console.log(`📅 ${dateISO}: ${tides.length} Einträge`);
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
