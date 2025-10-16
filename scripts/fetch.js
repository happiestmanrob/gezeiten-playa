// scripts/fetch.js
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const BASE_URL = "https://www.tide-forecast.com/locations/Playa-del-Ingles/tides/latest";
const TIMEZONE = "Atlantic/Canary";
const OUTPUT_DIR = path.join(process.cwd(), "public");

// Stelle sicher, dass /public existiert
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function pad(n) { return String(n).padStart(2, "0"); }

function to24h(h, m, ampm) {
  let hour = parseInt(h, 10);
  const min = parseInt(m, 10);
  if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${pad(hour)}:${pad(min)}`;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; GezeitenBot/1.0)",
      "Accept": "text/html"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${url}`);
  return await res.text();
}

function parseTides(html) {
  const $ = cheerio.load(html);
  const rows = [];
  const table = $('h2:contains("Today\'s tide times for Playa del Ingles")')
    .nextAll("table").first();

  table.find("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    const typeTxt = $(tds[0]).text().trim();
    const timeTxt = $(tds[1]).text().trim();
    const heightTxt = $(tds[2]).text().trim();
    const m = timeTxt.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return;
    const time24 = to24h(m[1], m[2], m[3]);
    const height = parseFloat((heightTxt.match(/([\d.]+)/) || [])[1]);
    const type = /high/i.test(typeTxt) ? "High" : "Low";
    rows.push({ timeStr: time24, type, height });
  });
  return rows;
}

function attachDate(baseDate, timeStr) {
  const [hh, mm] = timeStr.split(":").map(Number);
  const local = new Date(new Date(baseDate).toLocaleString("en-US", { timeZone: TIMEZONE }));
  local.setHours(hh, mm, 0, 0);
  return local.toISOString();
}

async function generateData(dayOffset = 0) {
  const html = await fetchHtml(BASE_URL);
  const tides = parseTides(html);
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + dayOffset);

  const tidesWithIso = tides.map(t => ({
    ...t,
    iso: attachDate(baseDate, t.timeStr)
  }));

  const out = {
    date: new Date(baseDate).toLocaleDateString("de-DE", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE
    }),
    timezone: TIMEZONE,
    location: "Playa del Inglés",
    tides: tidesWithIso,
    generatedAt: new Date().toISOString()
  };

  const file = path.join(OUTPUT_DIR, `data-${dayOffset}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`✅ ${file} gespeichert (${tidesWithIso.length} Tiden)`);
}

(async () => {
  for (let i = 0; i < 3; i++) await generateData(i);
})();
