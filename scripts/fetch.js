// scripts/fetch.js
// Holt die heutigen Gezeitenzeiten für Playa del Inglés von tide-forecast.com
// und schreibt sie als public/latest.json (Höhen garantiert in METERN).

import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

// ---- Konfiguration ----
const TIDE_URL =
  "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";

const TIMEZONE = "Atlantic/Canary";

// ---- Hilfen ----
const ftToM = (ft) => +(parseFloat(String(ft).replace(",", ".")) * 0.3048).toFixed(2);

function parseMetersFromHeightCell(txt) {
  // Beispiele:
  // "0.64 m (2.1 ft)"  -> nimm 0.64
  // "2.1 ft (0.64 m)"  -> nimm 0.64
  // "2.1 ft"           -> rechne in m um
  // "0,64 m"           -> Komma als Dezimaltrenner
  const s = String(txt).trim();

  // 1) direkter Meter-Treffer
  const mMatch = s.match(/([\d.,]+)\s*m\b/i);
  if (mMatch) {
    const val = mMatch[1].replace(",", ".");
    const meters = parseFloat(val);
    if (!Number.isNaN(meters)) return +meters.toFixed(2);
  }

  // 2) kein 'm' gefunden → Feet extrahieren und umrechnen
  const ftMatch = s.match(/([\d.,]+)\s*ft\b/i);
  if (ftMatch) {
    const ftVal = ftMatch[1].replace(",", ".");
    const meters = ftToM(ftVal);
    return meters;
  }

  // 3) letzter Fallback: erste Zahl nehmen, wenn vorhanden
  const any = s.match(/([\d.,]+)/);
  if (any) {
    const n = parseFloat(any[1].replace(",", "."));
    if (!Number.isNaN(n)) return +n.toFixed(2);
  }
  return null;
}

function to24h(h, m, ampm) {
  let hour = parseInt(h, 10);
  const min = parseInt(m, 10);
  const ap = (ampm || "").toUpperCase();
  if (ap === "PM" && hour !== 12) hour += 12;
  if (ap === "AM" && hour === 12) hour = 0;
  const pad = (x) => String(x).padStart(2, "0");
  return `${pad(hour)}:${pad(min)}`;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} beim Laden von ${url}`);
  return await res.text();
}

function parseTable(html) {
  const $ = cheerio.load(html);

  // Finde die Tabelle unter der Überschrift "Today's tide times for Playa del Ingles"
  const h2 = $("h2")
    .filter((_, el) =>
      $(el).text().trim().startsWith("Today’s tide times for Playa del Ingles") ||
      $(el).text().trim().startsWith("Today's tide times for Playa del Ingles")
    )
    .first();

  const rows = [];
  if (h2.length) {
    const table = h2.parent().find("table").first();
    table.find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 3) return;

      const typeTxt = $(tds[0]).text().trim(); // "Low Tide" / "High Tide"
      const timeTxt = $(tds[1]).text().trim(); // "4:27 AM"
      const heightTxt = $(tds[2]).text().trim(); // "0.64 m (2.1 ft)" o.ä.

      // Zeit in 24h
      let zeit = timeTxt;
      const tm = timeTxt.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (tm) zeit = to24h(tm[1], tm[2], tm[3]);

      // Höhe in METERN
      const hoehe_m = parseMetersFromHeightCell(heightTxt);
      if (hoehe_m == null || !zeit) return;

      rows.push({
        zeit,
        typ: /high/i.test(typeTxt) ? "Hochwasser" : "Niedrigwasser",
        hoehe_m,
      });
    });
  }

  return rows.slice(0, 4);
}

function generatedAtLocalTZ() {
  // schöner lokaler Zeitstempel in Canary-Zeit
  const fmt = new Intl.DateTimeFormat("de-DE", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date()).replace(",", "");
}

(async () => {
  console.log("🔎 Lade Seite:", TIDE_URL);
  const html = await fetchHtml(TIDE_URL);

  let tides = parseTable(html);

  // Fallback: Wenn die strukturierte Tabelle nicht gefunden wurde, versuche Regex auf dem reinen Text
  if (tides.length < 4) {
    const text = cheerio.load(html)("body").text().replace(/\s+/g, " ");
    const re =
      /(Low Tide|High Tide)[^0-9]*?(\d{1,2}):(\d{2})\s*(AM|PM)[^mft]*?((?:[\d.,]+\s*m)|(?:[\d.,]+\s*ft))/gi;

    let m;
    tides = [];
    while ((m = re.exec(text)) && tides.length < 4) {
      const zeit = to24h(m[2], m[3], m[4]);
      const typ = /high/i.test(m[1]) ? "Hochwasser" : "Niedrigwasser";
      const hoehe_m = parseMetersFromHeightCell(m[5]);
      if (hoehe_m != null) tides.push({ zeit, typ, hoehe_m });
    }
  }

  console.log(`✅ ${tides.length} Gezeiten-Einträge gefunden`);
  const out = {
    meta: {
      location: "Playa del Inglés",
      timezone: TIMEZONE,
      generatedAt: generatedAtLocalTZ(), // schöne Canary-Zeit
    },
    tides,
  };

  const outDir = path.join(process.cwd(), "public");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "latest.json"),
    JSON.stringify(out, null, 2),
    "utf8"
  );
  console.log(
    `📄 public/latest.json geschrieben mit ${tides.length} Einträgen`
  );
})().catch((err) => {
  console.error("❌ Fetch failed:", err);
  process.exit(1);
});
