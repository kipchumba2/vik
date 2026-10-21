/* Meridian demo trading platform. ALL DATA IS SIMULATED. No real trades or accounts. */
'use strict';

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = n => '$' + fmt(n), pct = n => (n >= 0 ? '+' : '') + fmt(n) + '%', cls = n => (n >= 0 ? 'up' : 'down');
const compact = n => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const when = ts => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const view = () => document.body.dataset.view;

/* ---------- Simulated assets: [symbol, name, category, price, 24h %, volume] ---------- */
const ASSETS = [
  ['BTC','Bitcoin','Crypto',67250,1.8,3.2e10],['ETH','Ethereum','Crypto',3280,-0.9,1.6e10],
  ['SOL','Solana','Crypto',172,3.4,3.1e9],['XRP','XRP','Crypto',0.52,-1.2,1.4e9],
  ['EUR/USD','Euro / US Dollar','Forex',1.0842,0.12,2.1e11],['GBP/USD','Pound / US Dollar','Forex',1.2715,-0.08,9.8e10],
  ['USD/JPY','US Dollar / Yen','Forex',151.4,0.31,1.2e11],
  ['AAPL','Apple Inc.','Stocks',226.4,0.7,5.4e7],['TSLA','Tesla Inc.','Stocks',248.9,-2.1,9.1e7],
  ['NVDA','NVIDIA Corp.','Stocks',131.6,2.6,2.2e8],['MSFT','Microsoft Corp.','Stocks',418.2,0.4,2.3e7],
  ['XAU','Gold (oz)','Commodities',2655,0.5,1.8e10],['XAG','Silver (oz)','Commodities',31.2,-0.6,3.2e9],
  ['WTI','Crude Oil WTI','Commodities',71.8,-1.1,2.6e10],['NG','Natural Gas','Commodities',2.91,1.9,6.4e9]
].map(([sym, name, cat, price, chg, vol]) => ({ sym, name, cat, price, open: price / (1 + chg / 100), chg, vol, dec: price < 10 ? 4 : 2 }));
const A = sym => ASSETS.find(a => a.sym === sym);
const isOpen = a => a.cat === 'Crypto' || ![0, 6].includes(new Date().getUTCDay()); // simulated status

/* ---------- State (saved to localStorage) ---------- */
const FEE = 0.001, TFS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
const DEF = {
  cash: 25000, theme: 'dark', tf: '15m', sel: 'BTC', base: null,
  hold: { BTC: { q: 0.15, avg: 61200 }, ETH: { q: 2, avg: 3050 }, AAPL: { q: 20, avg: 182 }, XAU: { q: 3, avg: 2310 } },
  watch: ['BTC', 'ETH', 'AAPL', 'EUR/USD', 'XAU'],
  orders: [
    { id: 1, sym: 'BTC', side: 'buy', type: 'market', q: 0.15, px: 61200, fp: 61200, fee: 9.18, st: 'filled', ts: Date.now() - 864e6 },
    { id: 2, sym: 'AAPL', side: 'buy', type: 'limit', q: 20, px: 182, fp: 182, fee: 3.64, st: 'filled', ts: Date.now() - 432e6 },
    { id: 3, sym: 'ETH', side: 'buy', type: 'market', q: 2, px: 3050, fp: 3050, fee: 6.1, st: 'filled', ts: Date.now() - 260e6 }
  ],
  notes: [{ t: 'Welcome. Prices here are simulated demo data.', r: 0 }]
};
let S;
try { S = { ...structuredClone(DEF), ...JSON.parse(localStorage.getItem('meridian') || '{}') }; } catch { S = structuredClone(DEF); }
const save = () => { try { localStorage.setItem('meridian', JSON.stringify(S)); } catch { /* storage unavailable */ } };
const value = () => S.cash + Object.entries(S.hold).reduce((s, [k, h]) => s + h.q * A(k).price, 0);
S.base ??= value();

