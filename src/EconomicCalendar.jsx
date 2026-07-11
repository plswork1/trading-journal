import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, CalendarDays, AlertTriangle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Calendar economic agregat: ForexFactory (live) + news.json
// (generat de scripts/fetch-news.mjs cu Investing + Myfxbook)
// ─────────────────────────────────────────────────────────────

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY'];
const IMPACTS = ['High', 'Medium', 'Low', 'Holiday'];

const IMPACT_COLORS = {
  High: '#E5484D',
  Medium: '#D9A34A',
  Low: '#2FBF87',
  Holiday: '#7C8494',
};

const IMPACT_LABELS = {
  High: 'Mare',
  Medium: 'Mediu',
  Low: 'Mic',
  Holiday: 'Bank Holiday',
};

const SOURCE_LABELS = {
  forexfactory: 'FF',
  investing: 'INV',
  myfxbook: 'MFX',
};

const FILTER_KEY = 'calendar-filters-v1';

// Normalizează numele unui eveniment pentru deduplicare
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
  const common = a.filter((t) => setB.has(t)).length;
  return common / Math.min(a.length, b.length);
}

// Două evenimente sunt "același eveniment" dacă au aceeași monedă,
// timpul diferă cu max 5 minute și numele se suprapun suficient
function sameEvent(e1, e2) {
  if (e1.currency !== e2.currency) return false;
  if (Math.abs(e1.ts - e2.ts) > 5 * 60 * 1000) return false;
  return tokenOverlap(normName(e1.name), normName(e2.name)) >= 0.5;
}

function mergeEvents(lists) {
  const merged = [];
  for (const list of lists) {
    for (const ev of list) {
      const existing = merged.find((m) => sameEvent(m, ev));
      if (existing) {
        // păstrează impactul cel mai mare și completează câmpurile lipsă
        const rank = { High: 3, Medium: 2, Low: 1, Holiday: 0 };
        if ((rank[ev.impact] ?? -1) > (rank[existing.impact] ?? -1)) existing.impact = ev.impact;
        existing.forecast = existing.forecast || ev.forecast;
        existing.previous = existing.previous || ev.previous;
        existing.actual = existing.actual || ev.actual;
        for (const s of ev.sources) if (!existing.sources.includes(s)) existing.sources.push(s);
      } else {
        merged.push({ ...ev, sources: [...ev.sources] });
      }
    }
  }
  return merged.sort((a, b) => a.ts - b.ts);
}

// Normalizează un eveniment din feed-ul ForexFactory
// https://nfs.faireconomy.media/ff_calendar_thisweek.json
function fromFF(raw) {
  const ts = Date.parse(raw.date);
  if (!Number.isFinite(ts)) return null;
  let impact = raw.impact;
  if (impact === 'Non-Economic') impact = 'Low';
  if (!IMPACTS.includes(impact)) impact = 'Low';
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
}

// Normalizează un eveniment din public/news.json (generat de scripts/fetch-news.mjs)
function fromMerged(raw) {
  const ts = Date.parse(raw.time);
  if (!Number.isFinite(ts)) return null;
  return {
    name: raw.name || '',
    currency: raw.currency || '',
    ts,
    impact: IMPACTS.includes(raw.impact) ? raw.impact : 'Low',
    forecast: raw.forecast || '',
    previous: raw.previous || '',
    actual: raw.actual || '',
    sources: Array.isArray(raw.sources) && raw.sources.length ? raw.sources : ['unknown'],
  };
}

const dayFmt = new Intl.DateTimeFormat('ro-RO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Bucharest',
});
const timeFmt = new Intl.DateTimeFormat('ro-RO', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Bucharest',
});
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Europe/Bucharest',
});

