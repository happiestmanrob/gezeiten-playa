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
  let hh = parseInt(h, 10), mm = parseInt(m, 10);
  const am = ampm.toUpperCase() === "AM";
  if (!am && hh !== 12) hh += 12;
  if (am && hh === 12) hh = 0;
  return `${pad(hh)}:${pad(mm)}`;
}

async function getHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; GezeitenBot/1.0)",
      "Accept": "text/html"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return await res.text();
}

function parseTable(html) {
  const $ = cheerio.load(html);
  const rows = [];

  const table = $('h2:contains("Today\'s tide times for Playa del Ingles")')
    .nextAll("table").first();
  table.find("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) return;

    const typeTxt = $(tds[0]).text().trim();               // "Low Tide" / "High Tide"
    const timeTxt = $(tds[1]).text().trim();               // "4:27 AM"
    const heightTxt = $(tds[2]).text().replace(/\s+/g, " "); // "0.64 m (2.1 ft)"

    const tm = timeTxt.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    const hm = heightTxt.match(/([\d.,]+)\s*m/i);          // <-- explizit „m“!

    if (!tm || !hm) return;

    const timeStr = to24h(tm[1], tm[2], tm[3]);
    const height = parseFloat(hm[1].replace(",", "."));
    const type = /high/i.test(typeTxt) ? "High" : "Low";

    rows.push({ timeStr, type, height });
  });

  return rows.slice(0, 4);
}

function parseLiveTrend(html) {
  const $ = cheerio.load(html);
  const liveText = $('div:contains("The tide is")').first().text().replace(/\s+/g, " ");
  const rising = /The tide is rising/i.test(liveText);
  const falling = /The tide is falling/i.test(liveText);

  // Greife beide „Next … TIDE … at HH:MM AM/PM“
  const text = $("body").text().replace(/\s+/g, " ");
  const nextHigh = text.match(/Next\s*↑?\s*HIGH TIDE.*?at\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  const nextLow  = text.match(/Next\s*↓?\s*LOW TIDE.*?at\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);

  function toDateToday(h, m, ap) {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
    const hhmm = to24h(h, m, ap);
    const [hh, mm] = hhmm.split(":").map(Number);
    d.setHours(hh, mm, 0, 0);
    return d;
  }

  const candidates = [];
  if (nextHigh) candidates.push({ type: "High", at: toDateToday(nextHigh[1], nextHigh[2], nextHigh[3]) });
  if (nextLow)  candidates.push({ type: "Low",  at: toDateToday(nextLow[1],  nextLow[2],  nextLow[3]) });

  // Wähle die nächstliegende zukünftige Zeit (kanarische Zeit!)
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
  const future = candidates.filter(c => c.at.getTime() > now.getTime())
                          .sort((a,b)=>a.at-b.at)[0];

  const state = rising ? "rising" : (falling ? "falling" : null);
  let next = null;
  if (future) {
    next = {
      type: future.type,
      timeStr: `${pad(future.at.getHours())}:${pad(future.at.getMinutes())}`
    };
  }

  return { state, next };
}

(async () => {
  const html = await getHtml(TIDE_URL);
  const tides = parseTable(html);
  const trend = parseLiveTrend(html);

  const out = {
    location: "Playa del Inglés",
    timezone: TIMEZONE,
    dateDe: new Date().toLocaleDateString("de-DE", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: TIMEZONE
    }),
    generatedAt: new Date().toISOString(),
    tides,        // [{timeStr, type, height}]
    trend         // {state: 'rising'|'falling', next: {type, timeStr}|null}
  };

  fs.writeFileSync(path.join(OUTDIR, "latest.json"), JSON.stringify(out, null, 2));
  console.log("✅ geschrieben: public/latest.json");
})().catch(e => {
  console.error("❌ fetch failed:", e);
  process.exit(1);
});
