import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const url = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
console.log("🌊 Lade Gezeiten von:", url);

async function fetchTides() {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const days = [];

    // Jede Tabellenüberschrift repräsentiert einen Tag
    $("table.tide-day__table").each((_, table) => {
      const dateText = $(table).find("caption").text().trim(); // z.B. "Saturday 18 October 2025"
      const entries = [];

      $(table)
        .find("tbody tr")
        .each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length < 3) return;

          const time = $(cells[0]).text().trim(); // z.B. "06:01"
          const typeText = $(cells[1]).text().trim(); // "High Tide" oder "Low Tide"
          const heightText = $(cells[2]).text().trim(); // "5.58ft"

          if (!time || !typeText || !heightText) return;

          const match = heightText.match(/([\d.,]+)/);
          let height = null;
          if (match) {
            const ft = parseFloat(match[1].replace(",", "."));
            height = (ft * 0.3048).toFixed(2).replace(".", ",");
          }

          entries.push({
            time,
            type: typeText.includes("High") ? "Hochwasser" : "Niedrigwasser",
            height,
          });
        });

      if (entries.length > 0 && dateText) {
        days.push({ date: convertDateToISO(dateText), entries });
      }
    });

    const output = {
      updatedAt: new Date().toLocaleString("de-DE", { timeZone: "Europe/Lisbon" }),
      days,
    };

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/latest.json", JSON.stringify(output, null, 2));

    console.log(`✅ Gespeichert: ${days.length} Tage (${output.updatedAt})`);
  } catch (err) {
    console.error("❌ Fehler beim Abrufen:", err);
  }
}

function convertDateToISO(dateStr) {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d)) return d.toISOString().split("T")[0];
    return dateStr;
  } catch {
    return dateStr;
  }
}

await fetchTides();
