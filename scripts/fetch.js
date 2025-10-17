import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";

// Hilfsfunktion: "12:09 PM" / "6:35 AM" -> "12:09" / "06:35" (24h)
function to24h(timeStr) {
  if (!timeStr) return "";
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return timeStr.trim();
  let [_, h, min, mer] = m;
  h = parseInt(h, 10);
  if (mer) {
    mer = mer.toUpperCase();
    if (mer === "PM" && h < 12) h += 12;
    if (mer === "AM" && h === 12) h = 0;
  }
  return `${h.toString().padStart(2, "0")}:${min}`;
}

async function scrapeTides() {
  const url = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
  const response = await fetch(url);
  const html = await response.text();
  const $ = cheerio.load(html);

  const days = [];

  $(".tide-day").each((i, el) => {
    const date = $(el).find(".tide-day__date").text().trim().replace("Tide Times for Playa del Ingles:", "").trim();
    const entries = [];

    $(el)
      .find("table.tide-day-tides tr")
      .each((j, tr) => {
        const tds = $(tr).find("td");
        if (tds.length >= 3) {
          const type = $(tds[0]).text().trim();
          const time = to24h($(tds[1]).text().trim());
          const heightText = $(tds[2]).text().trim();
          const height = parseFloat(heightText);
          if (type && !isNaN(height)) {
            entries.push({ time, type, height });
          }
        }
      });

    if (entries.length > 0) {
      days.push({
        date,
        entries,
      });
    }
  });

  const updatedAt = new Date().toLocaleString("de-DE", {
    timeZone: "Atlantic/Canary",
  });

  fs.writeFileSync(
    "./data/latest.json",
    JSON.stringify({ updatedAt, days }, null, 2)
  );

  console.log(`✅ Gespeichert: ${days.length} Tage (${updatedAt})`);
}

scrapeTides().catch((err) => console.error(err));
