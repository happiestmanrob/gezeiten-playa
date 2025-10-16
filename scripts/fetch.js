// scripts/fetch.js
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const TIDE_URL = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
const TIMEZONE = "Atlantic/Canary";
const OUTDIR = path.join(process.cwd(), "public");

if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

const pad = n => String(n).padStart(2, "0");

function to24h(h, m, ampm) {
  let hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (ampm.toUpperCase() === "PM" && hh !== 12) hh += 12;
  if (ampm.toUpperCase() === "AM" && hh === 12) hh = 0;
  return `${pad(hh)}:${pad(mm)}`;
}

async function getHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; GezeitenBot/2.0)",
      "Accept": "text/html"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return await res.text();
}

function extractMeters(text) {
  // Alle Werte mit m (z. B. "1.68 m" oder "(1.68 m)")
  const matches = [...text.matchAll(/([\d.,]+)\s*m/gi)];
  if (matches.length === 0) return null;
  // Nehme den letzten Treffer (meist der korrekte Meterwert)
  const val = matches[matches.length - 1][1];
  return parseFloat(val.replace(",", "."));
}


function parseTides(html) {
  const $ = cheerio.load(html);
  const rows = [];

  const table = $("table").filter((_, el) => {
    const text = $(el).text();
    return /Tide/i.test(text) && /Height/i.test(text);
  }).first();

  if (!table || table.length === 0) {
    console.warn("⚠️ Keine Gezeiten-Tabelle gefunden!");
    return [];
  }

  table.find("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) return;

    const typeTxt = $(tds[0]).text().trim();
    const timeTxt = $(tds[1]).text().trim();
    const heightTxt = $(tds[2]).text().trim();

    const tm = timeTxt.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!tm) return;

    const mMatch = heightTxt.match(/([\d.,]+)\s*m/i);
    let height = mMatch ? parseFloat(mMatch[1].replace(",", ".")) : null;

    if (!height) {
      const ftMatch = heightTxt.match(/([\d.,]+)\s*ft/i);
      if (ftMatch) {
        const ft = parseFloat(ftMatch[1].replace(",", "."));
        height = (ft * 0.3048);
      }
    }

    const timeStr = to24h(tm[1], tm[2], tm[3]);
    const type = /high/i.test(typeTxt) ? "High" : "Low";

    rows.push({ timeStr, type, height });
  });

  console.log(`✅ ${rows.length} Gezeiten-Einträge gefunden`);
  return rows;
}

}




  return rows.slice(0, 4);
}

function parseLiveTrend(html) {
  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ");
  const rising = /The tide is rising/i.test(bodyText);
  const falling = /The tide is falling/i.test(bodyText);

  const nextHigh = bodyText.match(/Next[^A]*HIGH TIDE[^A]*at\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  const nextLow  = bodyText.match(/Next[^A]*LOW TIDE[^A]*at\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));

  function toIso(h, m, ap) {
    const d = new Date(now);
    const timeStr = to24h(h, m, ap);
    const [hh, mm] = timeStr.split(":").map(Number);
    d.setHours(hh, mm, 0, 0);
    return d;
  }

  const nextEvents = [];
  if (nextHigh) nextEvents.push({ type: "High", date: toIso(nextHigh[1], nextHigh[2], nextHigh[3]) });
  if (nextLow)  nextEvents.push({ type: "Low",  date: toIso(nextLow[1],  nextLow[2],  nextLow[3]) });

  const upcoming = nextEvents.filter(e => e.date > now).sort((a,b)=>a.date-b.date)[0];

  let state = rising ? "rising" : falling ? "falling" : null;
  return {
    state,
    next: upcoming
      ? { type: upcoming.type, timeStr: `${pad(upcoming.date.getHours())}:${pad(upcoming.date.getMinutes())}` }
      : null
  };
}

(async () => {
  const html = await getHtml(TIDE_URL);
  const tides = parseTides(html);
  const trend = parseLiveTrend(html);

  const out = {
    location: "Playa del Inglés",
    timezone: TIMEZONE,
    dateDe: new Date().toLocaleDateString("de-DE", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: TIMEZONE
    }),
    generatedAt: new Date().toISOString(),
    tides,
    trend
  };

fs.writeFileSync(path.join(OUTDIR, "latest.json"), JSON.stringify(out, null, 2));
console.log("✅ public/latest.json geschrieben mit", tides.length, "Einträgen");

})();
