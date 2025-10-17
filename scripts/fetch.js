// scripts/fetch.js
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import * as cheerio from "cheerio";

const URL = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";

async function scrapeTides() {
  console.log("🌊 Lade Gezeiten für Playa del Inglés ...");
  console.log("🔗 URL:", URL);

  // Puppeteer starten
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

  // Warte, bis der heutige Bereich sichtbar ist
  await page.waitForSelector(".tide-header-today, .tide-header_card", { timeout: 30000 }).catch(() => null);

  const html = await page.content();
  await browser.close();

  const $ = cheerio.load(html);
  const days = [];

  // 🔹 Heute + zukünftige Tage laden
  const dayBlocks = $(".tide-header-today, .tide-header_card");

  dayBlocks.each((_, el) => {
    const title = $(el).find("h3").text().trim();
    if (!title) return;

    // Beispiel: "Friday 17 October 2025"
    const dateMatch = title.match(/([A-Za-z]+day)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (!dateMatch) return;

    const [, , day, month, year] = dateMatch;
    const dateISO = new Date(`${month} ${day}, ${year}`).toISOString().split("T")[0];

    const tides = [];

    // 🔹 Tabelle der Gezeiten auslesen
    $(el)
      .find("table.tide-day-tides tbody tr")
      .each((_, row) => {
        const cols = $(row).find("td");
        if (cols.length < 2) return;

        const typeText = $(cols[0]).text().trim();
        const timeText = $(cols[1]).find("b").first().text().trim();
        const heightText = $(cols[2]).text().trim();

        if (!typeText || !timeText || !heightText) return;

        const typ = typeText.includes("High") ? "Hochwasser" : "Niedrigwasser";

        // Höhe in Metern
        const meterMatch = heightText.match(/([\d.]+)\s*m/);
        const hoehe_m = meterMatch ? parseFloat(meterMatch[1]) : null;
        if (!hoehe_m) return;

        // 🔹 Zeit in 24-Stunden-Format umwandeln
        const zeit = convertTo24h(timeText);

        tides.push({ zeit, typ, hoehe_m });
      });

    if (tides.length) {
      days.push({ date: dateISO, tides });
      console.log(`📅 ${dateISO}: ${tides.length} Einträge`);
    }
  });

  if (!days.length) {
    throw new Error("❌ Keine Gezeiten-Daten gefunden!");
  }

  // Ergebnisstruktur
  const result = {
    meta: {
      location: "Playa del Inglés",
      timezone: "Atlantic/Canary",
      generatedAt: new Date().toISOString()
    },
    days
  };

  // 📂 JSON speichern
  const outputDir = path.resolve("public/data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, "latest.json");
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf8");

  console.log(`✅ Erfolgreich geschrieben: ${outputFile} (${days.length} Tage)`);
}

// 🕒 Hilfsfunktion: 12h → 24h Zeitformat (z. B. "5:55 PM" → "17:55")
function convertTo24h(timeStr) {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return timeStr;
  let [_, h, m, ap] = match;
  let hour = parseInt(h, 10);
  const minute = m.padStart(2, "0");

  if (ap) {
    ap = ap.toUpperCase();
    if (ap === "PM" && hour < 12) hour += 12;
    if (ap === "AM" && hour === 12) hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

scrapeTides().catch((err) => {
  console.error("🚨 Fehler:", err.message);
  process.exit(1);
});