/* ---------- Toasts, dialog, notifications ---------- */
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove('show'), 2800); }
function notify(t) { S.notes.unshift({ t, r: 0 }); S.notes = S.notes.slice(0, 20); save(); renderNotes(); toast(t); }
function renderNotes() {
  const u = S.notes.filter(n => !n.r).length;
  $('#badge').hidden = !u; $('#badge').textContent = u;
  $('#nlist').innerHTML = S.notes.map((n, i) => `<button data-n="${i}" class="${n.r ? '' : 'new'}">${n.t}</button>`).join('') || '<p class="mut">No notifications.</p>';
}
const D = $('#dlg');
function dlg(html, h = {}) { D.innerHTML = html; D._h = h; D.showModal(); }
D.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (e.target === D || (b && b.hasAttribute('data-close'))) return D.close();
  if (b && b.dataset.act && D._h[b.dataset.act]) { D._h[b.dataset.act](); D.close(); }
});

/* ---------- Charts (TradingView Lightweight Charts) ---------- */
let chart, cs, ls, vs, ma, cur = [], lineMode = false, pc, ps, perf = 'M';
const colors = () => S.theme === 'dark' ? { tx: '#93a0b6', gr: '#1d2430' } : { tx: '#526077', gr: '#e3e8f0' };
const sma = n => cur.map((d, i) => i < n - 1 ? null : { time: d.time, value: cur.slice(i - n + 1, i + 1).reduce((s, x) => s + x.close, 0) / n }).filter(Boolean);
const vcol = d => d.close >= d.open ? '#16c78455' : '#ea394355';

