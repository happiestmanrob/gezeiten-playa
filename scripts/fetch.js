// scripts/fetch.js
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const URL = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";

async function scrapeTides() {
  console.log("🌊 Starte Puppeteer und lade Gezeiten für Playa del Inglés...");
  console.log("🔗 URL:", URL);

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

  // Warte ein paar Sekunden, bis die Tabelle gerendert ist
  await page.waitForSelector(".tide-day__table", { timeout: 20000 });

  const html = await page.content();
  await browser.close();

  // Jetzt mit cheerio parsen
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);

  const days = [];

  $(".tide-day").each((_, el) => {
    const title = $(el).find(".tide-day__date").text().trim();
    if (!title) return;

    const dateMatch = title.match(/([A-Za-z]+day)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (!dateMatch) return;
    const [, , day, month, year] = dateMatch;
    const dateISO = new Date(`${month} ${day}, ${year}`).toISOString().split("T")[0];

    const tides = [];

    $(el)
      .find(".tide-day__table tbody tr")
      .each((_, row) => {
        const cols = $(row).find("td");
        if (cols.length < 3) return;

        const timeText = $(cols[0]).text().trim();
        const typeText = $(cols[1]).text().trim();
        const heightText = $(cols[2]).text().trim();

        if (!timeText || !typeText || !heightText) return;

        const typ = typeText.includes("High") ? "Hochwasser" : "Niedrigwasser";

        const match = heightText.match(/([\d.,]+)/);
        let hoehe_m = null;
        if (match) {
          const ft = parseFloat(match[1].replace(",", "."));
          hoehe_m = (ft * 0.3048).toFixed(2);
        }

        if (!hoehe_m) return;

        tides.push({
          zeit: timeText.replace(/^0/, ""),
          typ,
          hoehe_m: parseFloat(hoehe_m),
        });
      });

    if (tides.length) {
      days.push({ date: dateISO, tides });
      console.log(`📅 ${dateISO}: ${tides.length} Einträge`);
    }
  });

  if (!days.length) throw new Error("❌ Keine Gezeiten-Tabelle gefunden!");

  const result = {
    meta: {
      location: "Playa del Inglés",
      timezone: "Atlantic/Canary",
      generatedAt: new Date().toISOString(),
    },
    days,
  };

  const outputDir = path.resolve("public/data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, "latest.json");
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf8");

  console.log(`✅ Erfolgreich geschrieben: ${outputFile} (${days.length} Tage)`);
}

scrapeTides().catch((err) => {
  console.error("🚨 Fehler:", err.message);
  process.exit(1);
});
