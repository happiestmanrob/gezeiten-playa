// scripts/fetch.js
// Holt exakte Tageszeiten von tide-forecast.com (Playa del Inglés),
// ergänzt Sonne/Mond (Open-Meteo) und erzeugt public/latest.json


// CommonJS-Fallback
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
global.File = class {};

import path from "path";
import fs from "fs";
import * as cheerio from "cheerio";




// Node 18+ hat fetch bereits eingebaut — kein Import nötig!



// ---- Konfiguration ----
const TIDE_URL = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
// Alternativ (gleiche Seite, anderer Pfad-Slug):
// const TIDE_URL = "https://www.tide-forecast.com/Tide-Times-and-Tide-Chart-for-Playa-del-Ingles";

const LAT = 27.7416;
const LON = -15.5989;            // Playa del Inglés
const TIMEZONE = "Atlantic/Canary";

// Helper
function pad(n) { return String(n).padStart(2, "0"); }
function todayYMD(tz) {
  const d = new Date();
  return new Date(d.toLocaleString("en-US", { timeZone: tz }));
}
function to24h(h, m, ampm) {
  let hour = parseInt(h,10);
  const min  = parseInt(m,10);
  if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${pad(hour)}:${pad(min)}`;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      // „wie ein Browser“ auftreten:
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml"
    }
  });
  if (!res.ok) throw new Error(`tide-forecast antwortete mit ${res.status}`);
  return await res.text();
}

function parseTides(html) {
  const $ = cheerio.load(html);

  // Versuche 1: „Today's tide times for Playa del Ingles“ => nächste Tabelle
  const h2 = $('h2:contains("Today\'s tide times for Playa del Ingles")').first();
  let rows = [];
  if (h2.length) {
    const table = h2.parent().find("table").first();
    table.find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      const typeTxt = $(tds[0]).text().trim(); // "Low Tide" / "High Tide"
      const timeTxt = $(tds[1]).text().trim(); // "4:27 AM"
      const heightTxt = $(tds[2]).text().trim(); // "0.64 m"
      if (!typeTxt || !timeTxt || !heightTxt) return;

      const m = timeTxt.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      const h = m ? to24h(m[1], m[2], m[3]) : timeTxt;
      const height = parseFloat((heightTxt.match(/([\d.]+)/)||[])[1]);

      rows.push({
        type: /high/i.test(typeTxt) ? "High" : "Low",
        timeStr: h,
        height
      });
    });
  }

  // Fallback (robust, falls Struktur anders ist):
  if (rows.length < 4) {
    const allText = $("body").text().replace(/\s+/g," ");
    const anchor = allText.indexOf("Today's tide times for Playa del Ingles");
    const slice = anchor > 0 ? allText.slice(anchor, anchor + 4000) : allText;
    const re = /(Low Tide|High Tide)[^0-9]*?(\d{1,2}):(\d{2})\s*(AM|PM)[^0-9]*?([\d.]+)\s*m/gi;
    rows = [];
    let m;
    while ((m = re.exec(slice)) && rows.length < 4) {
      rows.push({
        type: /high/i.test(m[1]) ? "High" : "Low",
        timeStr: to24h(m[2], m[3], m[4]),
        height: parseFloat(m[5])
      });
    }
  }

  // Sicherstellen, dass höchstens 4 Einträge sind (heute)
  return rows.slice(0, 4);
}

function attachDateToTimeStr(timeStr, tz) {
  // Baue ISO für "heute TZ + HH:MM" → ISO-String (damit Frontend ggf. Datumsobjekt bauen kann)
  const today = todayYMD(tz);
  const [hh, mm] = timeStr.split(":").map(Number);
  today.setHours(hh, mm, 0, 0);
  return today.toISOString(); // UTC ISO
}

async function fetchAstronomy() {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&daily=sunrise,sunset,moon_phase,moon_phase_name&timezone=${encodeURIComponent(TIMEZONE)}`;
  const r = await fetch(url);
  const j = await r.json();
  return {
    sunrise: j.daily?.sunrise?.[0] || null,
    sunset:  j.daily?.sunset?.[0]  || null,
    moonPhaseName: j.daily?.moon_phase_name?.[0] || null,
    moonPhase: j.daily?.moon_phase?.[0] ?? null
  };
}

(async () => {
  const html = await fetchHtml(TIDE_URL);
  const tides = parseTides(html);

  // ISO-Zeiten hinzufügen (falls im Frontend benötigt)
  const tidesWithIso = tides.map(t => ({
    ...t,
    iso: attachDateToTimeStr(t.timeStr, TIMEZONE)
  }));

// Trend berechnen (steigt oder fällt)
let trend = "unbekannt";
if (tidesWithIso.length >= 2) {
  const diff = tidesWithIso[1].height - tidesWithIso[0].height;
  trend = diff > 0 ? "Das Wasser steigt" : "Das Wasser fällt";
}




  
  const astro = await fetchAstronomy();

  const out = {
  meta: {
    location: "Playa del Inglés",
    timezone: TIMEZONE,
    generatedAt: new Date().toISOString(),
    trend, // Neu hinzugefügt
    source: {
      tides: "tide-forecast.com (geparst)",
      astronomy: "Open-Meteo"
    }
  },
  tides: tidesWithIso.map(t => ({
    zeit: t.timeStr,
    typ: t.type === "High" ? "Hochwasser" : "Niedrigwasser",
    hoehe: t.height
  })),
  astronomy: {
    sonnenaufgang: astro.sunrise ? astro.sunrise.split("T")[1] : null,
    sonnenuntergang: astro.sunset ? astro.sunset.split("T")[1] : null,
    mondphase: astro.moonPhaseName || astro.moonPhase
  }
};


  // Schreiben
  const outDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(out, null, 2));
  console.log("✅ Gezeiten aktualisiert:", trend, "—", tidesWithIso.length, "Einträge");
})().catch(err => {
  console.error("❌ Fetch failed:", err);
  process.exit(1);
});