function initChart() {
  const c = colors();
  chart = LightweightCharts.createChart($('#chart'), {
    autoSize: true, layout: { background: { color: 'transparent' }, textColor: c.tx },
    grid: { vertLines: { color: c.gr }, horzLines: { color: c.gr } }, rightPriceScale: { borderColor: c.gr },
    timeScale: { timeVisible: true, secondsVisible: false, borderColor: c.gr }
  });
  cs = chart.addCandlestickSeries({ upColor: '#16c784', downColor: '#ea3943', wickUpColor: '#16c784', wickDownColor: '#ea3943', borderVisible: false });
  ls = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, visible: false });
  ma = chart.addLineSeries({ color: '#f0b90b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  vs = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
}

/* Build simulated history that ends exactly at the current simulated price */
function genData() {
  const a = A(S.sel), step = TFS[S.tf], now = Math.floor(Date.now() / 1000 / step) * step, vol = 0.006 * Math.sqrt(step / 900);
  let p = a.price; const out = [];
  for (let i = 0; i < 300; i++) {
    const c = p, o = c * (1 + (Math.random() - 0.5) * vol);
    out.unshift({ time: now - i * step, open: o, high: Math.max(o, c) * (1 + Math.random() * vol / 3), low: Math.min(o, c) * (1 - Math.random() * vol / 3), close: c, v: Math.round(500 + Math.random() * 2000) });
    p = o;
  }
  return out;
}
function loadChart() {
  $('#chartLoad').hidden = false;
  setTimeout(() => {
    cur = genData();
    cs.setData(cur); ls.setData(cur.map(d => ({ time: d.time, value: d.close })));
    vs.setData(cur.map(d => ({ time: d.time, value: d.v, color: vcol(d) }))); ma.setData(sma(20));
    chart.timeScale().setVisibleLogicalRange({ from: cur.length - 90, to: cur.length + 4 });
    $('#chartLoad').hidden = true;
  }, 350);
}
function tickChart() { // push the newest simulated price into the live candle
  const a = A(S.sel), step = TFS[S.tf], t = Math.floor(Date.now() / 1000 / step) * step; let c = cur[cur.length - 1];
  if (!c) return;
  if (t > c.time) { c = { time: t, open: c.close, high: a.price, low: a.price, close: a.price, v: 100 }; cur.push(c); }
  else { c.close = a.price; c.high = Math.max(c.high, a.price); c.low = Math.min(c.low, a.price); c.v += Math.round(Math.random() * 40); }
  cs.update(c); ls.update({ time: c.time, value: c.close }); vs.update({ time: c.time, value: c.v, color: vcol(c) });
  const m = sma(20).pop(); if (m) ma.update(m);
}
function zoom(f) {
  const ts = chart.timeScale();
  if (f === 'fit') return ts.fitContent();
  const r = ts.getVisibleLogicalRange(); if (!r) return;
  const m = (r.from + r.to) / 2, h = (r.to - r.from) / 2 * +f; ts.setVisibleLogicalRange({ from: m - h, to: m + h });
}

/* P&L history (simulated, deterministic per period) */
function renderPnl() {
  const c = colors();
  if (!pc) {
    pc = LightweightCharts.createChart($('#pnl'), { autoSize: true, layout: { background: { color: 'transparent' }, textColor: c.tx }, grid: { vertLines: { visible: false }, horzLines: { color: c.gr } }, rightPriceScale: { borderVisible: false } });
    ps = pc.addHistogramSeries();
  }
  const [n, u, seed] = { D: [24, 3600, 1], W: [7, 86400, 2], M: [30, 86400, 3], Y: [12, 2592000, 4] }[perf];
  let x = seed * 9301; const r = () => (x = (x * 16807) % 2147483647) / 2147483647, now = Math.floor(Date.now() / 1000);
  ps.setData(Array.from({ length: n }, (_, i) => { const v = (r() - 0.45) * value() * 0.012 * Math.sqrt(u / 86400 + 1); return { time: now - (n - i) * u, value: +v.toFixed(2), color: v >= 0 ? '#16c784' : '#ea3943' }; }));
  pc.applyOptions({ timeScale: { timeVisible: perf === 'D', borderVisible: false } }); pc.timeScale().fitContent();
}

/* ---------- Trading ---------- */
let side = 'buy', otype = 'market';
function est() {
  const a = A(S.sel); if (otype === 'market') $('#px').value = a.price.toFixed(a.dec);
  const q = +$('#qty').value || 0, px = +$('#px').value || 0, sub = q * px, fee = sub * FEE;
  $('#est').textContent = money(sub); $('#fee').textContent = money(fee); $('#tot').textContent = money(side === 'buy' ? sub + fee : sub - fee);
}
function syncForm() {
  $$('[data-side]').forEach(b => { b.classList.toggle('on', b.dataset.side === side); b.setAttribute('aria-pressed', b.dataset.side === side); });
  $$('[data-type]').forEach(b => { b.classList.toggle('on', b.dataset.type === otype); b.setAttribute('aria-pressed', b.dataset.type === otype); });
  $('#px').disabled = otype === 'market'; $('#go').textContent = `Review ${side} order`; $('#go').className = `primary ${side}`; est();
}
function validate() {
  const a = A(S.sel), q = +$('#qty').value, px = +$('#px').value, h = S.hold[a.sym], need = q * px * (1 + FEE); let e = '';
  if (!(q > 0)) e = 'Enter a quantity greater than 0.';
  else if (!(px > 0)) e = 'Enter a limit price greater than 0.';
  else if (side === 'buy' && need > S.cash) e = `Not enough cash: this order needs ${money(need)} and you have ${money(S.cash)}.`;
  else if (side === 'sell' && (!h || h.q < q)) e = `You hold ${h ? h.q : 0} ${a.sym}, so you can't sell ${q}.`;
  $('#err').textContent = e; return e ? null : { a, q, px };
}
function fill(o, p) { // simulated execution
  const a = A(o.sym), sub = o.q * p, fee = sub * FEE, h = S.hold[o.sym] || (S.hold[o.sym] = { q: 0, avg: 0 });
  if (o.side === 'buy') {
    if (sub + fee > S.cash) { o.st = 'rejected'; return notify(`Order rejected: not enough cash for ${o.sym}.`); }
    h.avg = (h.avg * h.q + sub) / (h.q + o.q); h.q += o.q; S.cash -= sub + fee;
  } else {
    if (h.q < o.q) { o.st = 'rejected'; return notify(`Order rejected: not enough ${o.sym} to sell.`); }
    h.q -= o.q; S.cash += sub - fee; if (h.q < 1e-9) delete S.hold[o.sym];
  }
  Object.assign(o, { st: 'filled', fp: p, fee }); save();
  notify(`Filled: ${o.side} ${o.q} ${o.sym} at ${fmt(p, a.dec)}`);
}
function place({ a, q, px }) {
  const o = { id: Date.now(), sym: a.sym, side, type: otype, q, px, st: 'open', ts: Date.now() };
  S.orders.unshift(o);
  if (otype === 'market' || (side === 'buy' ? a.price <= px : a.price >= px)) fill(o, a.price);
  else notify(`Limit ${side} placed: ${q} ${a.sym} at ${fmt(px, a.dec)}`);
  $('#qty').value = ''; save(); render();
}
const fillOrders = () => S.orders.filter(o => o.st === 'open').forEach(o => { const p = A(o.sym).price; if (o.side === 'buy' ? p <= o.px : p >= o.px) fill(o, p); });

/* ---------- Rendering ---------- */
const table = (head, rows, empty) => `<thead><tr>${head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}">${empty}</td></tr>`}</tbody>`;
const wlRow = s => { const a = A(s); return `<button class="wl ${s === S.sel ? 'on' : ''}" data-sel="${s}"><b>${s}</b><span>${fmt(a.price, a.dec)}</span><span class="${cls(a.chg)}">${pct(a.chg)}</span></button>`; };
let mCat = 'All', mQ = '', mSort = ['vol', -1];

function renderMarkets() {
  const q = mQ.toLowerCase(), [k, d] = mSort;
  const rows = ASSETS.filter(a => (mCat === 'All' || a.cat === mCat) && (a.sym + a.name).toLowerCase().includes(q))
    .sort((a, b) => (typeof a[k] === 'string' ? a[k].localeCompare(b[k]) : a[k] - b[k]) * d)
    .map(a => `<tr tabindex="0" data-info="${a.sym}"><td><b>${a.sym}</b> <span class="mut">${a.name}</span></td><td>${fmt(a.price, a.dec)}</td><td class="${cls(a.chg)}">${pct(a.chg)}</td><td>${compact(a.vol)}</td><td><span class="pill ${isOpen(a) ? 'on' : ''}">${isOpen(a) ? 'Open' : 'Closed'}</span></td><td><button data-star="${a.sym}" aria-label="${S.watch.includes(a.sym) ? 'Remove' : 'Add'} ${a.sym} ${S.watch.includes(a.sym) ? 'from' : 'to'} watchlist">${S.watch.includes(a.sym) ? '★' : '☆'}</button></td></tr>`);
  $('#mt tbody').innerHTML = rows.join('') || '<tr><td colspan="6">No assets match. Try another search or category.</td></tr>';
}
function renderAlloc() {
  const items = [...Object.entries(S.hold).map(([s, h]) => [s, h.q * A(s).price]), ['Cash', S.cash]], tot = items.reduce((s, i) => s + i[1], 0);
  const pal = ['#3b82f6', '#16c784', '#f0b90b', '#a855f7', '#ea3943', '#06b6d4', '#94a3b8']; let acc = 0;
  const g = items.map(([, v], i) => { const s = acc; acc += v / tot * 100; return `${pal[i % 7]} ${s}% ${acc}%`; }).join(',');
  $('#alloc').innerHTML = `<div class="donut" style="background:conic-gradient(${g})" role="img" aria-label="Portfolio allocation chart"></div><ul>${items.map(([n, v], i) => `<li><i style="background:${pal[i % 7]}"></i>${n}<b>${fmt(v / tot * 100, 1)}%</b></li>`).join('')}</ul>`;
}
function render(v = view(), lists = true) {
  const a = A(S.sel), d = value() - S.base;
  $('#stats').innerHTML = [['Portfolio value', money(value())], ['Available balance', money(S.cash)], ['Daily profit/loss', (d >= 0 ? '+' : '-') + money(Math.abs(d)), cls(d)], ['Daily change', pct(d / S.base * 100), cls(d)]]
    .map(([l, x, c = '']) => `<div class="card stat"><span>${l}</span><b class="${c}">${x}</b></div>`).join('');
  $('#cashTop').textContent = money(S.cash);
  $('#cSym').textContent = `${a.name} (${a.sym})`;
  $('#cPx').innerHTML = `${fmt(a.price, a.dec)} <span class="${cls(a.chg)}">${pct(a.chg)}</span>`;
  est(); if (!lists) return;
  $('#wlMini').innerHTML = S.watch.map(wlRow).join('') || '<p class="mut">Empty. Add assets from Markets.</p>';
  if (v === 'markets') renderMarkets();
  if (v === 'watchlist') $('#wt').innerHTML = table(['Asset', 'Price', '24h change', '', ''], S.watch.map(s => { const x = A(s); return `<tr><td><b>${s}</b> <span class="mut">${x.name}</span></td><td>${fmt(x.price, x.dec)}</td><td class="${cls(x.chg)}">${pct(x.chg)}</td><td><button data-sel="${s}">Trade</button></td><td><button data-star="${s}">Remove</button></td></tr>`; }), 'Your watchlist is empty. Star assets in Markets to add them.');
  if (v === 'portfolio') {
    renderAlloc();
    $('#ht').innerHTML = table(['Asset', 'Quantity', 'Avg. price', 'Price', 'Value', 'Unrealized P&L'], Object.entries(S.hold).map(([s, h]) => { const x = A(s), pl = (x.price - h.avg) * h.q; return `<tr><td><b>${s}</b></td><td>${+h.q.toFixed(6)}</td><td>${fmt(h.avg, x.dec)}</td><td>${fmt(x.price, x.dec)}</td><td>${money(h.q * x.price)}</td><td class="${cls(pl)}">${pl >= 0 ? '+' : '-'}${money(Math.abs(pl))}</td></tr>`; }), 'No holdings yet. Place a buy order in Trade.');
  }
  if (v === 'orders') $('#ot').innerHTML = table(['Time', 'Asset', 'Side', 'Type', 'Quantity', 'Price', 'Status', ''], S.orders.map(o => `<tr><td>${when(o.ts)}</td><td>${o.sym}</td><td class="${o.side === 'buy' ? 'up' : 'down'}">${o.side}</td><td>${o.type}</td><td>${o.q}</td><td>${fmt(o.px, A(o.sym).dec)}</td><td>${o.st}</td><td>${o.st === 'open' ? `<button data-cancel="${o.id}">Cancel</button>` : ''}</td></tr>`), 'No orders yet. Place one from Trade.');
  if (v === 'history') $('#hist').innerHTML = table(['Time', 'Asset', 'Side', 'Quantity', 'Fill price', 'Fee', 'Total'], S.orders.filter(o => o.st === 'filled').map(o => `<tr><td>${when(o.ts)}</td><td>${o.sym}</td><td class="${o.side === 'buy' ? 'up' : 'down'}">${o.side}</td><td>${o.q}</td><td>${fmt(o.fp, A(o.sym).dec)}</td><td>${money(o.fee)}</td><td>${money(o.q * o.fp + (o.side === 'buy' ? o.fee : -o.fee))}</td></tr>`), 'No filled orders yet.');
}

/* ---------- Actions ---------- */
function select(sym) { S.sel = sym; save(); $('#oSym').textContent = sym; loadChart(); render(); }
function toggleWatch(s) {
  const i = S.watch.indexOf(s); i < 0 ? S.watch.push(s) : S.watch.splice(i, 1);
  save(); toast(`${s} ${i < 0 ? 'added to' : 'removed from'} watchlist`); render();
}
function showInfo(s) {
  const a = A(s), w = S.watch.includes(s);
  dlg(`<h2>${a.name} (${a.sym})</h2><p class="big">${fmt(a.price, a.dec)} <span class="${cls(a.chg)}">${pct(a.chg)}</span></p>
    <dl class="sum"><dt>Category</dt><dd>${a.cat}</dd><dt>24h volume</dt><dd>${compact(a.vol)}</dd><dt>Market status</dt><dd>${isOpen(a) ? 'Open' : 'Closed'}</dd><dt>Data source</dt><dd>Simulated</dd></dl>
    <div class="acts"><button data-close>Close</button><button data-act="w">${w ? 'Remove from' : 'Add to'} watchlist</button><button class="primary" data-act="t">Trade</button></div>`,
    { w: () => toggleWatch(s), t: () => { select(s); location.hash = '#trade'; } });
}
function setTheme(t) {
  S.theme = t; document.documentElement.dataset.theme = t; save(); const c = colors();
  [chart, pc].forEach(ch => ch && ch.applyOptions({ layout: { textColor: c.tx }, grid: { horzLines: { color: c.gr }, vertLines: { color: c.gr } } }));
}
function route() {
  const v = ['dashboard', 'markets', 'trade', 'portfolio', 'orders', 'watchlist', 'history', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
  document.body.dataset.view = v;
  $$('section[data-v]').forEach(s => s.hidden = !s.dataset.v.split(' ').includes(v));
  $$('#nav a').forEach(a => { a.classList.toggle('on', a.hash === '#' + v); a.toggleAttribute('aria-current', a.hash === '#' + v); });
  $('#nav').classList.remove('open'); render(v); if (v === 'portfolio') renderPnl(); window.scrollTo(0, 0);
}

/* ---------- Simulated price feed (random walk every 1.5s) ---------- */
function tick() {
  ASSETS.forEach(a => { a.price = Math.max(a.price * (1 + (Math.random() - 0.5) * (a.cat === 'Forex' ? 0.0004 : 0.0016)), 1e-4); a.chg = (a.price / a.open - 1) * 100; });
  fillOrders(); tickChart();
  const f = document.activeElement; render(view(), !(f && f.closest && f.closest('table,#wlMini')));
}

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const g = k => e.target.closest(`[data-${k}]`)?.dataset[k]; let v;
  if ((v = g('star')) !== undefined) toggleWatch(v);
  else if ((v = g('sel'))) { select(v); if (!['#trade', '#dashboard'].includes(location.hash)) location.hash = '#trade'; }
  else if ((v = g('cancel'))) { S.orders.find(o => o.id == v).st = 'cancelled'; save(); notify('Order cancelled.'); render(); }
  else if ((v = g('info'))) showInfo(v);
  else if ((v = g('tf'))) { S.tf = v; save(); $$('[data-tf]').forEach(b => b.classList.toggle('on', b.dataset.tf === v)); loadChart(); }
  else if ((v = g('zoom'))) zoom(v);
  else if ((v = g('cat'))) { mCat = v; $$('[data-cat]').forEach(b => b.classList.toggle('on', b.dataset.cat === v)); renderMarkets(); }
  else if ((v = g('sort'))) { mSort = [v, mSort[0] === v ? -mSort[1] : -1]; renderMarkets(); }
  else if ((v = g('perf'))) { perf = v; $$('[data-perf]').forEach(b => b.classList.toggle('on', b.dataset.perf === v)); renderPnl(); }
  else if ((v = g('side'))) { side = v; syncForm(); }
  else if ((v = g('type'))) { otype = v; syncForm(); }
  else if ((v = g('set'))) {
    if (v === 'theme') setTheme(S.theme === 'dark' ? 'light' : 'dark');
    if (v === 'clearn') { S.notes = []; save(); renderNotes(); }
    if (v === 'reset' && confirm('Reset all demo data?')) { try { localStorage.removeItem('meridian'); } catch { } location.reload(); }
  }
  else if (e.target.closest('[data-ctype]')) { lineMode = !lineMode; cs.applyOptions({ visible: !lineMode }); ls.applyOptions({ visible: lineMode }); e.target.textContent = lineMode ? 'Candles' : 'Line'; e.target.setAttribute('aria-pressed', lineMode); }
  const n = e.target.closest('#nlist button'); if (n) { S.notes[+n.dataset.n].r = 1; save(); ren