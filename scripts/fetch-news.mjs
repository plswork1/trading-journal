// ─────────────────────────────────────────────────────────────
// Agregator calendar economic: ForexFactory + Myfxbook + Investing.com
// Rulează:  npm run news
// Scrie:    public/news.json  (citit automat de tab-ul Calendar)
//
// NOTĂ: ForexFactory are feed JSON oficial-gratuit și merge mereu.
// Myfxbook și Investing.com NU au API — se face scraping best-effort.
// Dacă una din surse pică (schimbare de HTML), scriptul continuă cu
// celelalte și îți spune în consolă ce a mers.
//
// Myfxbook e în spatele Cloudflare Bot Management, care amprentează
// handshake-ul TLS — fetch/https din Node primesc mereu 403 ("Just a
// moment...") indiferent de headere, dar curl (Schannel pe Windows)
// trece. De-asta fetchMyfxbook() cheamă binarul `curl` din sistem ca
// subproces. Dacă `curl` nu e în PATH, sursa eșuează cu mesaj clar,
// dar scriptul continuă cu celelalte surse.
//
// Necesită Node 18+ (fetch nativ) și `curl` în PATH (pentru myfxbook).
// ─────────────────────────────────────────────────────────────

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'news.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const IMPACT_RANK = { High: 3, Medium: 2, Low: 1, Holiday: 0 };

// ── Utilitare ────────────────────────────────────────────────

function normName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9%\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function tokenOverlap(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  return a.filter((t) => setB.has(t)).length / Math.min(a.length, b.length);
}

function sameEvent(e1, e2) {
  if (e1.currency !== e2.currency) return false;
  if (Math.abs(e1.ts - e2.ts) > 5 * 60 * 1000) return false;
  return tokenOverlap(normName(e1.name), normName(e2.name)) >= 0.5;
}

function mergeAll(lists) {
  const merged = [];
  for (const list of lists) {
    for (const ev of list) {
      const found = merged.find((m) => sameEvent(m, ev));
      if (found) {
        if ((IMPACT_RANK[ev.impact] ?? -1) > (IMPACT_RANK[found.impact] ?? -1)) found.impact = ev.impact;
        found.forecast ||= ev.forecast;
        found.previous ||= ev.previous;
        found.actual ||= ev.actual;
        for (const s of ev.sources) if (!found.sources.includes(s)) found.sources.push(s);
      } else {
        merged.push({ ...ev, sources: [...ev.sources] });
      }
    }
  }
  return merged.sort((a, b) => a.ts - b.ts);
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// ── Sursa 1: ForexFactory (feed JSON gratuit — cea mai fiabilă) ──

async function fetchForexFactory() {
  const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data
    .map((raw) => {
      const ts = Date.parse(raw.date);
      if (!Number.isFinite(ts)) return null;
      let impact = raw.impact === 'Non-Economic' ? 'Low' : raw.impact;
      if (!(impact in IMPACT_RANK)) impact = 'Low';
      return {
        name: raw.title || '',
        currency: raw.country || '',
        ts,
        impact,
        forecast: raw.forecast || '',
        previous: raw.previous || '',
        actual: raw.actual || '',
        sources: ['forexfactory'],
      };
    })
    .filter(Boolean);
}

// ── Sursa 2: Myfxbook (scraping HTML — best effort) ─────────────
// Pagina: https://www.myfxbook.com/forex-economic-calendar
// Structura HTML se poate schimba; ajustează selectoarele dacă e nevoie.
// Cloudflare amprentează TLS-ul Node și dă mereu 403 la fetch/https,
// deci folosim `curl` (subproces) care trece — vezi nota din header.

async function fetchMyfxbook() {
  const { stdout: html } = await execFileAsync(
    'curl',
    ['-s', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', 'https://www.myfxbook.com/forex-economic-calendar'],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  if (!html) throw new Error('răspuns gol de la curl');

  const events = [];
  // Rândurile calendarului au de obicei atribute data-* cu timestamp și impact.
  // Căutăm blocuri <tr ...> care conțin data-calendar / economicCalendarRow.
  const rowRe = /<tr[^>]*class="[^"]*economicCalendarRow[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1]));
    if (cells.length < 6) continue;

    // Ordine tipică a coloanelor: Date | Time Left | Country | Currency | Event | Impact | Previous | Consensus | Actual
    // Verifică în browser (F12) dacă ordinea diferă și ajustează indecșii.
    const [, , , currency, name, impactStr, previous, forecast, actual] = cells;

    // Nu folosim textul celulei de dată ("Jul 12, 22:30") — nu are an, iar
    // Date.parse pe un string fără an cade pe anul 2001 (comportament clasic V8).
    // Rândul conține însă un atribut time="<epoch ms>" pe span-ul calendarLeft, exact.
    const timeM = row.match(/\btime="(\d+)"/);
    const ts = timeM ? Number(timeM[1]) : NaN;
    if (!Number.isFinite(ts) || !currency || !name) continue;

    let impact = 'Low';
    const imp = (impactStr || '').toLowerCase();
    if (imp.includes('high')) impact = 'High';
    else if (imp.includes('med')) impact = 'Medium';
    else if (imp.includes('holiday') || imp.includes('non')) impact = 'Holiday';

    events.push({
      name,
      currency: currency.toUpperCase().slice(0, 3),
      ts,
      impact,
      forecast: forecast || '',
      previous: previous || '',
      actual: actual || '',
      sources: ['myfxbook'],
    });
  }
  if (events.length === 0) throw new Error('parsare eșuată — HTML-ul s-a schimbat, ajustează selectoarele');
  return events;
}

