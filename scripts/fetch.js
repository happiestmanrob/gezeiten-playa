import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

// Ziel-URL (Tidenzeiten für Playa del Inglés)
const url = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";

// Ausgabepfad (relativ zum Repo)
const outputDir = "data";
const outputFile = path.join(outputDir, "latest.json");

// Hilfsfunktion: Datum formatieren
function formatGermanDate(dateObj) {
  return dateObj.toLocaleDateString("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

// 🌊 Hauptfunktion
async function scrapeTides() {
  console.log("🌊 Lade Gezeiten von:", url);

  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const days = [];
    $(".tide-day").each((_, el) => {
      const date = $(el).find(".date").text().trim();
      const entries = [];

      $(el)
        .find(".tide-events tr")
        .each((_, row) => {
          const time = $(row).find("td:nth-child(1)").text().trim();
          const type = $(row).find("td:nth-child(2)").text().trim();
          const height = parseFloat($(row).find("td:nth-child(3)").text().trim()) || null;
          if (time && type) {
            entries.push({ time, type, height });
          }
        });

      if (entries.length > 0) days.push({ date, entries });
    });

    // Wenn keine Daten gefunden → Fehler
    if (days.length === 0) {
      throw new Error("Keine Gezeitendaten gefunden.");
    }

    // Ordner "data" erstellen, falls nicht vorhanden
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // JSON-Datei schreiben
    const now = new Date();
    const data = {
      updatedAt: formatGermanDate(now) + ", " + now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      days
    };

    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
    console.log(`✅ Gespeichert: ${days.length} Tage (${data.updatedAt})`);
  } catch (err) {
    console.error("❌ Fehler beim Abrufen der Gezeitendaten:", err.message);
    process.exit(1);
  }
}

// Skript ausführen
scrapeTides();
