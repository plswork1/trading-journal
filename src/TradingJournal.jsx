import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine, Cell } from 'recharts';
import { Plus, Trash2, TrendingUp, TrendingDown, BarChart3, CalendarDays } from 'lucide-react';
import EconomicCalendar from './EconomicCalendar.jsx';

const STORAGE_KEY = 'trades-v1';

const PAIRS = ['GBPUSD', 'DAX'];
const SESSIONS = ['Dimineață (10:15-12:00)', 'După-masă (12:00-19:00)', 'Altă oră'];
const SETUPS = ['Institutional', 'Order Block', 'Altul'];
const LIQ_OPTIONS = ['HOD', 'LOD', 'Liq locală', 'Liq minoră', 'Liq majoră'];
const RISK_LEVELS = ['Mic', 'Mediu', 'Mediu-mare'];
const GAP_TYPES = ['One gap', '2G', '2CG', '3G', '3CG'];

const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');

function outcomeOf(r) {
  if (r > 0) return 'win';
  if (r < 0) return 'loss';
  return 'be';
}

const COLORS = {
  profit: '#2FBF87',
  loss: '#E5484D',
  be: '#8B92A6',
  amber: '#D9A34A',
};

const TABS = [
  { id: 'add', label: 'Adaugă trade', icon: Plus },
  { id: 'stats', label: 'Statistică', icon: BarChart3 },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
];