// ── Sursa 3: Investing.com (endpoint intern — best effort) ──────
// Folosește același endpoint pe care îl apelează pagina lor de calendar.
// Spre deosebire de myfxbook, acest endpoint răspunde normal la fetch
// din Node (nu e blocat de Cloudflare) — dar HTML-ul rândurilor se
// schimbă din când în când, ceea ce rupe regex-urile de mai jos.
// Dacă sursa pică din nou, verifică mai întâi atributele reale ale
// <tr id="eventRowId_...">, nu presupune direct că e Cloudflare.

async function fetchInvesting() {
  const today = new Date();
  const end = new Date(today.getTime() + 7 * 24 * 3600 * 1000);
  const fmtDate = (d) => d.toISOString().slice(0, 10);

  const body = new URLSearchParams({
    dateFrom: fmtDate(today),
    dateTo: fmtDate(end),
    timeZone: '58', // GMT+2/+3 (Europe/Bucharest) — vezi lista lor de timezone IDs
    timeFilter: 'timeRemain',
    currentTab: 'custom',
    limit_from: '0',
  });
  // toate țările principale + toate nivelurile de importanță
  for (const c of [72, 5, 4, 35, 12, 6, 25, 37, 43]) body.append('country[]', String(c));
  for (const i of [1, 2, 3]) body.append('importance[]', String(i));

  const res = await fetch('https://www.investing.com/economic-calendar/Service/getCalendarFilteredData', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://www.investing.com/economic-calendar/',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (probabil Cloudflare)`);
  const json = await res.json();
  const html = json.data || '';

  const events = [];
  const rowRe = /<tr[^>]*id="eventRowId_\d+"[^>]*data-event-datetime="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const ts = Date.parse(m[1].replace(/\//g, '-').replace(' ', 'T') + 'Z'); // "2026/07/13 00:30:00" → UTC
    const row = m[2];
    if (!Number.isFinite(ts)) continue;

    const curM = row.match(/class="[^"]*flagCur[^"]*"[^>]*>[\s\S]*?<\/span>\s*([A-Z]{3})/i);
    const nameM = row.match(/<td[^>]*class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const bulls = (row.match(/grayFullBullishIcon/g) || []).length;
    const holiday = /holiday/i.test(row);

    const actM = row.match(/<td[^>]*id="eventActual_[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const fcM = row.match(/<td[^>]*id="eventForecast_[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const prevM = row.match(/<td[^>]*id="eventPrevious_[^"]*"[^>]*>([\s\S]*?)<\/td>/i);

    const name = nameM ? stripTags(nameM[1]) : '';
    const currency = curM ? curM[1].toUpperCase() : '';
    if (!name || !currency) continue;

    events.push({
      name,
      currency,
      ts,
      impact: holiday ? 'Holiday' : bulls >= 3 ? 'High' : bulls === 2 ? 'Medium' : 'Low',
      forecast: fcM ? stripTags(fcM[1]).replace(/^&nbsp;$/, '') : '',
      previous: prevM ? stripTags(prevM[1]) : '',
      actual: actM ? stripTags(actM[1]) : '',
      sources: ['investing'],
    });
  }
  if (events.length === 0) throw new Error('parsare eșuată sau blocat de Cloudflare');
  return events;
}

// ── Main ─────────────────────────────────────────────────────

const sources = [
  ['forexfactory', fetchForexFactory],
  ['myfxbook', fetchMyfxbook],
  ['investing', fetchInvesting],
];

const lists = [];
for (const [name, fn] of sources) {
  try {
    const evs = await fn();
    lists.push(evs);
    console.log(`✓ ${name}: ${evs.length} evenimente`);
  } catch (e) {
    console.warn(`✗ ${name}: ${e.message}`);
  }
}

if (lists.length === 0) {
  console.error('Nicio sursă disponibilă — news.json NU a fost scris.');
  process.exit(1);
}

const merged = mergeAll(lists);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      events: merged.map((e) => ({
        currency: e.currency,
        time: new Date(e.ts).toISOString(),
        name: e.name,
        impact: e.impact,
        forecast: e.forecast,
        previous: e.previous,
        actual: e.actual,
        sources: e.sources,
      })),
    },
    null,
    2
  )
);
console.log(`→ ${merged.length} evenimente unice scrise în public/news.json`);
