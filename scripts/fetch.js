import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const url = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";

async function fetchTides() {
  console.log("🌊 Lade Gezeiten für Playa del Inglés ...");
  console.log("URL:", url);

  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  const days = [];

  // Alle Tage mit Gezeiten finden
  $(".tide-day").each((_, el) => {
    const date = $(el).find(".tide-day__date").text().trim().replace("Tide Times for Playa del Ingles", "").trim();
    if (!date) return;

    const entries = [];
    $(el)
      .find("table.tide-day-tides tbody tr")
      .each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length >= 3) {
          const type = $(tds[0]).text().trim();
          const time = $(tds[1]).text().trim();
          const height = $(tds[2]).text().trim().split(" ")[0];
          if (type && time && height) {
            entries.push({ type, time, height });
          }
        }
      });

    // 🌅 Sonnen- und Mondzeiten
    const sunrise = $(el).find('img[src*="sunrise.svg"]').next(".tide-day__value").text().trim();
    const sunset = $(el).find('img[src*="sunset.svg"]').next(".tide-day__value").text().trim();
    const moonrise = $(el).find('img[src*="moonrise.svg"]').next(".tide-day__value").text().trim();
    const moonset = $(el).find('img[src*="moonset.svg"]').next(".tide-day__value").text().trim();

    // 🌙 Mondphase aus dem großen Tabellenabschnitt (nicht immer im selben .tide-day)
    let moonPhase = "";
    const moonPhaseLabel = $('svg[aria-label*="moon phase"]').attr("aria-label");
    if (moonPhaseLabel) {
      const match = moonPhaseLabel.match(/moon phase is ([^)]+)/);
      if (match) moonPhase = match[1].trim();
    }

    // 🌕 Markiere Neumond / Vollmond (für Springflut)
    let springTide = false;
    if (moonPhase.toLowerCase().includes("new moon") || moonPhase.toLowerCase().includes("full moon")) {
      springTide = true;
    }

    days.push({
      date,
      entries,
      sunrise,
      sunset,
      moonrise,
      moonset,
      moonPhase,
      springTide
    });
  });

  if (days.length === 0) {
    console.error("❌ Keine Gezeitendaten gefunden!");
    process.exit(1);
  }

  const output = {
    location: "Playa del Inglés",
    updated: new Date().toISOString(),
    days
  };

  fs.writeFileSync("./public/latest.json", JSON.stringify(output, null, 2), "utf-8");
  console.log(`✅ Erfolgreich geschrieben: ${days.length} Tage`);
}

fetchTides().catch(err => {
  console.error("Fehler:", err.message);
  process.exit(1);
});
