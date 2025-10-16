import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const url = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";

function toISODate(text) {
  // Wandelt z. B. "Friday 17 October 2025" → "2025-10-17"
  const months = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12"
  };
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const d = m[1].padStart(2, "0");
  const mo = months[m[2].toLowerCase()];
  const y = m[3];
  return `${y}-${mo}-${d}`;
}

async function fetchTides() {
  console.log("🌊 Lade Gezeiten für Playa del Inglés ...");
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  const days = [];

  $(".tide-day").each((_, el) => {
    const dateText = $(el).find(".tide-day__date").text().trim();
    const isoDate = toISODate(dateText);
    if (!isoDate) return;

    const entries = [];
    $(el)
      .find("table.tide-day-tides tbody tr")
      .each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length >= 3) {
          const typeRaw = $(tds[0]).text().trim();
          const time = $(tds[1]).text().trim();
          const height = $(tds[2]).text().trim().split(" ")[0];
          const type =
            typeRaw.toLowerCase().includes("high") ? "Hochwasser" : "Niedrigwasser";
          if (type && time && height) entries.push({ type, time, height });
        }
      });

    const sunrise = $(el).find('img[src*="sunrise.svg"]').next(".tide-day__value").text().trim();
    const sunset = $(el).find('img[src*="sunset.svg"]').next(".tide-day__value").text().trim();
    const moonrise = $(el).find('img[src*="moonrise.svg"]').next(".tide-day__value").text().trim();
    const moonset = $(el).find('img[src*="moonset.svg"]').next(".tide-day__value").text().trim();

    days.push({
      date: isoDate,
      tides: entries,
      sun: { sunrise, sunset },
      moon: { moonrise, moonset }
    });
  });

  const output = {
    location: "Playa del Inglés",
    meta: { generatedAt: new Date().toISOString() },
    days
  };

  fs.writeFileSync("./public/latest.json", JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ ${days.length} Tage erfolgreich gespeichert.`);
}

fetchTides().catch((err) => console.error("❌ Fehler:", err));
