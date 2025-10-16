// scripts/fetch.js
// Holt exakte Tageszeiten für Playa del Inglés von tide-forecast.com
// und schreibt sie als public/latest.json (nur: Zeit, Typ, Höhe in m).

import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

// ---- Konfiguration ----
const TIDE_URL =
  "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
const TIMEZONE = "Atlantic/Canary";

// Helpers
const pad = (n) => String(n).padStart(2, "0");
function to24h(h, m, ampm) {
  let hour = parseInt(h, 10);
  const min = parseInt(m, 10);
  const am = ampm.toUpperCase() === "AM";
  if (!am && hour !== 12) hour += 12;
  if (am && hour === 12) hour = 0;
  return `${pad(hour)}:${pad(min)}`;
}
function todayAt(timeHHMM, tz) {
  const [hh, mm] = timeHHMM.split(":").map(Number);
  // "heute in TZ" als ISO erzeugen
  const nowTz = new Date(
    new Date().toLocaleString("en-US", { timeZone: tz })
  );
  nowTz.setHours(hh, mm, 0, 0);
  return nowTz.toISOString();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept-Language": "en,en-US;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`tide-forecast antwortete mit ${res.status}`);
  return await res.text();
}

function parseTides(html) {
  const $ = cheerio.load(html);
  const rows = [];

  // Suche die Tabelle mit der Spalte "Height"
  const table = $('table:has(th:contains("Height"))').first();
  if (table.length) {
    table.find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 3) return;

      const typeTxt = $(tds[0]).text().trim(); // "Low Tide"/"High Tide"
      const timeTxt = $(tds[1]).text().trim(); // "4:27 AM"
      const hCell = $(tds[2]).text().trim();   // "0.64 m (2.1 ft)" o.ä.

      // AM/PM -> 24h
      const mt = timeTxt.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!mt) return;
      const timeStr = to24h(mt[1], mt[2], mt[3]);

      // Meterwert robust herausziehen
      let height = null;
      const mMatch = hCell.match(/(\d+(?:\.\d+)?)\s*m\b/);
      if (mMatch) {
        height = parseFloat(mMatch[1]);
      } else {
        // Fallback: nur feet gefunden? -> in Meter umrechnen
        const ftMatch = hCell.match(/(\d+(?:\.\d+)?)\s*ft\b/);
        if (ftMatch) {
          height = parseFloat(ftMatch[1]) * 0.3048;
        }
      }
      if (height == null) return;

      rows.push({
        type: /high/i.test(typeTxt) ? "High" : "Low",
        timeStr,
        height: Math.round(height * 100) / 100, // auf 2 Stellen
        iso: todayAt(timeStr, TIMEZONE),
      });
    });
  }

  // Fallback (falls DOM-Struktur abweicht)
  if (rows.length < 4) {
    const slice = $("body").text().replace(/\s+/g, " ");
    const re =
      /(Low Tide|High Tide)[^0-9]*?(\d{1,2}):(\d{2})\s*(AM|PM)[^0-9]*?(\d+(?:\.\d+)?)\s*m/gi;
    let m;
    while ((m = re.exec(slice)) && rows.length < 4) {
      const timeStr = to24h(m[2], m[3], m[4]);
      rows.push({
        type: /high/i.test(m[1]) ? "High" : "Low",
        timeStr,
        height: parseFloat(m[5]),
        iso: todayAt(timeStr, TIMEZONE),
      });
    }
  }

  return rows.slice(0, 4);
}

(async () => {
  const html = await fetchHtml(TIDE_URL);
  const tides = parseTides(html);

  const out = {
    meta: {
      location: "Playa del Inglés",
      timezone: TIMEZONE,
      generatedAt: new Date().toISOString(),
      source: "tide-forecast.com (parsed)",
    },
    tides,
  };

  const outDir = path.join(process.cwd(), "frontend");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "data.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("✅ Wrote frontend/data.json with", tides.length, "entries");

})().catch((err) => {
  console.error("❌ Fetch failed:", err);
  process.exit(1);
});
