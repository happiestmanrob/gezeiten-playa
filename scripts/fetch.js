/**
 * 🌊 fetch.js – lädt Gezeiten-Daten für Playa del Inglés
 * und speichert sie als JSON (für das Frontend).
 */

import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const url = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
console.log("🌊 Lade Gezeiten von:", url);

async function fetchTides() {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const days = [];

    $(".tide-day").each((_, el) => {
      const dateText = $(el).find(".tide-day__date").text().trim();
      const entries = [];

      $(el)
        .find(".tide-day__tide")
        .each((_, tideEl) => {
          const time = $(tideEl).find(".tide-day__time").text().trim();
          const type = $(tideEl).find(".tide-day__type").text().trim();
          const heightText = $(tideEl).find(".tide-day__height").text().trim();

          // Beispiel: "6.20ft" → Meter umrechnen
          const match = heightText.match(/([\d.,]+)/);
          let height = null;
          if (match) {
            const ft = parseFloat(match[1].replace(",", "."));
            height = (ft * 0.3048).toFixed(2).replace(".", ","); // Meter
          }

          if (time && type && height) {
            entries.push({
              time,
              type: type.includes("High") ? "Hochwasser" : "Niedrigwasser",
              height,
            });
          }
        });

      if (dateText && entries.length > 0) {
        days.push({ date: convertDateToISO(dateText), entries });
      }
    });

    const data = {
      updatedAt: new Date().toLocaleString("de-DE", { timeZone: "Europe/Lisbon" }),
      days,
    };

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/latest.json", JSON.stringify(data, null, 2));

    console.log(`✅ Gespeichert: ${days.length} Tage (${data.updatedAt})`);
  } catch (err) {
    console.error("❌ Fehler beim Laden:", err.message);
  }
}

/**
 * Konvertiert "Saturday 19 October 2025" → "2025-10-19"
 */
function convertDateToISO(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toISOString().split("T")[0];
  } catch {
    return dateStr;
  }
}

await fetchTides();