export default function TradingJournal() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('add');
  const [filters, setFilters] = useState({ pair: 'Toate', session: 'Toate', setup: 'Toate' });

  const emptyForm = {
    date: new Date().toISOString().slice(0, 10),
    pair: PAIRS[0],
    session: SESSIONS[0],
    setup: SETUPS[0],
    direction: 'Long',
    r: '',
    risk: '0.3',
    notes: '',
    liq: [],
    riskLevel: RISK_LEVELS[1],
    gapType: GAP_TYPES[0],
  };
  const [form, setForm] = useState(emptyForm);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTrades(JSON.parse(raw));
    } catch (e) {
      console.error('Eroare la încărcare:', e);
    }
    setLoading(false);
  }, []);

  const persist = (list) => {
    setTrades(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Eroare la salvare:', e);
    }
  };

  const toggleLiq = (opt) => {
    setForm((f) => ({
      ...f,
      liq: f.liq.includes(opt) ? f.liq.filter((x) => x !== opt) : [...f.liq, opt],
    }));
  };

  const addTrade = (e) => {
    e.preventDefault();
    if (form.r === '' || isNaN(parseFloat(form.r))) return;
    const newTrade = {
      id: Date.now().toString(),
      date: form.date,
      pair: form.pair,
      session: form.session,
      setup: form.setup,
      direction: form.direction,
      r: parseFloat(form.r),
      risk: parseFloat(form.risk) || 0,
      notes: form.notes.trim(),
      liq: form.setup === 'Institutional' ? form.liq : [],
      riskLevel: form.setup === 'Institutional' ? form.riskLevel : '',
      gapType: form.setup === 'Institutional' ? form.gapType : '',
    };
    persist([...trades, newTrade]);
    setForm(emptyForm);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const deleteTrade = (id) => persist(trades.filter((t) => t.id !== id));

  const filtered = useMemo(() => {
    return trades.filter(
      (t) =>
        (filters.pair === 'Toate' || t.pair === filters.pair) &&
        (filters.session === 'Toate' || t.session === filters.session) &&
        (filters.setup === 'Toate' || t.setup === filters.setup)
    );
  }, [trades, filters]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    [filtered]
  );

  const allSorted = useMemo(
    () => [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    [trades]
  );

  const equityData = useMemo(() => {
    let cum = 0;
    return sorted.map((t, i) => {
      cum += t.r;
      return { idx: i + 1, cum: Number(cum.toFixed(2)), date: t.date, pair: t.pair };
    });
  }, [sorted]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const wins = filtered.filter((t) => t.r > 0);
    const losses = filtered.filter((t) => t.r < 0);
    const be = filtered.filter((t) => t.r === 0);
    const winRate = wins.length + losses.length > 0 ? (wins.length / (wins.length + losses.length)) * 100 : 0;
    const sumR = filtered.reduce((s, t) => s + t.r, 0);
    const expectancy = total > 0 ? sumR / total : 0;
    const grossProfit = wins.reduce((s, t) => s + t.r, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.r, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    let streak = 0;
    let streakType = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const t = outcomeOf(sorted[i].r);
      if (t === 'be') break;
      if (streakType === null) {
        streakType = t;
        streak = 1;
      } else if (t === streakType) {
        streak++;
      } else break;
    }

    return { total, wins: wins.length, losses: losses.length, be: be.length, winRate, expectancy, sumR, profitFactor, streak, streakType };
  }, [filtered, sorted]);

  const distribution = useMemo(() => {
    const buckets = [
      { label: '< -1R', min: -Infinity, max: -1, count: 0 },
      { label: '-1 – 0R', min: -1, max: 0, count: 0 },
      { label: '0R (BE)', min: 0, max: 0, count: 0 },
      { label: '0 – 1R', min: 0, max: 1, count: 0 },
      { label: '1 – 2R', min: 1, max: 2, count: 0 },
      { label: '> 2R', min: 2, max: Infinity, count: 0 },
    ];
    filtered.forEach((t) => {
      if (t.r === 0) buckets[2].count++;
      else if (t.r < -1) buckets[0].count++;
      else if (t.r < 0) buckets[1].count++;
      else if (t.r <= 1) buckets[3].count++;
      else if (t.r <= 2) buckets[4].count++;
      else buckets[5].count++;
    });
    return buckets;
  }, [filtered]);

  const breakdown = (key) => {
    const groups = {};
    filtered.forEach((t) => {
      const k = t[key];
      if (!groups[k]) groups[k] = { count: 0, wins: 0, losses: 0, sumR: 0 };
      groups[k].count++;
      if (t.r > 0) groups[k].wins++;
      if (t.r < 0) groups[k].losses++;
      groups[k].sumR += t.r;
    });
    return Object.entries(groups)
      .map(([name, g]) => ({
        name,
        count: g.count,
        winRate: g.wins + g.losses > 0 ? (g.wins / (g.wins + g.losses)) * 100 : 0,
        avgR: g.count > 0 ? g.sumR / g.count : 0,
      }))
      .sort((a, b) => b.count - a.count);
  };

  const gapBreakdown = useMemo(() => {
    const inst = filtered.filter((t) => t.setup === 'Institutional' && t.gapType);
    const groups = {};
    inst.forEach((t) => {
      if (!groups[t.gapType]) groups[t.gapType] = { count: 0, wins: 0, losses: 0, sumR: 0 };
      groups[t.gapType].count++;
      if (t.r > 0) groups[t.gapType].wins++;
      if (t.r < 0) groups[t.gapType].losses++;
      groups[t.gapType].sumR += t.r;
    });
    return Object.entries(groups)
      .map(([name, g]) => ({
        name,
        count: g.count,
        winRate: g.wins + g.losses > 0 ? (g.wins / (g.wins + g.losses)) * 100 : 0,
        avgR: g.count > 0 ? g.sumR / g.count : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const pairOptions = ['Toate', ...new Set(trades.map((t) => t.pair))];
  const sessionOptions = ['Toate', ...new Set(trades.map((t) => t.session))];
  const setupOptions = ['Toate', ...new Set(trades.map((t) => t.setup))];

  const curveColor = stats.sumR >= 0 ? COLORS.profit : COLORS.loss;

  return (
    <div className="tj-root" style={{ fontFamily: 'var(--f-body)', background: 'var(--bg)', color: 'var(--text)', padding: '2rem', borderRadius: 16, minHeight: 400 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .tj-root, .tj-root * { box-sizing: border-box; }
        :root {
          --bg: #0A0D12; --panel: #12161F; --panel-alt: #171C26; --border: #222836;
          --text: #E7E9EE; --text-muted: #7C8494; --amber: #D9A34A;
          --profit: #2FBF87; --loss: #E5484D; --be: #8B92A6;
          --f-display: 'Space Grotesk', sans-serif; --f-body: 'Inter', sans-serif; --f-mono: 'JetBrains Mono', monospace;
        }
        .tj-eyebrow { font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--amber); margin-bottom: 6px; }
        .tj-h1 { font-family: var(--f-display); font-size: 26px; font-weight: 600; margin: 0; }
        .tj-panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
        .tj-label { font-family: var(--f-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 10px; }
        .tj-stat-value { font-family: var(--f-mono); font-size: 22px; font-weight: 600; }
        .tj-btn { font-family: var(--f-body); background: var(--panel-alt); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .tj-btn:hover { border-color: var(--amber); }
        .tj-btn-primary { background: var(--amber); color: #241804; border-color: var(--amber); font-weight: 600; }
        .tj-input, .tj-select, .tj-textarea { width: 100%; background: var(--panel-alt); border: 1px solid var(--border); border-radius: 8px; color: var(--text); padding: 8px 10px; font-family: var(--f-body); font-size: 13px; }
        .tj-input:focus, .tj-select:focus, .tj-textarea:focus { outline: none; border-color: var(--amber); }
        .tj-fieldlabel { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; display: block; }
        table.tj-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        table.tj-table th { text-align: left; font-family: var(--f-mono); font-size: 10px; text-transform: uppercase; color: var(--text-muted); font-weight: 500; padding: 8px 10px; border-bottom: 1px solid var(--border); }
        table.tj-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); }
        table.tj-table tr:hover td { background: var(--panel-alt); }
        .tj-r-mono { font-family: var(--f-mono); font-weight: 600; }
        .tj-bar-track { background: var(--panel-alt); border-radius: 4px; height: 6px; overflow: hidden; margin-top: 4px; }
        .tj-bar-fill { height: 100%; border-radius: 4px; }
        .tj-tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; }
        .tj-tab { font-family: var(--f-body); background: transparent; color: var(--text-muted); border: none; border-bottom: 2px solid transparent; padding: 10px 16px; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; margin-bottom: -1px; }
        .tj-tab:hover { color: var(--text); }
        .tj-tab[data-active="true"] { color: var(--amber); border-bottom-color: var(--amber); font-weight: 600; }
        .tj-chip { font-family: var(--f-mono); font-size: 12px; background: var(--panel-alt); color: var(--text-muted); border: 1px solid var(--border); border-radius: 999px; padding: 5px 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .tj-chip:hover { border-color: var(--amber); }
        .tj-chip[data-active="true"] { color: var(--text); border-color: var(--amber); background: rgba(217, 163, 74, 0.12); }
        .tj-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
        .tj-src { font-family: var(--f-mono); font-size: 10px; background: var(--panel-alt); border: 1px solid var(--border); border-radius: 4px; padding: 2px 5px; color: var(--text-muted); }
        @keyframes tj-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ marginBottom: '1.25rem' }}>
        <div className="tj-eyebrow">Jurnal de tranzacționare</div>
        <h1 className="tj-h1">Trading Journal</h1>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{trades.length} tranzacții înregistrate în total</div>
      </div>

      <div className="tj-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className="tj-tab" data-active={tab === id} onClick={() => setTab(id)}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ───────── 1. ADAUGĂ TRADE ───────── */}
      {tab === 'add' && (
        <>
          <form onSubmit={addTrade} className="tj-panel" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="tj-fieldlabel">Data</label>
                <input className="tj-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div>
                <label className="tj-fieldlabel">Pereche</label>
                <select className="tj-select" value={form.pair} onChange={(e) => setForm({ ...form, pair: e.target.value })}>
                  {PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="tj-fieldlabel">Sesiune</label>
                <select className="tj-select" value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })}>
                  {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="tj-fieldlabel">Setup</label>
                <select className="tj-select" value={form.setup} onChange={(e) => setForm({ ...form, setup: e.target.value })}>
                  {SETUPS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="tj-fieldlabel">Direcție</label>
                <select className="tj-select" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                  <option>Long</option>
                  <option>Short</option>
                </select>
              </div>
              <div>
                <label className="tj-fieldlabel">Rezultat (R)</label>
                <input className="tj-input" type="number" step="0.1" placeholder="ex: 2, -1, 0, 1.4" value={form.r} onChange={(e) => setForm({ ...form, r: e.target.value })} required />
              </div>
              <div>
                <label className="tj-fieldlabel">Risc (%)</label>
                <input className="tj-input" type="number" step="0.1" value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })} />
              </div>
            </div>
            {form.setup === 'Institutional' && (
              <div className="tj-panel" style={{ background: 'var(--panel-alt)', marginBottom: 12, padding: '0.9rem 1rem' }}>
                <div className="tj-label" style={{ marginBottom: 8 }}>Detalii institutional</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
                  <div>
                    <label className="tj-fieldlabel">Liq (selectează una sau mai multe)</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {LIQ_OPTIONS.map((opt) => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input type="checkbox" checked={form.liq.includes(opt)} onChange={() => toggleLiq(opt)} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="tj-fieldlabel">Nivel risc</label>
                    <select className="tj-select" value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value })}>
                      {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <label className="tj-fieldlabel" style={{ marginTop: 12 }}>Tip setup (gap-uri)</label>
                    <select className="tj-select" value={form.gapType} onChange={(e) => setForm({ ...form, gapType: e.target.value })}>
                      {GAP_TYPES.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <label className="tj-fieldlabel">Notițe (plus / minus, context)</label>
            <textarea className="tj-textarea" rows={2} placeholder="ex: HOD de calitate, displacement bun + gap-uri..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="submit" className="tj-btn tj-btn-primary"><Plus size={15} />Salvează trade</button>
              {savedFlash && <span style={{ color: COLORS.profit, fontSize: 13 }}>✓ Salvat</span>}
            </div>
          </form>

          {loading ? (
            <div style={{ color: 'var(--text-muted)', padding: '2rem 0' }}>Se încarcă...</div>
          ) : trades.length === 0 ? (
            <div className="tj-panel" style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: 13 }}>
              Niciun trade încă. Adaugă primul trade folosind formularul de mai sus.
            </div>
          ) : (
            <div className="tj-panel" style={{ overflowX: 'auto' }}>
              <div className="tj-label">Toate tranzacțiile</div>
              <table className="tj-table">
                <thead>
                  <tr>
                    <th>Data</th><th>Pereche</th><th>Sesiune</th><th>Setup</th><th>Detalii</th><th>Dir.</th><th>R</th><th>Risc</th><th>Notițe</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...allSorted].reverse().map((t) => (
                    <tr key={t.id}>
                      <td className="tj-r-mono" style={{ fontSize: 12 }}>{t.date}</td>
                      <td>{t.pair}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.session.split(' ')[0]}</td>
                      <td style={{ fontSize: 12 }}>{t.setup}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 180 }}>
                        {t.setup === 'Institutional'
                          ? [t.liq && t.liq.length ? t.liq.join(', ') : null, t.riskLevel, t.gapType].filter(Boolean).join(' · ')
                          : '—'}
                      </td>
                      <td>{t.direction === 'Long' ? <TrendingUp size={14} color={COLORS.profit} /> : <TrendingDown size={14} color={COLORS.loss} />}</td>
                      <td className="tj-r-mono" style={{ color: t.r > 0 ? COLORS.profit : t.r < 0 ? COLORS.loss : COLORS.be }}>
                        {t.r >= 0 ? '+' : ''}{fmt(t.r, 1)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(t.risk, 1)}%</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 220 }}>{t.notes}</td>
                      <td>
                        <button className="tj-btn" style={{ padding: 6 }} onClick={() => deleteTrade(t.id)} aria-label="Șterge">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ───────── 2. STATISTICĂ ───────── */}
      {tab === 'stats' && (
        loading ? (
          <div style={{ color: 'var(--text-muted)', padding: '2rem 0' }}>Se încarcă...</div>
        ) : trades.length === 0 ? (
          <div className="tj-panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, marginBottom: 6 }}>Adaugă primul trade</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Statisticile apar automat pe măsură ce înregistrezi tranzacții.</div>
            <button className="tj-btn tj-btn-primary" onClick={() => setTab('add')}><Plus size={15} />Adaugă trade</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {[['pair', pairOptions, 'Pereche'], ['session', sessionOptions, 'Sesiune'], ['setup', setupOptions, 'Setup']].map(([key, opts, label]) => (
                <div key={key} style={{ minWidth: 160 }}>
                  <label className="tj-fieldlabel">{label}</label>
                  <select className="tj-select" value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div className="tj-panel" style={{ marginBottom: '1.5rem' }}>
              <div className="tj-label">Curba de capital (R cumulat) — {filtered.length} tranzacții</div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={equityData}>
                  <defs>
                    <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={curveColor} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={curveColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#222836" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="idx" tick={{ fill: '#7C8494', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={{ stroke: '#222836' }} tickLine={false} />
                  <YAxis tick={{ fill: '#7C8494', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={36} />
                  <ReferenceLine y={0} stroke="#222836" />
                  <Tooltip
                    contentStyle={{ background: '#171C26', border: '1px solid #222836', borderRadius: 8, fontSize: 12, fontFamily: 'JetBrains Mono' }}
                    labelStyle={{ color: '#7C8494' }}
                    formatter={(v) => [`${v} R`, 'Cumulat']}
                    labelFormatter={(l, p) => (p && p[0] ? `${p[0].payload.date} · ${p[0].payload.pair}` : '')}
                  />
                  <Area type="stepAfter" dataKey="cum" stroke={curveColor} strokeWidth={2} fill="url(#curveGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
              {[
                ['Win rate', `${fmt(stats.winRate, 0)}%`, null],
                ['Expectancy', `${stats.expectancy >= 0 ? '+' : ''}${fmt(stats.expectancy)} R`, stats.expectancy >= 0 ? COLORS.profit : COLORS.loss],
                ['Profit factor', Number.isFinite(stats.profitFactor) ? fmt(stats.profitFactor) : '∞', null],
                ['R total', `${stats.sumR >= 0 ? '+' : ''}${fmt(stats.sumR, 1)}`, stats.sumR >= 0 ? COLORS.profit : COLORS.loss],
                ['Streak', stats.streak ? `${stats.streak} ${stats.streakType === 'win' ? 'win' : 'loss'}` : '—', stats.streakType === 'win' ? COLORS.profit : stats.streakType === 'loss' ? COLORS.loss : null],
                ['Trades', stats.total, null],
              ].map(([label, value, color]) => (
                <div key={label} className="tj-panel" style={{ padding: '0.9rem 1rem' }}>
                  <div className="tj-label" style={{ marginBottom: 6 }}>{label}</div>
                  <div className="tj-stat-value" style={color ? { color } : {}}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
              <div className="tj-panel">
                <div className="tj-label">Distribuție R</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={distribution}>
                    <CartesianGrid stroke="#222836" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#7C8494', fontSize: 10, fontFamily: 'Inter' }} axisLine={{ stroke: '#222836' }} tickLine={false} interval={0} angle={-15} textAnchor="end" height={40} />
                    <YAxis tick={{ fill: '#7C8494', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#171C26', border: '1px solid #222836', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {distribution.map((d, i) => (
                        <Cell key={i} fill={d.min >= 0 ? COLORS.profit : d.max <= 0 && d.min < 0 ? COLORS.loss : COLORS.be} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {[['pair', 'După pereche'], ['session', 'După sesiune'], ['setup', 'După setup']].map(([key, label]) => {
                const rows = breakdown(key);
                return (
                  <div key={key} className="tj-panel">
                    <div className="tj-label">{label}</div>
                    {rows.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Fără date</div>}
                    {rows.map((r) => (
                      <div key={r.name} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span>{r.name}</span>
                          <span className="tj-r-mono" style={{ fontSize: 12 }}>{fmt(r.winRate, 0)}% · {r.avgR >= 0 ? '+' : ''}{fmt(r.avgR)}R</span>
                        </div>
                        <div className="tj-bar-track">
                          <div className="tj-bar-fill" style={{ width: `${(r.winRate)}%`, background: r.winRate >= 50 ? COLORS.profit : COLORS.loss }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

              {gapBreakdown.length > 0 && (
                <div className="tj-panel">
                  <div className="tj-label">Institutional — după tip gap</div>
                  {gapBreakdown.map((r) => (
                    <div key={r.name} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span>{r.name}</span>
                        <span className="tj-r-mono" style={{ fontSize: 12 }}>{fmt(r.winRate, 0)}% · {r.avgR >= 0 ? '+' : ''}{fmt(r.avgR)}R</span>
                      </div>
                      <div className="tj-bar-track">
                        <div className="tj-bar-fill" style={{ width: `${r.winRate}%`, background: r.winRate >= 50 ? COLORS.profit : COLORS.loss }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )
      )}

      {/* ───────── 3. CALENDAR ───────── */}
      {tab === 'calendar' && <EconomicCalendar />}
    </div>
  );
}
