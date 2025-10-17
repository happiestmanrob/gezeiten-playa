import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const url = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
console.log("🌊 Lade Gezeiten von:", url);

try {
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);

  const days = [];

  $(".tide-day").each((_, day) => {
    const date = $(day).find(".tide-day__date").text().trim();
    const entries = [];

    $(day)
      .find(".tide-day__tide")
      .each((_, tide) => {
        entries.push({
          time: $(tide).find(".tide-day__time").text().trim(),
          type: $(tide).find(".tide-day__type").text().trim(),
          height: $(tide).find(".tide-day__height").text().trim(),
        });
      });

    if (date && entries.length > 0) {
      days.push({ date, entries });
    }
  });

  const data = {
    updatedAt: new Date().toLocaleString("de-DE", { timeZone: "Europe/Lisbon" }),
    days,
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/latest.json", JSON.stringify(data, null, 2));

  console.log(`✅ Gespeichert: ${days.length} Tage (${data.updatedAt})`);
} catch (error) {
  console.error("❌ Fehler beim Laden der Gezeiten:", error.message);
}