export default function EconomicCalendar() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const [sourceInfo, setSourceInfo] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  const defaultFilters = { currencies: [], impacts: ['High'], onlyUpcoming: false };
  const [filters, setFilters] = useState(() => {
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      if (raw) return { ...defaultFilters, ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
    return defaultFilters;
  });

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch (e) { /* ignore */ }
  }, [filters]);

  const load = useCallback(async () => {
    setStatus('loading');
    const lists = [];
    const info = [];

    // 1) news.json — fișierul agregat (FF + Investing + Myfxbook), dacă a fost generat
    try {
      const res = await fetch('/news.json', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const evs = (data.events || []).map(fromMerged).filter(Boolean);
        if (evs.length) {
          lists.push(evs);
          const srcs = new Set();
          evs.forEach((e) => e.sources.forEach((s) => srcs.add(s)));
          info.push(`news.json (${[...srcs].map((s) => SOURCE_LABELS[s] || s).join('+')})`);
        }
      }
    } catch (e) { /* fișierul nu există încă — normal */ }

    // 2) ForexFactory live, prin proxy-ul Vite (/api/ffcal) ca să evităm CORS
    try {
      const res = await fetch('/api/ffcal', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const evs = (Array.isArray(data) ? data : []).map(fromFF).filter(Boolean);
        if (evs.length) {
          lists.push(evs);
          info.push('ForexFactory live');
        }
      }
    } catch (e) { /* proxy indisponibil */ }

    if (lists.length === 0) {
      setStatus('error');
      setEvents([]);
      setSourceInfo([]);
      return;
    }

    setEvents(mergeEvents(lists));
    setSourceInfo(info);
    setLastUpdate(new Date());
    setStatus('ok');
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15 * 60 * 1000); // reîncarcă la 15 min
    return () => clearInterval(id);
  }, [load]);

  const toggle = (key, value) => {
    setFilters((f) => {
      const list = f[key];
      return {
        ...f,
        [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value],
      };
    });
  };

  const now = Date.now();

  const visible = useMemo(() => {
    return events.filter((e) => {
      if (filters.currencies.length && !filters.currencies.includes(e.currency)) return false;
      if (filters.impacts.length && !filters.impacts.includes(e.impact)) return false;
      if (filters.onlyUpcoming && e.ts < now - 30 * 60 * 1000) return false;
      return true;
    });
  }, [events, filters, now]);

  const byDay = useMemo(() => {
    const groups = new Map();
    for (const e of visible) {
      const key = dayKeyFmt.format(new Date(e.ts));
      if (!groups.has(key)) groups.set(key, { label: dayFmt.format(new Date(e.ts)), events: [] });
      groups.get(key).events.push(e);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  const todayKey = dayKeyFmt.format(new Date());

  return (
    <div>
      {/* Filtre */}
      <div className="tj-panel" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="tj-label">Monede (nimic selectat = toate)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="tj-chip"
                  data-active={filters.currencies.includes(c)}
                  onClick={() => toggle('currencies', c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="tj-label">Impact</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {IMPACTS.map((i) => (
                <button
                  key={i}
                  type="button"
                  className="tj-chip"
                  data-active={filters.impacts.includes(i)}
                  onClick={() => toggle('impacts', i)}
                >
                  <span className="tj-dot" style={{ background: IMPACT_COLORS[i] }} />
                  {IMPACT_LABELS[i]}
                </button>
              ))}
              <button
                type="button"
                className="tj-chip"
                data-active={filters.onlyUpcoming}
                onClick={() => setFilters((f) => ({ ...f, onlyUpcoming: !f.onlyUpcoming }))}
              >
                Doar viitoare
              </button>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <button className="tj-btn" onClick={load} disabled={status === 'loading'}>
              <RefreshCw size={14} style={status === 'loading' ? { animation: 'tj-spin 1s linear infinite' } : {}} />
              Reîncarcă
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              {sourceInfo.length > 0 && <>Surse: {sourceInfo.join(' · ')}<br /></>}
              {lastUpdate && <>Actualizat: {timeFmt.format(lastUpdate)}</>}
            </div>
          </div>
        </div>
      </div>

      {status === 'error' && (
        <div className="tj-panel" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderColor: 'var(--loss)' }}>
          <AlertTriangle size={18} color="#E5484D" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Nu am putut încărca nicio sursă. Verifică: (1) aplicația rulează cu <code>npm run dev</code> (proxy-ul
            către ForexFactory funcționează doar prin serverul Vite) și (2) ai conexiune la internet. Pentru sursele
            Investing + Myfxbook rulează <code>npm run news</code> ca să generezi <code>public/news.json</code>.
          </div>
        </div>
      )}

      {status !== 'error' && byDay.length === 0 && status !== 'loading' && (
        <div className="tj-panel" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontSize: 13 }}>
          Nicio știre nu corespunde filtrelor curente.
        </div>
      )}

      {byDay.map(([key, group]) => (
        <div key={key} style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CalendarDays size={14} color={key === todayKey ? '#D9A34A' : '#7C8494'} />
            <span
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: key === todayKey ? 'var(--amber)' : 'var(--text-muted)',
              }}
            >
              {group.label}{key === todayKey ? ' · azi' : ''}
            </span>
          </div>
          <div className="tj-panel" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tj-table" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Ora</th>
                  <th style={{ width: 54 }}>Monedă</th>
                  <th style={{ width: 80 }}>Impact</th>
                  <th>Eveniment</th>
                  <th style={{ width: 80 }}>Actual</th>
                  <th style={{ width: 80 }}>Forecast</th>
                  <th style={{ width: 80 }}>Anterior</th>
                  <th style={{ width: 90 }}>Surse</th>
                </tr>
              </thead>
              <tbody>
                {group.events.map((e, idx) => {
                  const past = e.ts < now - 30 * 60 * 1000;
                  return (
                    <tr key={idx} style={past ? { opacity: 0.45 } : {}}>
                      <td className="tj-r-mono" style={{ fontSize: 12 }}>
                        {e.impact === 'Holiday' ? '—' : timeFmt.format(new Date(e.ts))}
                      </td>
                      <td className="tj-r-mono" style={{ fontSize: 12 }}>{e.currency}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span className="tj-dot" style={{ background: IMPACT_COLORS[e.impact] }} />
                          {IMPACT_LABELS[e.impact]}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{e.name}</td>
                      <td className="tj-r-mono" style={{ fontSize: 12, color: e.actual ? 'var(--text)' : 'var(--text-muted)' }}>{e.actual || '—'}</td>
                      <td className="tj-r-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.forecast || '—'}</td>
                      <td className="tj-r-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.previous || '—'}</td>
                      <td>
                        <span style={{ display: 'inline-flex', gap: 4 }}>
                          {e.sources.map((s) => (
                            <span key={s} className="tj-src">{SOURCE_LABELS[s] || s}</span>
                          ))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
