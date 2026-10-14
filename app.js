/* 신혼여행 13일 — 지도 중심 여행 앱 (정적 페이지 + Supabase RPC)
   데이터: Supabase private-job 프로젝트 trip 스키마. 읽기/쓰기는 로그인한 관리자(wed_managers)만 가능한 RPC로만 한다. */
(() => {
"use strict";
const SUPABASE_URL = "https://kialuqypzhtiazpfamvs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpYWx1cXlwemh0aWF6cGZhbXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDkxMTAsImV4cCI6MjA5NjgyNTExMH0.ZZGFoA3AuJ9stLBccFAHIfmJdUL4_MR13lLDhJuC5xo";
const CACHE_KEY = "hm-trip-cache-v2", UI_KEY = "hm-ui-v2", GEO_KEY = "hm-geo-v1";

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const SVG = {
  nav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
  route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/></svg>',
  memo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  plane: '<svg viewBox="0 0 56 14"><path d="M2 7h52" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/></svg>'
};

const CITY_VAR = { "파리": "var(--paris)", "피렌체": "var(--florence)", "로마": "var(--rome)", "인천": "var(--seoul)" };
const CITY_GEO = { "파리": [48.8566, 2.3522], "피렌체": [43.7696, 11.2558], "로마": [41.9028, 12.4964], "인천": [37.46, 126.44] };
const TYPE = {
  flight: ["항공", "var(--move)"], train: ["기차", "var(--move)"], transfer: ["이동", "var(--move)"], checkin: ["체크인", "var(--move)"], checkout: ["체크아웃", "var(--move)"],
  visit: ["관광", "var(--city)"], tour: ["투어", "var(--city)"], queue: ["줄서기", "var(--city)"],
  meal: ["식사", "var(--meal)"], cafe: ["카페", "var(--meal)"], photo: ["사진·노을", "var(--photo)"], shopping: ["쇼핑", "var(--shop)"], free: ["자유 시간", "var(--free)"]
};
const KEYS = [["이동", "var(--move)"], ["관광", "var(--city)"], ["식사", "var(--meal)"], ["사진·노을", "var(--photo)"], ["쇼핑", "var(--shop)"], ["자유", "var(--free)"]];
const BSTAT = { confirmed: ["확정", "p-ok"], to_book: ["예약 필요", "p-crit"], unknown: ["확인 필요", "p-warn"], cancelled: ["취소", "p-mute"] };
const RES = { must: ["예약 필수", "p-crit"], rec: ["예약 권장", "p-warn"], free: ["예약 불필요", "p-ok"] };
const MEAL = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식" };
const WD = ["일", "월", "화", "수", "목", "금", "토"];

const S = {
  data: null, source: "", user: null, tab: "today", sel: null, sim: null, simKey: "",
  infoTab: "book", dineFilter: "day", memoFilter: "all", travelMode: "walking",
  sheet: null, editingMemo: null, lastLoad: 0, loading: false
};
const ui0 = ls.get(UI_KEY); if (ui0) Object.assign(S, { tab: ui0.tab || "today", infoTab: ui0.infoTab || "book", dineFilter: ["day", "open", "all"].includes(ui0.dineFilter) ? ui0.dineFilter : "day", travelMode: ui0.travelMode || "walking" });
const saveUI = () => ls.set(UI_KEY, { tab: S.tab, infoTab: S.infoTab, dineFilter: S.dineFilter, travelMode: S.travelMode });

/* ── 시간 ── */
const fmtC = {};
function hm(e, tz) { if (e == null) return ""; const k = tz || "UTC"; fmtC[k] ||= new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: k }); return fmtC[k].format(new Date(e * 1000)); }
function ymd(e, tz) { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }).format(new Date(e * 1000)); }
function tzOff(dateStr, tz) { const d = new Date(dateStr + "T12:00:00Z"); const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {}); return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - d.getTime()) / 60000); }
function midnight(dateStr, tz) { return Math.floor(Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10)) / 1000) - tzOff(dateStr, tz) * 60; }
const now = () => S.sim ?? Math.floor(Date.now() / 1000);
function dur(s) { s = Math.max(0, Math.round(s)); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); if (d > 0) return `${d}일 ${h}시간`; if (h > 0) return `${h}시간 ${m}분`; return `${m}분`; }
function md(dateStr) { const d = new Date(dateStr + "T12:00:00Z"); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${WD[d.getUTCDay()]}요일`; }
function mdShort(dateStr) { const d = new Date(dateStr + "T12:00:00Z"); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; }
function sunset(dateStr, lat, lng) {
  const rad = Math.PI / 180, d = new Date(dateStr + "T12:00:00Z"); const N = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
  const g = 2 * Math.PI / 365 * (N - 1 + 0.5);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const de = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(de)) - Math.tan(lat * rad) * Math.tan(de)) / rad;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000 + (720 - 4 * (lng - ha) - eq) * 60);
}
const daySunset = day => { const g = CITY_GEO[day.city] || CITY_GEO["파리"]; return sunset(day.date, g[0], g[1]); };

/* ── 파생 ── */
const D = () => S.data || { days: [], bookings: [], stays: [], info: [], todos: [], memos: [], guide: {} };
const days = () => D().days || [];
const allItems = () => days().flatMap(d => (d.items || []).map(it => ({ ...it, day: d })));
const booking = id => (D().bookings || []).find(b => b.id === id);
function curDayIdx() { const t = now(), ds = days(); if (!ds.length) return 0; for (let i = 0; i < ds.length; i++) if (ymd(t, ds[i].tz) === ds[i].date) return i; return t < midnight(ds[0].date, ds[0].tz) ? -1 : ds.length; }
const phase = () => { const i = curDayIdx(); return i < 0 ? "before" : i >= days().length ? "after" : "during"; };
const selDay = () => days()[Math.max(0, Math.min(S.sel ?? 0, days().length - 1))];
function itemTags(it) {
  const g = D().guide || {}, out = [];
  if ((g.pickpocket_items || []).includes(it.id)) out.push({ k: "pick" });
  const r = (g.rain || []).find(x => x.item === it.id); if (r) out.push({ k: "rain", alt: r.alt });
  (D().info || []).filter(x => x.pid && x.pid === it.pid).forEach(x => out.push({ k: "info", x }));
  return out;
}
const memosFor = it => (D().memos || []).filter(m => m.item_id === it.id);
const memosForDay = d => (D().memos || []).filter(m => m.day_id === d.id);
const who = email => ((D().guide || {}).names || {})[(email || "").toLowerCase()] || (email ? email.split("@")[0] : "");
function setCity(day) { document.documentElement.style.setProperty("--city", CITY_VAR[day?.city] || "var(--paris)"); }
const pill = (t, c) => `<span class="pill ${c}">${esc(t)}</span>`;

/* 지도 좌표 → 하루 동선 */
function dayStops(day) {
  const ds = [], seen = new Set();
  (day.items || []).forEach((it, idx) => {
    if (it.lat == null || it.tz === "Asia/Seoul") return;
    const key = it.pid; const prev = ds[ds.length - 1];
    if (prev && prev.pid === key) { prev.items.push(it); return; }
    ds.push({ pid: key, lat: +it.lat, lng: +it.lng, name: it.pll || it.pl || it.ti, label: it.pl || it.ti, items: [it], cat: it.cat, t: it.t });
    seen.add(key);
  });
  ds.forEach(x => { x.skip = x.items.every(i => i.st === "skipped"); x.done = !x.skip && x.items.every(i => i.st === "done" || i.st === "skipped"); });
  return ds;
}
function localCluster(stops) {
  if (stops.length < 2) return stops;
  const last = stops[stops.length - 1];
  const dist = (a, b) => { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  return stops.filter(s => dist(s, last) < 35);
}
const ll = s => `${s.lat},${s.lng}`;
function gDirUrls(stops, mode) {
  const out = []; const size = 10;
  for (let i = 0; i < stops.length - 1; i += size - 1) {
    const ch = stops.slice(i, i + size); if (ch.length < 2) break;
    const p = new URLSearchParams({ api: "1", origin: ll(ch[0]), destination: ll(ch[ch.length - 1]), travelmode: mode });
    if (ch.length > 2) p.set("waypoints", ch.slice(1, -1).map(ll).join("|"));
    out.push("https://www.google.com/maps/dir/?" + p.toString().replace(/%2C/g, ",").replace(/%7C/g, "|"));
  }
  return out;
}
const gPlaceUrl = it => it.u || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((it.pll || it.pl || it.n || "") + (it.addr || it.a ? ", " + (it.addr || it.a) : ""))}`;
const gNavUrl = (it, mode) => `https://www.google.com/maps/dir/?api=1&destination=${it.lat != null ? `${it.lat},${it.lng}` : encodeURIComponent((it.pll || it.pl || it.n || "") + (it.addr || it.a ? ", " + (it.addr || it.a) : ""))}&travelmode=${mode || S.travelMode}`;
function gEmbedPlace(it) { const q = it.addr || it.a ? `${it.pll || it.pl || it.n}, ${it.addr || it.a}` : (it.lat != null ? `${it.lat},${it.lng}` : (it.pll || it.pl || it.n)); return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&hl=ko&output=embed`; }

/* ── Supabase ── */
let sb = null;
function initSb() { if (sb) return sb; if (!window.supabase?.createClient) return null; sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }); return sb; }
async function rpc(fn, args) { const c = initSb(); if (!c) throw new Error("offline"); const { data, error } = await c.rpc(fn, args || {}); if (error) throw error; return data; }

async function load(silent) {
  if (S.loading) return; S.loading = true;
  try {
    const d = await rpc("trip_app_export");
    S.data = d; S.source = "live"; S.lastLoad = Date.now(); ls.set(CACHE_KEY, d);
    if (!silent) toast("최신 일정을 불러왔습니다");
    geocodeMissing();
  } catch (e) {
    if (String(e.message || "").includes("not_allowed")) { S.source = "denied"; }
    else { const c = ls.get(CACHE_KEY); if (c) { S.data = c; S.source = "cache"; } else S.source = "error"; }
  } finally { S.loading = false; render(); }
}

/* 좌표 없는 식당·장소를 OpenStreetMap(Nominatim)으로 찾아 저장 (초당 1건) */
let geoRunning = false;
async function geocodeMissing() {
  if (geoRunning || S.source !== "live") return; geoRunning = true;
  const tried = ls.get(GEO_KEY) || {};
  const todo = new Map();
  days().forEach(d => { (d.items || []).forEach(it => { if (it.pid && it.lat == null && (it.addr || it.pll) && !tried[it.pid]) todo.set(it.pid, { q: [it.pll || it.pl, it.addr].filter(Boolean).join(", "), city: d.city }); });
    (d.dining || []).forEach(sl => (sl.o || []).forEach(o => { if (o.pid && o.lat == null && o.a && !tried[o.pid]) todo.set(o.pid, { q: o.a, city: sl.city }); })); });
  let n = 0, changed = false;
  for (const [pid, v] of todo) {
    if (n++ >= 80) break;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ko&q=${encodeURIComponent(v.q)}`, { headers: { Accept: "application/json" } });
      const j = await r.json(); tried[pid] = 1; ls.set(GEO_KEY, tried);
      if (j[0]) { const lat = +(+j[0].lat).toFixed(6), lng = +(+j[0].lon).toFixed(6); const g = CITY_GEO[v.city];
        if (!g || Math.abs(lat - g[0]) < .5 && Math.abs(lng - g[1]) < .6) { await rpc("trip_place_coords", { p_place_id: pid, p_lat: lat, p_lng: lng }); applyCoords(pid, lat, lng); changed = true; } }
    } catch (e) { break; }
    await new Promise(r => setTimeout(r, 1100));
  }
  geoRunning = false; if (changed) { ls.set(CACHE_KEY, S.data); if (S.tab === "today" || S.tab === "plan" || S.tab === "dine") drawMap(); }
}
function applyCoords(pid, lat, lng) { days().forEach(d => { (d.items || []).forEach(it => { if (it.pid === pid) { it.lat = lat; it.lng = lng; } }); (d.dining || []).forEach(sl => (sl.o || []).forEach(o => { if (o.pid === pid) { o.lat = lat; o.lng = lng; } })); }); }

/* ── 지도 (Leaflet) ── */
let map = null, mapEl = null, layer = null, markerById = {}, tileLayer = null;
const dark = () => matchMedia("(prefers-color-scheme: dark)").matches;
function ensureMap() {
  if (!window.L) return null;
  /* 분리된 요소에 L.map을 만들면 Leaflet이 position:relative를 인라인으로 박아 높이가 0이 된다 → 미리 절대 위치 지정 */
  if (!mapEl) { mapEl = document.createElement("div"); mapEl.id = "map"; mapEl.style.cssText = "position:absolute;inset:0"; }
  if (!map) {
    map = L.map(mapEl, { zoomControl: false, attributionControl: true, tap: true });
    L.control.zoom({ position: "topright" }).addTo(map);
    setTiles(); layer = L.layerGroup().addTo(map);
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", setTiles);
  }
  return map;
}
function setTiles() {
  if (!map) return; if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark() ? "dark_all" : "rastertiles/voyager"}/{z}/{x}/{y}{r}.png`, { maxZoom: 19, subdomains: "abcd", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' }).addTo(map);
}
function mountMap() {
  const slot = $("#map-slot"); if (!slot) return;
  if (!ensureMap()) { slot.innerHTML = `<div class="map-fallback">지도를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.<br>아래 ‘구글 지도로 동선 열기’는 그대로 쓸 수 있습니다.</div>`; return; }
  slot.appendChild(mapEl); setTimeout(() => { map.invalidateSize(); drawMap(); }, 0);
}
function drawMap() {
  if (!map || !mapEl.isConnected) return;
  layer.clearLayers(); markerById = {};
  const day = S.tab === "dine" ? null : selDay();
  if (S.tab === "dine") { drawDineMap(); return; }
  if (!day) return;
  const stops = dayStops(day); const t = now(); const live = isLive(day);
  const color = getComputedStyle(document.documentElement).getPropertyValue("--city").trim();
  const cityColor = getComputedStyle(document.documentElement).getPropertyValue(CITY_VAR[day.city]?.slice(4, -1) || "--paris").trim() || color;
  const routeStops = stops.filter(s => !s.skip);
  if (routeStops.length > 1) L.polyline(routeStops.map(s => [s.lat, s.lng]), { color: cityColor, weight: 4, opacity: .75, dashArray: "1 8", lineCap: "round" }).addTo(layer);
  stops.forEach((s, i) => {
    const it = s.items[0]; const isNow = live && s.items.some(x => x.s <= t && t < (x.e ?? x.s)); const isPast = s.done || live && s.items.every(x => (x.e ?? x.s) < t);
    const hotel = s.cat === "hotel"; const k = TYPE[it.t]?.[1] === "var(--city)" ? cityColor : getVar(TYPE[it.t]?.[1]);
    const icon = L.divIcon({ className: "", html: `<div class="pin ${hotel ? "hotel" : ""} ${isNow ? "is-now" : ""} ${isPast ? "done" : ""} ${s.skip ? "skip" : ""}" style="--k:${k}">${hotel ? "숙" : i + 1}</div>`, iconSize: isNow ? [38, 38] : [30, 30], iconAnchor: isNow ? [19, 19] : [15, 15] });
    const m = L.marker([s.lat, s.lng], { icon, title: s.label, zIndexOffset: isNow ? 1000 : 0 }).addTo(layer);
    m.on("click", () => openItem(it.id));
    s.items.forEach(x => markerById[x.id] = m);
  });
  /* 그날 고른 식당 */
  (day.dining || []).forEach(sl => { const o = (sl.o || []).find(o => o.status === "chosen"); if (o && o.lat != null) {
    const m = L.marker([o.lat, o.lng], { icon: L.divIcon({ className: "", html: `<div class="pin food">${sl.meal === "lunch" ? "점" : "저"}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }), title: o.n }).addTo(layer);
    m.on("click", () => openDine(sl.sid, o.id)); } });
  const pts = (stops.length ? stops : []).map(s => [s.lat, s.lng]);
  if (pts.length === 1) map.setView(pts[0], 15); else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16 });
  else map.setView(CITY_GEO[day.city] || CITY_GEO["파리"], 13);
}
function drawDineMap() {
  const day = selDay(); const f = S.dineFilter; const pts = [];
  (day?.dining || []).forEach(sl => (sl.o || []).forEach((o, i) => { if (o.lat == null) return; pts.push([o.lat, o.lng]);
    const m = L.marker([o.lat, o.lng], { icon: L.divIcon({ className: "", html: `<div class="pin food" style="${o.status === "chosen" ? "background:var(--meal);color:#fff" : ""}">${sl.meal === "lunch" ? "점" : "저"}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }), title: o.n }).addTo(layer);
    m.on("click", () => openDine(sl.sid, o.id)); }));
  dayStops(day).filter(s => s.cat === "hotel").forEach(s => L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "", html: `<div class="pin hotel">숙</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(layer));
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 16 }); else if (pts.length) map.setView(pts[0], 15); else map.setView(CITY_GEO[day?.city] || CITY_GEO["파리"], 13);
}
const getVar = v => { if (!v) return "#888"; const m = v.match(/var\((--[^)]+)\)/); return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : v; };
const isLive = day => phase() === "during" && selDay() === day || !!S.sim && selDay() === day;

/* ── 화면 조각 ── */
function header() {
  const ds = days(); const ci = curDayIdx(); const d = selDay(); const t = now(); const ph = phase();
  let title = "신혼여행 13일", sub = "";
  if (ph === "before") { const f = allItems()[0]; title = `출국까지 ${dur(f.s - t)}`; sub = `${md(ds[0].date)} ${hm(f.s, f.tz)} ${f.ti}`; }
  else if (ph === "after") { title = "여행을 마쳤습니다"; sub = "13일 동안의 기록"; }
  if (S.tab !== "today" || ph === "during" || S.sim) { title = `${d.city} · Day ${d.n}`; sub = `${md(d.date)} · ${d.theme}`; }
  return `<header class="top"><div class="top-in">
      <div class="place-title"><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
      <div class="clock"><b>${hm(t, d?.tz)}</b><span>${esc(d?.city || "현지")}${S.sim ? " 미리보기" : ""} · 서울 ${hm(t, "Asia/Seoul")}</span></div>
    </div>
    <div class="days" role="tablist" aria-label="여행 날짜">${ds.map((x, i) => { const dt = new Date(x.date + "T12:00:00Z");
      return `<button class="day ${i === ci ? "today" : ""} ${i < ci ? "past" : ""}" style="--c:${CITY_VAR[x.city]}" data-day="${i}" role="tab" aria-current="${i === S.sel}" aria-label="Day ${x.n} ${mdShort(x.date)} ${x.city}"><small>${WD[dt.getUTCDay()]}</small><b>${dt.getUTCDate()}</b><i></i></button>`; }).join("")}</div></header>`;
}
function mapCard(day) {
  const stops = localCluster(dayStops(day).filter(s => !s.skip)); const urls = gDirUrls(stops, S.travelMode);
  return `<div class="mapcard">
    <div id="map-slot" style="position:absolute;inset:0"></div>
    <div class="map-tools">${urls.length ? urls.map((u, i) => `<a class="btn primary sm" href="${esc(u)}" target="_blank" rel="noopener">${SVG.route}${urls.length > 1 ? `동선 ${i + 1}/${urls.length}` : "구글 지도로 동선 열기"}</a>`).join("") : ""}
      <span style="flex:1"></span>
      <button class="btn sm" data-travel aria-label="이동 수단 바꾸기">${S.travelMode === "walking" ? "도보" : "대중교통"}</button></div>
  </div>`;
}
function timeline(day, live) {
  const t = now(), ss = daySunset(day); let out = `<div class="tl">`, prevEnd = null, ssShown = false;
  const ms = mealSlots(day); const base = midnight(day.date, day.tz);
  /* 일정에 식사 항목이 없는 끼니는 기본 시각(점심 12:30, 저녁 19:30)에 끼워 넣음 */
  const vir = ms.filter(m => !m.it).map(m => ({ vir: m, s: base + (m.sl.meal === "lunch" ? 12.5 : m.sl.meal === "breakfast" ? 8.5 : 19.5) * 3600 }));
  const items = [...(day.items || []), ...vir].sort((a, b) => a.s - b.s);
  const stops = dayStops(day); const numOf = {}; stops.forEach((s, i) => s.items.forEach(x => numOf[x.id] = s.cat === "hotel" ? "숙" : i + 1));
  items.forEach(it => {
    if (!ssShown && it.s > ss) { out += sunLine(ss, day.tz); ssShown = true; }
    if (it.vir) { const { sl, ch } = it.vir;
      out += `<div class="stop dot ${ch ? "" : "undec"}" style="--k:var(--meal)"><div class="tm"><b>${MEAL[sl.meal]}</b><small></small></div><div class="rail"><span class="num"></span></div>
        <div class="body">${ch ? `<button class="row-btn" data-dine="${sl.sid}:${ch.id}"><span class="tx"><b>${MEAL[sl.meal]} · ${esc(ch.n)}</b><span class="tags">${pill("고른 식당", "p-ok")}${pill(RES[ch.r][0], RES[ch.r][1])}</span></span><span class="chev">${SVG.chev}</span></button>`
          : `<button class="row-btn" data-goto="dine"><span class="tx"><b>${MEAL[sl.meal]} · 아직 정하지 않았어요</b><span>후보 ${sl.o.length}곳 · 눌러서 고르기</span></span><span class="chev">${SVG.chev}</span></button>`}</div></div>`;
      return; }
    const msl = it.t === "meal" ? ms.find(m => m.it === it) : null;
    if (msl?.ch) { const { sl, ch } = msl; const isNow = live && it.s <= t && t < (it.e ?? it.s); const isPast = it.st === "done" || live && (it.e ?? it.s) < t;
      out += `<div class="stop dot ${isNow ? "is-now" : ""} ${isPast ? "past" : ""}" style="--k:var(--meal)"><div class="tm"><b>${hm(it.s, it.tz)}</b><small>${it.e ? hm(it.e, it.tz) : ""}</small></div><div class="rail"><span class="num"></span></div>
        <div class="body"><button class="row-btn" data-dine="${sl.sid}:${ch.id}"><span class="tx"><b>${esc(it.ti)} · ${esc(ch.n)}</b>${it.pl && it.pl !== ch.n ? `<span>처음 계획: ${esc(it.pl)}</span>` : ""}<span class="tags">${pill("고른 식당", "p-ok")}${pill(RES[ch.r][0], RES[ch.r][1])}</span></span><span class="chev">${SVG.chev}</span></button></div></div>`;
      prevEnd = it.e ?? it.s; return; }
    if (prevEnd != null && it.s - prevEnd >= 1800) out += `<div class="gap">${dur(it.s - prevEnd)} 여유</div>`;
    const k = TYPE[it.t]?.[1] || "var(--free)"; const isNow = live && it.s <= t && t < (it.e ?? it.s); const isPast = it.st === "done" || live && (it.e ?? it.s) < t; const isSkip = it.st === "skipped";
    const bks = (it.b || []).map(booking).filter(Boolean); const tg = itemTags(it); const mc = memosFor(it).length;
    const tags = (it.st === "done" ? [pill("완료", "p-ok")] : isSkip ? [pill("건너뜀", "p-mute")] : []).concat([pill(TYPE[it.t]?.[0] || it.t, "p-mute")]).concat(bks.filter(b => b.status !== "confirmed").map(b => pill(BSTAT[b.status][0], BSTAT[b.status][1])))
      .concat(bks.some(b => b.status === "confirmed") ? [pill("예약 확정", "p-ok")] : [])
      .concat(tg.some(x => x.k === "pick") ? [pill("소매치기 주의", "p-warn")] : []).concat(tg.some(x => x.k === "rain") ? [pill("비 올 때 대안", "p-city")] : [])
      .concat(mc ? [pill(`메모 ${mc}`, "p-city")] : []).join("");
    const endTz = it.etz || it.tz; const endTxt = it.e != null ? hm(it.e, endTz) + (ymd(it.e, endTz) !== ymd(it.s, it.tz) ? "+1" : "") : "";
    const num = numOf[it.id];
    out += `<div class="stop ${num ? "" : "dot"} ${isNow && !isSkip ? "is-now" : ""} ${isPast ? "past" : ""} ${isSkip ? "skip" : ""}" style="--k:${k}">
      <div class="tm"><b>${hm(it.s, it.tz)}</b><small>${endTxt}${it.etz && it.etz !== it.tz ? " 현지" : ""}</small></div>
      <div class="rail"><span class="num">${num ?? ""}</span></div>
      <div class="body"><button class="row-btn" data-item="${it.id}"><span class="tx"><b>${esc(it.ti)}</b>${it.pl && it.pl !== it.ti ? `<span>${esc(it.pl)}${it.pll ? " · " + esc(it.pll) : ""}</span>` : (it.pll ? `<span>${esc(it.pll)}</span>` : "")}<span class="tags">${tags}</span></span><span class="chev">${SVG.chev}</span></button></div></div>`;
    prevEnd = it.e ?? it.s;
  });
  if (!ssShown) out += sunLine(ss, day.tz);
  return out + `</div>`;
}
const sunLine = (ss, tz) => `<div class="sunline"><span class="tm">${hm(ss, tz)}</span><span class="rail"><i></i></span><span style="display:flex;gap:8px;align-items:center">일몰<span class="ln" style="flex:1"></span></span></div>`;

/* 하루 진행 점: 지도 핀 번호와 같은 번호. 누르면 그 장소 상세 */
function dayDots(day, t) {
  const st = dayStops(day); if (st.length < 2) return "";
  const end = s => Math.max(...s.items.map(x => x.e ?? x.s)), start = s => Math.min(...s.items.map(x => x.s));
  let ci = st.findIndex(s => s.items.some(x => x.s <= t && t < (x.e ?? x.s)));
  if (ci < 0) ci = st.findIndex(s => start(s) > t);
  const spots = st.filter(s => s.cat !== "hotel"); const curSpot = ci >= 0 ? st.slice(0, ci + 1).filter(s => s.cat !== "hotel").length : spots.length;
  const dots = st.map((s, i) => { const past = s.done || end(s) < t && i !== ci; const cls = s.skip ? "skip" : i === ci ? "cur" : past ? "past" : "";
    return `<button class="d ${cls}" data-item="${s.items[0].id}" aria-label="${i + 1}번 ${esc(s.label)} 보기">${s.cat === "hotel" ? "숙" : i + 1}</button>`; }).join("<b></b>");
  const done = spots.filter(s => s.done || end(s) < t).length;
  return `<div class="dots-h"><span>오늘 동선 ${Math.min(curSpot, spots.length)} / ${spots.length}</span><span>${done}곳 지남 · 번호를 누르면 상세</span></div><div class="dots">${dots}</div>`;
}
/* 메인 카드 안 시간대 진행바 (일정 시작~끝, 일몰 표시) */
function heroBar(day, t, live) {
  const its = (day.items || []).filter(it => it.s != null && it.tz !== "Asia/Seoul"); if (!its.length) return "";
  const a = Math.min(...its.map(i => i.s)), b = Math.max(...its.map(i => i.e ?? i.s)); if (b <= a) return "";
  const pos = e => Math.min(100, Math.max(0, (e - a) / (b - a) * 100)); const ss = daySunset(day);
  const segs = its.map(it => { const x = pos(it.s), w = Math.max(.8, pos(it.e ?? it.s + 1800) - x); const on = it.st === "done" || live && (it.e ?? it.s) <= t; const cur = live && it.s <= t && t < (it.e ?? it.s);
    return `<i class="${cur ? "cur" : on ? "on" : ""} ${it.st === "skipped" ? "skip" : ""}" style="left:${x}%;width:${w}%"></i>`; }).join("");
  const nowL = live && t >= a && t <= b ? `<span class="nowl" style="left:${pos(t)}%"></span>` : "";
  const ssM = ss > a && ss < b ? `<span class="ssm" style="left:${pos(ss)}%" title="일몰"></span>` : "";
  return `<div class="hbar" aria-hidden="true"><div class="trk">${segs}${ssM}${nowL}</div><div class="hx"><span>${hm(a, its[0].tz)} 시작</span>${ss > a && ss < b ? `<span class="ss"><i></i>일몰 ${hm(ss, day.tz)}</span>` : ""}<span>끝 ${hm(b, its[its.length - 1].etz || its[its.length - 1].tz)}</span></div></div>`;
}
/* 두 지점 사이 이동 추천 (직선거리 기반) */
function kmBetween(a, b) { const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
const hasLL = x => x && x.lat != null && x.lng != null;
function legHTML(day, from, to) {
  if (!to) return "";
  const MOVE = ["flight", "train", "transfer"];
  if (MOVE.includes(to.t)) return `<div class="leg2"><span class="ic">${SVG.route}</span><span class="tx"><b>${esc(to.ti)}</b><span>${hm(to.s, to.tz)} 출발${to.e ? ` · ${dur(to.e - to.s)} 소요` : ""}</span></span>${hasLL(to) ? `<a class="btn sm" href="${esc(gNavUrl(to, to.t === "transfer" ? "driving" : "transit"))}" target="_blank" rel="noopener">${SVG.nav}경로</a>` : ""}</div>`;
  if (!hasLL(to)) return to.pl ? `<div class="leg2"><span class="ic">${SVG.nav}</span><span class="tx"><b>${esc(to.pl)}</b><span>좌표가 없어 이동 시간을 계산하지 못했습니다</span></span><a class="btn sm" href="${esc(gNavUrl(to))}" target="_blank" rel="noopener">${SVG.nav}길찾기</a></div>` : "";
  const o = hasLL(from) ? from : null;
  const p = new URLSearchParams({ api: "1", destination: `${to.lat},${to.lng}` }); if (o) p.set("origin", `${o.lat},${o.lng}`);
  if (!o) { p.set("travelmode", "walking"); return `<div class="leg2"><span class="ic">${SVG.nav}</span><span class="tx"><b>${esc(to.pl || to.ti)}까지</b><span>현재 위치에서 경로를 확인하세요</span></span><a class="btn sm" href="https://www.google.com/maps/dir/?${p.toString().replace(/%2C/g, ",")}" target="_blank" rel="noopener">${SVG.nav}경로</a></div>`; }
  const km = kmBetween(o, to); if (km < .08) return "";
  const walk = km <= 1.6, mins = Math.round(km * 1.3 * 1000 / 75); p.set("travelmode", walk ? "walking" : "transit");
  const leave = walk ? to.s - (mins + 5) * 60 : null;
  return `<div class="leg2"><span class="ic">${walk ? "🚶" : "🚇"}</span><span class="tx"><b>${walk ? `도보 약 ${mins}분` : "대중교통·택시 추천"} <small>· 직선 ${km < 1 ? Math.round(km * 1000) + "m" : km.toFixed(1) + "km"}</small></b><span>${leave ? `${hm(leave, to.tz)}쯤 출발 · ` : ""}${esc(o.pl || o.ti)} → ${esc(to.pl || to.ti)}</span></span><a class="btn sm" href="https://www.google.com/maps/dir/?${p.toString().replace(/%2C/g, ",")}" target="_blank" rel="noopener">${SVG.route}경로</a></div>`;
}
/* 끼니 슬롯 ↔ 일정의 식사 항목 */
const mealOf = it => { const h = +hm(it.s, it.tz).slice(0, 2); return h < 11 ? "breakfast" : h < 16 ? "lunch" : "dinner"; };
function mealSlots(day) {
  const items = day.items || [];
  return (day.dining || []).map(sl => { const ch = (sl.o || []).find(o => o.status === "chosen"); const it = items.find(i => i.t === "meal" && mealOf(i) === sl.meal);
    return { sl, ch, it, decided: !!(ch || it?.pl) }; });
}
function mealBands(day) {
  return mealSlots(day).filter(m => !m.decided).map(m => `<button class="band warn" data-goto="dine"><span class="bd-dot"></span><span class="tx"><b>${MEAL[m.sl.meal]} 장소를 아직 정하지 않았어요</b><span>후보 ${m.sl.o.length}곳 중에서 골라 주세요</span></span><span class="go">고르기${SVG.chev}</span></button>`).join("");
}
/* 그날 챙길 것 */
function dayChecks(day, live) {
  const t = now(); const dayInfo = (D().info || []).filter(x => x.from && x.from <= day.date && (x.to || x.from) >= day.date);
  const ref = live ? t : Math.max(t, midnight(day.date, day.tz));
  const todoDue = (D().todos || []).filter(td => td.due && td.due <= ref + 3 * 86400 && (!td.done || td.due >= ref - 86400));
  const checked = id => (D().checks || []).some(c => c.day === day.id && c.info === id);
  return { dayInfo, todoDue, checked, open: dayInfo.filter(x => !checked(x.id)).length + todoDue.filter(td => !td.done).length };
}
function checksCard(day, live, title) {
  const { dayInfo, todoDue, checked } = dayChecks(day, live); if (!dayInfo.length && !todoDue.length) return "";
  return `<div class="sec-h"><h2>${title}</h2></div><section class="card" style="margin:0 16px">${dayInfo.map(x => { const c = checked(x.id); return `<label class="chk ${c ? "done" : ""}"><span class="tx"><b>${esc(x.title)}</b><span>${esc(x.body)}</span></span><input type="checkbox" data-dcheck="${day.id}:${x.id}" ${c ? "checked" : ""} aria-label="${esc(x.title)} 확인"></label>`; }).join("")}${todoDue.map(td => `<label class="chk ${td.done ? "done" : ""}"><span class="tx"><b>${pill("할 일", "p-crit")} ${esc(td.title)}</b>${td.note ? `<span>${esc(td.note)}</span>` : ""}</span><input type="checkbox" data-todo="${td.id}" ${td.done ? "checked" : ""} aria-label="${esc(td.title)} 완료"></label>`).join("")}</section>`;
}
/* 오늘 탭: 단계별 핵심만 */
function stageList(day, live) {
  const t = now(); const ms = mealSlots(day); const chosenFor = it => ms.find(m => m.it === it)?.ch;
  const rows = (day.items || []).map(it => { const isNow = live && it.s <= t && t < (it.e ?? it.s); const past = it.st === "done" || live && (it.e ?? it.s) <= t; const skip = it.st === "skipped"; const ch = it.t === "meal" ? chosenFor(it) : null;
    const place = ch ? ch.n : (it.pl && it.pl !== it.ti ? it.pl : "");
    return `<button class="stg ${isNow ? "is-now" : ""} ${past ? "past" : ""} ${skip ? "skip" : ""}" style="--k:${TYPE[it.t]?.[1] || "var(--free)"}" ${ch ? `data-dine="${ms.find(m => m.ch === ch).sl.sid}:${ch.id}"` : `data-item="${it.id}"`}>
      <span class="tm">${hm(it.s, it.tz)}</span><span class="mk">${it.st === "done" ? "✓" : ""}</span><span class="tx"><b>${esc(it.ti)}</b>${place ? `<span>${esc(place)}</span>` : ""}</span>${isNow ? `<span class="pill p-city">지금</span>` : ""}</button>`; }).join("");
  const vir = ms.filter(m => !m.it).map(m => m.ch ? `<button class="stg" style="--k:var(--meal)" data-dine="${m.sl.sid}:${m.ch.id}"><span class="tm">${MEAL[m.sl.meal]}</span><span class="mk"></span><span class="tx"><b>${esc(m.ch.n)}</b><span>고른 식당</span></span></button>` : "").join("");
  return rows || vir ? `<section class="card stages" style="margin:0 16px">${rows}${vir}</section>` : `<div class="empty">이 날은 등록된 일정이 없습니다.</div>`;
}
/* ── 오늘 ── */
function viewToday() {
  const ph = phase(), t = now(); const day = ph === "during" && !S.sim ? days()[curDayIdx()] : selDay(); setCity(day); const live = isLive(day);
  const items = allItems(); const cur = items.find(it => it.s <= t && t < (it.e ?? it.s)); const nxt = items.find(it => it.s > t);
  let hero = "";
  if (ph === "before" && !S.sim) { const f = items[0]; hero = `<section class="now"><span class="lbl">출국까지</span><h2>${dur(f.s - t)}</h2><span class="sub">${md(days()[0].date)} ${hm(f.s, f.tz)} · ${esc(f.ti)}</span>
      <div class="acts"><button class="btn sm" data-sim-open>여행 중 화면 미리보기</button></div></section>`; }
  else if (ph === "after" && !S.sim) hero = `<section class="now"><span class="lbl">여행 완료</span><h2>13일 동안 수고하셨습니다</h2></section>`;
  else {
    const MOVE = ["flight", "train", "transfer", "checkin", "checkout"];
    const tgt = cur && !MOVE.includes(cur.t) ? cur : null; const isDone = tgt?.st === "done";
    const before = nxt ? [...(day.items || [])].reverse().find(x => x.s < nxt.s && hasLL(x)) : null;
    const from = cur && hasLL(cur) ? cur : before;
    hero = `<section class="now ${isDone ? "is-done" : ""}"><div class="lbl-row"><span class="lbl">${cur ? (isDone ? "방문 완료 · 다음 장소로" : "지금") : "다음 일정까지 여유 시간"}</span>${S.sim ? `<button class="mini" data-sim-off>미리보기 끝내기</button>` : ""}</div>
      ${cur ? `<button class="h2btn" data-item="${cur.id}"><h2>${esc(cur.ti)}</h2><span class="sub">${hm(cur.s, cur.tz)}–${hm(cur.e, cur.etz || cur.tz)}${cur.pl && cur.pl !== cur.ti ? " · " + esc(cur.pl) : ""}</span></button>` : `<h2>${nxt ? esc(nxt.ti) + " 준비" : "오늘 일정을 마쳤습니다"}</h2>`}
      ${tgt ? `<div class="acts">${isDone ? `<span class="done-chip">✓ 방문 완료</span><button class="btn sm" data-hst="${tgt.id}:planned">되돌리기</button>` : `<button class="btn sm solid" data-hst="${tgt.id}:done">✓ 방문 완료</button>`}</div>` : ""}
      ${heroBar(day, t, live)}
      ${dayDots(day, t)}
      ${nxt ? `<div class="next"><div class="t"><span class="sub">다음 · ${hm(nxt.s, nxt.tz)}</span><b>${esc(nxt.ti)}</b></div><div class="count"><b>${dur(nxt.s - t)}</b><span>뒤</span></div></div>
        ${legHTML(day, from, nxt)}` : ""}</section>`;
  }
  const dl = items.find(it => ["flight", "train", "checkout"].includes(it.t) && it.s > t);
  let dlh = "";
  if (dl) { const left = dl.s - t, frac = Math.max(0, Math.min(1, left / (6 * 3600))), C = 2 * Math.PI * 24;
    dlh = `<section class="card deadline"><svg class="ring" viewBox="0 0 58 58" aria-hidden="true"><circle class="bgc" cx="29" cy="29" r="24"/><circle class="fg" cx="29" cy="29" r="24" stroke-dasharray="${C}" stroke-dashoffset="${C * frac}"/><text x="29" y="33" text-anchor="middle">${left < 86400 ? hm(dl.s, dl.tz) : "D-" + Math.ceil(left / 86400)}</text></svg>
      <div style="flex:1;min-width:0"><div class="small muted">다음 이동 · ${mdShort(dl.day.date)}</div><b>${esc(dl.ti)}</b><div class="small">${dur(left)} 남음${dl.t === "flight" ? " · 국제선 3시간, 유럽 내선 2시간 전 도착 권장" : ""}</div></div></section>`; }
  const chk = dayChecks(day, live);
  const bands = (chk.open ? `<button class="band crit" data-goto="plan"><span class="bd-dot"></span><span class="tx"><b>${ph === "before" && !S.sim ? "출발 전 챙겨야 할 것이" : "오늘 챙겨야 할 것이"} ${chk.open}개 있어요</b><span>일정 탭 맨 위에서 확인하고 체크해 주세요</span></span><span class="go">확인${SVG.chev}</span></button>` : "") + mealBands(day);
  return `${hero}
    ${bands ? `<div class="bands">${bands}</div>` : ""}
    ${dlh}
    <div class="sec-h"><h2>${ph === "before" && !S.sim ? "첫날 일정" : "오늘 일정"}</h2><button class="btn ghost sm" data-goto="plan">지도·전체 보기${SVG.chev}</button></div>
    ${stageList(day, live)}`;
}

/* ── 일정 전체 ── */
function viewPlan() {
  const day = selDay(); setCity(day); const live = isLive(day); const isToday = days().indexOf(day) === curDayIdx() || !!S.sim;
  const mb = mealBands(day); const dm = memosForDay(day);
  return `${checksCard(day, live, isToday ? "오늘 챙길 것" : `${mdShort(day.date)} 챙길 것`)}
    <div class="sec-h"><h2>${esc(day.city)} · Day ${day.n}</h2><span>${mdShort(day.date)} · ${esc(day.theme || "")}</span></div>
    ${mapCard(day)}
    ${mb ? `<div class="bands" style="margin-top:12px">${mb}</div>` : ""}
    <div class="sec-h"><h2>시간표</h2><span>${(day.items || []).length}개${dm.length ? ` · 메모 ${dm.length}` : ""} · 일몰 ${hm(daySunset(day), day.tz)}</span></div>
    ${timeline(day, live)}
    <div style="display:flex;gap:8px;padding:16px"><button class="btn" data-step="-1" ${S.sel === 0 ? "disabled" : ""}>이전 날</button><span style="flex:1"></span><button class="btn" data-step="1" ${S.sel === days().length - 1 ? "disabled" : ""}>다음 날</button></div>`;
}

/* ── 식당 ── */
function viewDine() {
  const day = selDay(); setCity(day);
  const slots = days().flatMap(d => (d.dining || []).map(sl => ({ d, sl })));
  const picked = slots.filter(x => x.sl.o.some(o => o.status === "chosen")).length;
  const f = ["day", "open", "all"].includes(S.dineFilter) ? S.dineFilter : "day";
  const list = slots.filter(({ d, sl }) => f === "day" ? d === day : f === "open" ? !sl.o.some(o => o.status === "chosen") : true);
  const ms = mealSlots(day); const planned = sl => ms.find(m => m.sl === sl)?.it;
  /* 주변 식당 더 찾기: 그날 동선의 장소마다 구글 지도 주변 검색 */
  const near = dayStops(day).filter(s => s.lat != null && s.cat !== "airport").slice(0, 8);
  const gNear = (q, s) => `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${s.lat},${s.lng},17z`;
  const more = `<div class="sec-h"><h2>주변 식당 더 찾아보기</h2><span>구글 지도에서 열림</span></div>
    <section class="card more" style="margin:0 16px">
      <button class="btn primary block" data-near-me>${SVG.pin}지금 내 위치 주변 식당</button>
      ${near.length ? `<p class="small muted" style="margin:12px 0 6px">Day ${day.n} 동선 주변</p><div class="near">${near.map(s => `<div class="nr"><span class="nm">${esc(s.cat === "hotel" ? "숙소" : s.label)}</span><a class="btn sm" href="${esc(gNear("restaurants", s))}" target="_blank" rel="noopener">식당</a><a class="btn sm" href="${esc(gNear("cafe", s))}" target="_blank" rel="noopener">카페</a></div>`).join("")}</div>` : ""}
    </section>`;
  const slotCard = ({ d, sl }) => { const pi = d === day ? planned(sl) : null;
    return `<section class="card slot" style="--city:${CITY_VAR[sl.city]}"><div class="slot-h">${f !== "day" ? `<span class="pill p-city">Day ${d.n} · ${mdShort(d.date)}</span>` : ""}<b>${MEAL[sl.meal]}</b><span class="small muted">${esc(sl.city)}</span></div>
      ${pi?.pl ? `<p class="small" style="margin:0 0 6px">일정상 장소: <b>${esc(pi.pl)}</b></p>` : ""}
      <p class="small muted" style="margin:0 0 6px">${esc(sl.ctx)}</p>
      ${sl.o.map(o => `<div class="opt ${o.status === "chosen" ? "chosen" : ""}"><div class="hd"><b>${esc(o.n)}</b>${pill(RES[o.r][0], RES[o.r][1])}</div>
        <div class="meta">${esc(o.h)}${o.chk ? " · 영업시간 재확인 필요" : ""}</div><div class="small">${esc(o.no)}</div>
        <div class="acts"><button class="btn sm ${o.status === "chosen" ? "primary" : ""}" data-pick="${sl.sid}:${o.id}" aria-pressed="${o.status === "chosen"}">${o.status === "chosen" ? "선택됨" : "여기로 정하기"}</button><button class="btn sm" data-dine="${sl.sid}:${o.id}">${SVG.map}지도</button><a class="btn sm" href="${esc(gNavUrl(o))}" target="_blank" rel="noopener">${SVG.nav}길찾기</a></div></div>`).join("")}</section>`; };
  return `<div class="sec-h"><h2>${f === "day" ? `Day ${day.n} 식당` : f === "open" ? "아직 안 고른 끼니" : "전체 식당 후보"}</h2><span>전체 ${slots.length}끼 중 ${picked}끼 결정</span></div>
    <div class="chips" role="group" aria-label="보기">${[["day", `Day ${day.n} · ${mdShort(day.date)}`], ["open", "아직 안 고른 끼니"], ["all", "전체 일정"]].map(([k, l]) => `<button class="chip" data-dinef="${k}" aria-pressed="${f === k}">${l}</button>`).join("")}</div>
    ${f === "day" && list.length ? `<div class="mapcard" style="height:240px;min-height:0"><div id="map-slot" style="position:absolute;inset:0"></div></div>` : ""}
    <div class="stack" style="margin-top:12px">${list.length ? list.map(slotCard).join("") : `<div class="empty">${f === "day" ? `Day ${day.n}에는 미리 골라 둔 식당 후보가 없습니다.<br>아래에서 주변 식당을 찾아보세요.` : "조건에 맞는 끼니가 없습니다."}</div>`}</div>
    ${more}`;
}

/* ── 메모 ── */
function memoComposer(m) {
  const d = m ? days().find(x => x.id === m.day_id) : selDay();
  const di = d ? days().indexOf(d) : (S.sel ?? 0);
  const items = days()[di]?.items || [];
  return `<form class="composer card" id="memo-form" style="margin:0 16px" data-id="${m?.id ?? ""}">
    <div class="field"><label for="memo-body">${m ? "메모 수정" : "새 메모"}</label><textarea id="memo-body" maxlength="4000" placeholder="예: 생트샤펠 보안검색 줄 20분, 13:05 도착하면 여유 있음">${esc(m?.body || "")}</textarea></div>
    <div class="row"><div class="field"><label for="memo-day">날짜</label><select id="memo-day">${days().map((x, i) => `<option value="${i}" ${i === di ? "selected" : ""}>Day ${x.n} · ${mdShort(x.date)} ${x.city}</option>`).join("")}</select></div>
      <div class="field"><label for="memo-item">연결할 일정 (선택)</label><select id="memo-item"><option value="">날짜 전체</option>${items.map(it => `<option value="${it.id}" ${m?.item_id === it.id ? "selected" : ""}>${hm(it.s, it.tz)} ${esc(it.ti)}</option>`).join("")}</select></div></div>
    <div class="row"><label class="check"><input type="checkbox" id="memo-pin" ${m?.pinned ? "checked" : ""}>위에 고정</label><span style="flex:1"></span>${m ? `<button type="button" class="btn sm" data-memo-cancel>취소</button>` : ""}<button class="btn primary sm" type="submit">${m ? "수정 저장" : "메모 추가"}</button></div>
  </form>`;
}
function memoCard(m) {
  const d = days().find(x => x.id === m.day_id); const it = d?.items?.find(x => x.id === m.item_id);
  const when = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: d?.tz || "Asia/Seoul" }).format(new Date((m.updated || m.created) * 1000));
  return `<article class="card memo ${m.pinned ? "pinned" : ""}" style="margin:0 16px"><div class="bd">${esc(m.body)}</div>
    <div class="ft">${m.pinned ? pill("고정", "p-city") : ""}${d ? `<button class="pill p-mute" data-day="${days().indexOf(d)}" style="border:0">Day ${d.n}${it ? " · " + esc(it.ti) : ""}</button>` : ""}<span>${esc(who(m.author))} · ${when}</span><span class="sp"></span>
      <button class="btn sm ghost" data-memo-edit="${m.id}">수정</button><button class="btn sm ghost" data-memo-del="${m.id}" style="color:var(--crit)">삭제</button></div></article>`;
}
function viewMemo() {
  const day = selDay(); setCity(day); const ms = D().memos || []; const f = S.memoFilter;
  const list = f === "day" ? ms.filter(m => m.day_id === day.id) : ms;
  const editing = S.editingMemo != null ? ms.find(m => m.id === S.editingMemo) : null;
  return `<div class="sec-h"><h2>메모</h2><span>${ms.length}개 · 두 분이 함께 봅니다</span></div>
    ${memoComposer(editing)}
    <div style="height:12px"></div>
    <div class="chips"><button class="chip" data-memof="all" aria-pressed="${f === "all"}">전체</button><button class="chip" data-memof="day" aria-pressed="${f === "day"}">Day ${day.n}만</button></div>
    <div class="stack" style="margin-top:12px">${list.length ? list.map(memoCard).join("") : `<div class="empty">아직 메모가 없습니다. 위에서 첫 메모를 남겨 보세요.<br>일정 화면에서 장소를 눌러도 그 장소에 바로 메모할 수 있습니다.</div>`}</div>`;
}

/* ── 정보: 예약·할 일·가이드 ── */
function viewInfo() {
  setCity(selDay());
  const seg = `<div class="seg-ctl" role="group">${[["book", "예약"], ["todo", "할 일"], ["guide", "현지 가이드"]].map(([k, l]) => `<button data-info="${k}" aria-pressed="${S.infoTab === k}">${l}</button>`).join("")}</div>`;
  return seg + (S.infoTab === "todo" ? infoTodo() : S.infoTab === "guide" ? infoGuide() : infoBook());
}
function kv(b) {
  const r = [];
  if (b.conf) r.push(["예약번호", b.conf, 1]);
  (b.seats || []).forEach(s => r.push([`좌석 ${s.who.startsWith("JAEKYUNG") ? "재경" : "유나"}`, s.seat, 0]));
  (b.attrs?.ticket_nos || []).forEach((n, i) => r.push([`티켓 ${i + 1}`, n, 1]));
  if (b.attrs?.slot) r.push(["입장", b.attrs.slot, 0]);
  if (b.price != null) r.push(["금액", `${Number(b.price).toLocaleString("ko-KR")} ${b.cur || ""}${b.basis === "per_person" ? " / 1인" : ""}`, 0]);
  return (r.length ? `<dl class="kv">${r.map(([k, v, c]) => `<dt>${k}</dt><dd>${esc(v)}</dd>${c ? `<button class="copy" data-copy="${esc(v)}">복사</button>` : "<span></span>"}`).join("")}</dl>` : "")
    + (b.note ? `<p class="small muted" style="margin:8px 0 0">${esc(b.note)}</p>` : "")
    + (b.url ? `<div style="margin-top:10px"><a class="btn sm" href="${esc(b.url)}" target="_blank" rel="noopener">${b.status === "to_book" ? "예약하러 가기" : "예약 페이지 열기"}</a></div>` : "");
}
const bCard = b => `<section class="card" style="margin:0 16px"><div style="display:flex;gap:8px;align-items:flex-start"><b style="flex:1">${esc(b.title)}</b>${pill(BSTAT[b.status][0], BSTAT[b.status][1])}</div>${b.provider ? `<div class="small muted">${esc(b.provider)}</div>` : ""}${kv(b)}</section>`;
function infoBook() {
  const bs = D().bookings || []; const act = bs.filter(b => b.status !== "cancelled"); const c = k => act.filter(b => b.status === k).length;
  const segs = bs.filter(b => b.seg && b.status !== "cancelled").sort((a, b) => a.seg.dep - b.seg.dep);
  const pend = act.filter(b => b.status !== "confirmed"); const rest = act.filter(b => !b.seg && b.type !== "hotel" && b.status === "confirmed");
  const st = D().trip?.start, en = D().trip?.end, DAY = 86400000, tot = (Date.parse(en) - Date.parse(st)) / DAY + 1;
  const stays = (D().stays || []).filter(s => s.status !== "cancelled");
  return `<section class="card" style="margin:14px 16px 0"><div class="statbar">${[["confirmed", "var(--ok)"], ["unknown", "var(--warn)"], ["to_book", "var(--crit)"]].map(([k, col]) => `<i style="width:${c(k) / act.length * 100}%;background:${col}"></i>`).join("")}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${pill("확정 " + c("confirmed"), "p-ok")}${pill("확인 필요 " + c("unknown"), "p-warn")}${pill("예약 필요 " + c("to_book"), "p-crit")}</div></section>
    ${pend.length ? `<div class="sec-h"><h2>처리할 예약</h2><span>${pend.length}건</span></div><div class="stack">${pend.map(bCard).join("")}</div>` : ""}
    <div class="sec-h"><h2>이동</h2></div><div class="stack">${segs.map(b => { const s = b.seg; return `<section class="card" style="margin:0 16px"><div style="display:flex;gap:8px"><b style="flex:1">${esc(s.no)} · ${esc(s.carrier)}</b>${pill(BSTAT[b.status][0], BSTAT[b.status][1])}</div>
      <div class="small muted">${mdShort(ymd(s.dep, s.ftz))}</div>
      <div class="leg" style="margin-top:8px"><div class="end"><b>${hm(s.dep, s.ftz)}</b><small>${esc(s.from)}</small></div><div class="mid">${SVG.plane}${dur(s.arr - s.dep)}</div><div class="end r"><b>${hm(s.arr, s.ttz)}${ymd(s.arr, s.ttz) !== ymd(s.dep, s.ftz) ? "<sup>+1</sup>" : ""}</b><small>${esc(s.to)}</small></div></div>${kv(b)}</section>`; }).join("")}</div>
    <div class="sec-h"><h2>숙소</h2></div>
    <section class="card" style="margin:0 16px"><div class="gantt">${stays.map(s => { const a = (Date.parse(s.in) - Date.parse(st)) / DAY, w = (Date.parse(s.out) - Date.parse(s.in)) / DAY; return `<span class="nm">${esc(s.place)}</span><div class="track" style="--c:${CITY_VAR[s.city]}"><i style="left:${(a + .5) / tot * 100}%;width:${w / tot * 100}%"></i></div>`; }).join("")}</div>
      <div class="stack" style="margin-top:12px">${stays.map(s => `<div style="display:flex;gap:10px;align-items:center"><div style="flex:1;min-width:0"><b>${esc(s.place)}</b> ${pill(BSTAT[s.status || "unknown"][0], BSTAT[s.status || "unknown"][1])}<div class="small muted">${mdShort(s.in)} – ${mdShort(s.out)} · ${(Date.parse(s.out) - Date.parse(s.in)) / DAY}박${s.addr ? " · " + esc(s.addr) : ""}</div></div><a class="btn sm" href="${esc(gNavUrl({ ...s, pl: s.place, pll: s.local, a: s.addr }))}" target="_blank" rel="noopener">${SVG.nav}</a></div>`).join("")}</div></section>
    <div class="sec-h"><h2>입장권·투어</h2></div><div class="stack">${rest.map(bCard).join("")}</div>`;
}
function infoTodo() {
  const ts = [...(D().todos || [])].sort((a, b) => (a.done - b.done) || ((a.due || 9e12) - (b.due || 9e12)));
  const done = ts.filter(t => t.done).length;
  return `<div class="sec-h"><h2>할 일</h2><span>${done}/${ts.length} 완료</span></div><section class="card" style="margin:0 16px">${ts.map(td => `<div class="todo ${td.done ? "done" : ""}"><input type="checkbox" id="td-${td.id}" data-todo="${td.id}" ${td.done ? "checked" : ""}><label for="td-${td.id}"><span class="tt">${esc(td.title)}</span>${td.due ? ` <span class="small muted">~${new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(td.due * 1000))}</span>` : ""}${td.note ? `<div class="small muted">${esc(td.note)}</div>` : ""}</label></div>`).join("")}</section>`;
}
function infoGuide() {
  const g = D().guide || {}; const day = selDay(); const lang = day.city === "파리" ? "fr" : "it";
  const order = [day.city, ...["파리", "피렌체", "로마"].filter(c => c !== day.city)];
  return `<div class="sec-h"><h2>보여주는 문장</h2><span>${lang === "fr" ? "프랑스어" : "이탈리아어"}</span></div>
    <div class="stack pad">${(g.phrases || []).map((p, i) => `<button class="phr" data-phrase="${i}"><b>${esc(p[lang])}</b><span>${esc(p.ko)}</span></button>`).join("")}</div>
    <div class="sec-h"><h2>긴급 연락처</h2></div><section class="card" style="margin:0 16px">${(g.emergency || []).map(e => `<div class="em"><b class="small">${esc(e.label)}</b>${e.link ? `<a class="btn sm" href="${esc(e.link)}" target="_blank" rel="noopener">열기</a>` : `<button class="copy" data-copy="${esc(e.value)}">복사</button>`}<span class="v">${esc(e.value)}</span><span class="n">${esc(e.note)}</span></div>`).join("")}</section>
    <div class="sec-h"><h2>교통</h2></div><div class="stack">${[...(g.transport || [])].sort((a, b) => order.indexOf(a.city) - order.indexOf(b.city)).map(tr => `<section class="card" style="margin:0 16px;--city:${CITY_VAR[tr.city]}"><div style="display:flex;gap:8px"><b style="flex:1">${esc(tr.title)}</b>${pill(tr.city, "p-city")}</div><ul class="lines">${tr.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>${tr.src ? `<a class="small muted" href="${esc(tr.src)}" target="_blank" rel="noopener">출처</a>` : ""}</section>`).join("")}</div>
    <div class="sec-h"><h2>소매치기 주의</h2></div><section class="card" style="margin:0 16px">${(g.pickpocket || []).map(p => `<div class="em"><b class="small">${esc(p.where)}</b><span></span><span class="n" style="color:var(--ink)">${esc(p.tip)}</span></div>`).join("")}</section>
    <div class="sec-h"><h2>확인한 현지 정보</h2></div><div class="stack">${(D().info || []).map(x => `<section class="card" style="margin:0 16px"><b>${esc(x.title)}</b><p class="small" style="margin:4px 0 0">${esc(x.body)}</p>${x.src ? `<a class="small muted" href="${esc(x.src)}" target="_blank" rel="noopener">출처</a>` : ""}</section>`).join("")}</div>
    <p class="foot">확인일 ${esc(g.verified_on || "")}. 요금과 운영시간은 바뀔 수 있으니 현장 안내를 우선하세요.</p>`;
}

/* ── 바닥 시트 ── */
let scrim, sheet;
function ensureSheet() { if (sheet) return; scrim = document.createElement("div"); scrim.className = "scrim"; scrim.hidden = true; sheet = document.createElement("div"); sheet.className = "sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.hidden = true; document.body.append(scrim, sheet); scrim.addEventListener("click", closeSheet); }
function showSheet(html) { ensureSheet(); sheet.innerHTML = `<div class="grab"></div>` + html; scrim.hidden = sheet.hidden = false; requestAnimationFrame(() => { scrim.classList.add("on"); sheet.classList.add("on"); }); sheet.scrollTop = 0; }
function closeSheet() { if (!sheet || sheet.hidden) return; scrim.classList.remove("on"); sheet.classList.remove("on"); setTimeout(() => { scrim.hidden = sheet.hidden = true; sheet.innerHTML = ""; }, 260); S.sheet = null; }
function openItem(id) {
  const it = allItems().find(x => x.id === id); if (!it) return; S.sheet = { type: "item", id };
  const bks = (it.b || []).map(booking).filter(Boolean); const tg = itemTags(it); const ms = memosFor(it); S.curGuide = guideFor(it);
  if (markerById[id] && map) markerById[id].openTooltip?.();
  showSheet(`<h3>${esc(it.ti)}</h3><div class="sub">${mdShort(it.day.date)} ${hm(it.s, it.tz)}${it.e ? "–" + hm(it.e, it.etz || it.tz) : ""}${it.pl && it.pl !== it.ti ? " · " + esc(it.pl) : ""}</div>
    ${it.pl || it.lat != null ? `<div class="gmap"><iframe src="${esc(gEmbedPlace(it))}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="구글 지도: ${esc(it.pl || it.ti)}"></iframe></div>
    <div class="acts"><a class="btn primary" href="${esc(gNavUrl(it))}" target="_blank" rel="noopener">${SVG.nav}길찾기</a><a class="btn" href="${esc(gPlaceUrl(it))}" target="_blank" rel="noopener">${SVG.map}구글 지도 앱</a></div>` : ""}
    ${it.t === "meal" && (it.day.dining || []).some(sl => sl.meal === mealOf(it)) ? `<div class="block"><button class="btn block" data-goto="dine" data-gday="${days().indexOf(it.day)}">다른 식당 후보 보기</button></div>` : ""}
    <div class="block"><div class="seg-ctl st-ctl" role="group" aria-label="일정 상태">${[["planned", "예정"], ["done", "완료"], ["skipped", "건너뜀"]].map(([k, l]) => `<button data-st="${it.id}:${k}" aria-pressed="${(it.st || "planned") === k}">${l}</button>`).join("")}</div></div>
    ${it.no ? `<div class="block"><div class="note">${esc(it.no)}</div></div>` : ""}
    ${guideHTML(S.curGuide)}
    ${bks.length ? `<div class="block"><h4>예약</h4>${bks.map(b => `<div class="card" style="box-shadow:none;background:var(--sunk);padding:12px"><div style="display:flex;gap:8px"><b style="flex:1">${esc(b.title)}</b>${pill(BSTAT[b.status][0], BSTAT[b.status][1])}</div>${kv(b)}</div>`).join("")}</div>` : ""}
    ${tg.length ? `<div class="block"><h4>알아둘 것</h4>${tg.map(x => x.k === "pick" ? `<div class="small">사람이 많은 곳입니다. 가방은 앞으로 메고 휴대폰은 안쪽 주머니에 두세요.</div>` : x.k === "rain" ? `<div class="small"><b>비가 오면</b> ${esc(x.alt)}</div>` : `<div class="small"><b>${esc(x.x.title)}</b> <span class="muted">${esc(x.x.body)}</span></div>`).join("")}</div>` : ""}
    <div class="block"><h4>메모 ${ms.length ? ms.length + "개" : ""}</h4>${ms.map(m => `<div class="note" style="display:flex;gap:8px;align-items:flex-start"><span style="flex:1;white-space:pre-wrap">${esc(m.body)}<br><span class="small muted">${esc(who(m.author))}</span></span><button class="btn sm ghost" data-memo-edit="${m.id}">수정</button></div>`).join("")}
      <form id="quick-memo" data-qitem="${it.id}" data-dayid="${it.day.id}" style="display:flex;gap:8px"><label class="sr" for="qm">이 일정에 메모</label><input id="qm" class="field" style="flex:1;border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--paper)" placeholder="이 일정에 메모 남기기" maxlength="4000"><button class="btn primary" type="submit">추가</button></form></div>`);
}
const guideFor = it => (D().guides || {})[it.pid != null ? "p" + it.pid : ""] || (D().guides || {})["i" + it.id];
function guideHTML(g) {
  if (!g) return "";
  const li = a => (a || []).map(x => `<li>${esc(x)}</li>`).join("");
  const imgs = g.images || [];
  const gallery = imgs.length ? `<div class="g-gal" role="list">${imgs.map((m, i) => `<figure role="listitem"><button type="button" class="g-img" data-gimg="${i}" aria-label="사진 크게 보기: ${esc(m.c)}"><img src="${esc(m.u)}" alt="${esc(m.c)}" loading="lazy" decoding="async"${m.w && m.h ? ` width="${m.w}" height="${m.h}"` : ""}></button><figcaption>${esc(m.c)}<span class="cr">사진 ${esc(m.by || "Wikimedia Commons")} · ${esc(m.lic || "")}</span></figcaption></figure>`).join("")}</div>` : "";
  const story = (g.story || "").split(/\n\s*\n/).filter(Boolean).map(p => `<p class="story">${esc(p)}</p>`).join("");
  const sec = (k, t, body, open) => body ? `<details class="g-sec g-${k}"${open ? " open" : ""}><summary>${t}</summary>${body}</details>` : "";
  const look = g.look?.length ? `<dl class="g-look">${g.look.map(x => `<dt>${esc(x.t)}</dt><dd>${esc(x.d)}</dd>`).join("")}</dl>` : "";
  const tl = g.timeline?.length ? `<ol class="g-tl">${g.timeline.map(x => `<li><b>${esc(x.y)}</b><span>${esc(x.t)}</span></li>`).join("")}</ol>` : "";
  return `<article class="guide" data-guide>${gallery}<span class="kicker">가이드북</span><p class="lead">${esc(g.lead)}</p>
    ${story}
    ${g.points?.length ? `<h4>꼭 볼 것</h4><ul>${li(g.points)}</ul>` : ""}
    ${sec("look", "놓치기 쉬운 디테일", look, true)}
    ${sec("hidden", "알고 보면 더 재미있는 이야기", g.hidden?.length ? `<ul>${li(g.hidden)}</ul>` : "", true)}
    ${sec("tl", "연표", tl, false)}
    ${g.now?.length ? `<div class="g-now"><h4>요즘 이야기</h4><ul>${li(g.now)}</ul></div>` : ""}
    ${g.couple?.length ? `<div class="g-couple"><h4>두 사람을 위한 팁</h4><ul>${li(g.couple)}</ul></div>` : ""}
    ${g.tips?.length ? `<h4>알아두면 좋은 것</h4><ul class="tips">${li(g.tips)}</ul>` : ""}
    ${g.links?.length ? `<div class="links">${g.links.map(l => `<a class="btn sm" href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.t)}</a>`).join("")}</div>` : ""}
    ${g.v ? `<p class="small muted" style="margin:10px 0 0">정리 ${esc(g.v)} · 운영시간·요금은 현장 안내 우선${imgs.length ? " · 사진: 위키미디어 공용(사진을 누르면 출처)" : ""}</p>` : ""}</article>`;
}
function openGuideImg(g, i) {
  const m = g?.images?.[i]; if (!m) return;
  const o = document.createElement("div"); o.className = "overlay g-view"; o.setAttribute("role", "dialog"); o.setAttribute("aria-label", m.c);
  o.innerHTML = `<img src="${esc(m.u)}" alt="${esc(m.c)}"><div class="alt">${esc(m.c)}</div><div class="small" style="color:var(--mute)">사진 ${esc(m.by || "")} · ${esc(m.lic || "")} · <a href="${esc(m.src)}" target="_blank" rel="noopener">원본·라이선스</a></div><button class="btn primary" style="align-self:flex-start">닫기</button>`;
  o.onclick = ev => { if (!ev.target.closest("a")) o.remove(); }; document.body.appendChild(o);
}
function openDine(sid, oid) {
  let sl, d; days().forEach(x => (x.dining || []).forEach(s => { if (s.sid === sid) { sl = s; d = x; } })); const o = sl?.o.find(x => x.id === oid); if (!o) return;
  S.curGuide = o.pid != null ? (D().guides || {})["p" + o.pid] : null;
  showSheet(`<h3>${esc(o.n)}</h3><div class="sub">Day ${d.n} ${MEAL[sl.meal]} · ${esc(o.a || "")}</div>
    <div class="gmap"><iframe src="${esc(gEmbedPlace(o))}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="구글 지도: ${esc(o.n)}"></iframe></div>
    <div class="acts"><a class="btn primary" href="${esc(gNavUrl(o))}" target="_blank" rel="noopener">${SVG.nav}길찾기</a><a class="btn" href="${esc(gPlaceUrl(o))}" target="_blank" rel="noopener">${SVG.map}구글 지도 앱</a></div>
    <div class="block"><div style="display:flex;gap:6px;flex-wrap:wrap">${pill(RES[o.r][0], RES[o.r][1])}${o.status === "chosen" ? pill("이 끼니로 선택됨", "p-city") : ""}</div><div class="small">${esc(o.h)}</div><div class="small muted">${esc(o.no)}</div>
      <button class="btn ${o.status === "chosen" ? "" : "primary"} block" data-pick="${sl.sid}:${o.id}">${o.status === "chosen" ? "선택 취소" : "이 식당으로 정하기"}</button></div>
    ${guideHTML(S.curGuide)}`);
}

/* ── 렌더 ── */
function tabbar() {
  const tabs = [["today", "오늘", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'], ["plan", "일정", '<path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'], ["dine", "식당", '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v6M9 3v6M17 21V3c-2 1-3 4-3 7s1 3 3 3"/>'], ["memo", "메모", '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'], ["info", "예약·정보", '<path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/>']];
  return `<nav class="tabs" aria-label="메뉴"><div class="in">${tabs.map(([k, l, p]) => `<button data-tab="${k}" aria-selected="${S.tab === k}"><svg viewBox="0 0 24 24">${p}</svg>${l}</button>`).join("")}</div></nav>`;
}
function render() {
  const app = $("#app");
  if (S.source === "login") { renderLogin(); return; }
  if (S.source === "denied") { app.innerHTML = `<div class="login"><h1>접근 권한이 없습니다<span>이 계정은 여행 앱에 등록되어 있지 않습니다. 청첩장 명단 앱의 공동 관리자 계정으로 로그인해 주세요.</span></h1><button class="btn" data-logout>다른 계정으로 로그인</button></div>`; return; }
  if (!S.data) { app.innerHTML = S.source === "error" ? `<div class="login"><h1>일정을 불러오지 못했습니다<span>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</span></h1><button class="btn primary" data-reload>다시 시도</button></div>` : `<div class="boot"><div class="boot-mark">✈︎</div><p>일정을 불러오는 중</p></div>`; return; }
  if (S.sel == null) { const ci = curDayIdx(); S.sel = ci < 0 ? 0 : Math.min(ci, days().length - 1); }
  setCity(selDay());
  const body = { today: viewToday, plan: viewPlan, dine: viewDine, memo: viewMemo, info: viewInfo }[S.tab]();
  const synced = S.data.synced_at ? new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(S.data.synced_at * 1000)) : "";
  const sy = window.scrollY;
  app.innerHTML = header() + `<main>${S.source === "cache" ? `<div class="offline">오프라인 저장본을 보여드리고 있습니다. 연결되면 자동으로 새로 불러옵니다.</div>` : ""}${body}
    <div class="foot"><span>서울 기준 ${esc(synced)}에 불러온 일정</span><button class="btn sm" data-reload>${SVG.refresh}새로고침</button><button class="btn sm ghost" data-logout>로그아웃</button></div></main>` + tabbar();
  window.scrollTo(0, sy);
  const cur = app.querySelector('.day[aria-current="true"]'); cur?.scrollIntoView({ inline: "center", block: "nearest" });
  mountMap(); saveUI();
}
function renderLogin(msg) {
  $("#app").innerHTML = `<form class="login" id="login-form">
    <svg class="route-art" viewBox="0 0 320 70" aria-hidden="true"><path d="M16 50 C 80 10, 120 64, 170 30 S 260 14, 304 40" fill="none" stroke="var(--line)" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/><circle cx="16" cy="50" r="8" fill="var(--paris)"/><circle cx="170" cy="30" r="8" fill="var(--florence)"/><circle cx="304" cy="40" r="8" fill="var(--rome)"/></svg>
    <h1>파리 · 피렌체 · 로마<span>10월 26일부터 11월 7일까지, 두 사람의 13일</span></h1>
    <div class="field"><label for="em">이메일</label><input id="em" type="email" autocomplete="username" required inputmode="email"></div>
    <div class="field"><label for="pw">비밀번호</label><input id="pw" type="password" autocomplete="current-password" required minlength="6"></div>
    <div class="err" id="login-err">${esc(msg || "")}</div>
    <button class="btn primary block" type="submit">로그인</button>
    <p class="hint">청첩장 명단 앱과 같은 계정으로 로그인합니다. 등록된 두 계정만 일정을 볼 수 있습니다.</p></form>`;
}
let toastTimer;
function toast(msg, action) { $(".toast")?.remove(); clearTimeout(toastTimer); const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.innerHTML = `<span>${esc(msg)}</span>`; if (action) { const b = document.createElement("button"); b.textContent = action.label; b.onclick = () => { t.remove(); action.fn(); }; t.appendChild(b); } document.body.appendChild(t); toastTimer = setTimeout(() => t.remove(), action ? 5000 : 2200); }

/* ── 쓰기 ── */
async function savePick(sid, oid) {
  let sl; days().forEach(x => (x.dining || []).forEach(s => { if (s.sid === sid) sl = s; }));
  const prev = sl.o.map(o => o.status); const was = sl.o.find(o => o.id === oid)?.status === "chosen"; const target = was ? null : oid;
  sl.o.forEach(o => { if (o.status === "chosen") o.status = "candidate"; if (o.id === target) o.status = "chosen"; }); closeSheet(); render();
  try { await rpc("trip_dining_pick", { p_slot_id: sid, p_option_id: target }); ls.set(CACHE_KEY, S.data); toast(target ? "식당을 정했습니다" : "선택을 취소했습니다"); }
  catch (e) { sl.o.forEach((o, i) => o.status = prev[i]); render(); toast("저장하지 못했습니다. 연결을 확인해 주세요"); }
}
async function saveCheck(dayId, infoId, done) {
  const D0 = D(); D0.checks = (D0.checks || []).filter(c => !(c.day === dayId && c.info === infoId));
  if (done) D0.checks.push({ day: dayId, info: infoId }); ls.set(CACHE_KEY, S.data); render();
  try { await rpc("trip_day_check", { p_day_id: dayId, p_info_id: infoId, p_done: done }); }
  catch (e) { toast("저장하지 못했습니다. 연결을 확인해 주세요"); load(true); }
}
async function saveStatus(id, st, reopen = true) {
  const it = allItems().find(x => x.id === id); if (!it || it.st === st) return; const prev = it.st || "planned";
  const raw = days().flatMap(d => d.items || []).find(x => x.id === id); raw.st = st; ls.set(CACHE_KEY, S.data); render(); if (reopen) openItem(id);
  toast(st === "done" ? (reopen ? "완료로 표시했습니다" : "방문 완료로 표시했습니다")  : st === "skipped" ? "건너뜀으로 표시했습니다. 길찾기 동선에서 빠집니다" : "예정으로 되돌렸습니다");
  try { await rpc("trip_item_status", { p_id: id, p_status: st }); }
  catch (e) { raw.st = prev; ls.set(CACHE_KEY, S.data); render(); if (reopen && S.sheet?.id === id) openItem(id); toast("저장하지 못했습니다. 연결을 확인해 주세요"); }
}
async function saveTodo(id, done) {
  const td = D().todos.find(t => t.id === id); const prev = td.done; td.done = done; render();
  try { await rpc("trip_todo_set", { p_id: id, p_done: done }); ls.set(CACHE_KEY, S.data); } catch (e) { td.done = prev; render(); toast("저장하지 못했습니다"); }
}
async function saveMemo({ id, body, dayId, itemId, pinned }) {
  if (!body.trim()) { toast("메모 내용을 입력해 주세요"); return false; }
  try { const m = await rpc("trip_memo_save", { p_id: id || null, p_body: body, p_day_id: dayId, p_item_id: itemId || null, p_pinned: !!pinned });
    const ms = D().memos; const i = ms.findIndex(x => x.id === m.id); if (i >= 0) ms[i] = m; else ms.unshift(m);
    ms.sort((a, b) => (b.pinned - a.pinned) || (b.updated - a.updated)); ls.set(CACHE_KEY, S.data); toast(id ? "메모를 수정했습니다" : "메모를 추가했습니다"); return true; }
  catch (e) { toast("메모를 저장하지 못했습니다. 연결을 확인해 주세요"); return false; }
}
async function removeMemo(id) {
  const ms = D().memos; const i = ms.findIndex(x => x.id === id); if (i < 0) return; const [m] = ms.splice(i, 1); render();
  try { await rpc("trip_memo_remove", { p_id: id }); ls.set(CACHE_KEY, S.data);
    toast("메모를 삭제했습니다", { label: "되돌리기", fn: async () => { try { await rpc("trip_memo_restore", { p_id: id }); ms.splice(Math.min(i, ms.length), 0, m); ls.set(CACHE_KEY, S.data); render(); toast("메모를 되살렸습니다"); } catch (e) { toast("되돌리지 못했습니다"); } } }); }
  catch (e) { ms.splice(i, 0, m); render(); toast("삭제하지 못했습니다"); }
}

/* 내 위치 주변 식당 (위치 권한이 없으면 구글 지도가 현재 위치 기준으로 검색) */
function openNearMe() {
  const fallback = () => window.open("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("restaurants near me"), "_blank", "noopener");
  if (!navigator.geolocation) { fallback(); return; }
  const w = window.open("about:blank", "_blank"); toast("현재 위치를 확인하는 중입니다");
  navigator.geolocation.getCurrentPosition(p => { const u = `https://www.google.com/maps/search/restaurants/@${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)},17z`; if (w) w.location.href = u; else window.open(u, "_blank", "noopener"); },
    () => { const u = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("restaurants near me"); if (w) w.location.href = u; else fallback(); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 });
}

/* ── 이벤트 ── */
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-tab],[data-day],[data-item],[data-step],[data-dinef],[data-pick],[data-dine],[data-copy],[data-goto],[data-phrase],[data-info],[data-travel],[data-memof],[data-memo-edit],[data-memo-del],[data-memo-cancel],[data-reload],[data-logout],[data-sim-open],[data-sim-off],[data-st],[data-gimg],[data-hst],[data-near-me]");
  if (!el) return;
  const ds = el.dataset;
  if (ds.tab) { S.tab = ds.tab; if (ds.tab === "today" && phase() === "during" && !S.sim) S.sel = curDayIdx(); closeSheet(); render(); window.scrollTo(0, 0); return; }
  if (ds.goto) { if (ds.gday != null) S.sel = +ds.gday; else if (S.tab === "today" && phase() === "during") S.sel = curDayIdx(); S.tab = ds.goto; if (ds.goto === "dine") S.dineFilter = "day"; closeSheet(); render(); window.scrollTo(0, 0); return; }
  if (ds.day != null) { S.sel = +ds.day; if (S.tab === "today" && phase() === "during" && !S.sim) S.tab = "plan"; closeSheet(); render(); return; }
  if (ds.step) { S.sel = Math.min(days().length - 1, Math.max(0, S.sel + +ds.step)); render(); window.scrollTo(0, 0); return; }
  if (ds.hst) { const [i, st] = ds.hst.split(":"); saveStatus(+i, st, false); return; }
  if (ds.nearMe != null) { openNearMe(); return; }
  if (ds.st) { const [i, st] = ds.st.split(":"); saveStatus(+i, st); return; }
  if (ds.gimg != null) { openGuideImg(S.curGuide, +ds.gimg); return; }
  if (ds.item) { openItem(+ds.item); return; }
  if (ds.dinef) { S.dineFilter = ds.dinef; render(); return; }
  if (ds.dine) { const [a, b] = ds.dine.split(":").map(Number); openDine(a, b); return; }
  if (ds.pick) { const [a, b] = ds.pick.split(":").map(Number); savePick(a, b); return; }
  if (ds.info) { S.infoTab = ds.info; render(); return; }
  if (ds.memof) { S.memoFilter = ds.memof; render(); return; }
  if (ds.travel != null) { S.travelMode = S.travelMode === "walking" ? "transit" : "walking"; render(); return; }
  if (ds.memoEdit) { S.editingMemo = +ds.memoEdit; S.tab = "memo"; closeSheet(); render(); window.scrollTo(0, 0); $("#memo-body")?.focus(); return; }
  if (ds.memoDel) { removeMemo(+ds.memoDel); return; }
  if (ds.memoCancel != null) { S.editingMemo = null; render(); return; }
  if (ds.copy != null) { try { await navigator.clipboard.writeText(ds.copy); toast("복사했습니다"); } catch (err) { toast(ds.copy); } return; }
  if (ds.phrase != null) { const lang = selDay().city === "파리" ? "fr" : "it"; const p = D().guide.phrases[+ds.phrase]; const o = document.createElement("div"); o.className = "overlay"; o.setAttribute("role", "dialog"); o.innerHTML = `<div class="big">${esc(p[lang])}</div><div class="alt">${esc(p.ko)}</div><button class="btn primary" style="align-self:flex-start">닫기</button>`; o.onclick = () => o.remove(); document.body.appendChild(o); return; }
  if (ds.reload != null) { await load(false); return; }
  if (ds.logout != null) { try { await initSb()?.auth.signOut(); } catch (err) {} S.data = null; S.source = "login"; try { localStorage.removeItem(CACHE_KEY); } catch (err) {} render(); return; }
  if (ds.simOpen != null) { const i = 3; const d = days()[i]; S.sim = midnight(d.date, d.tz) + 14 * 3600; S.sel = i; render(); toast("Day 4 오후 2시로 미리보기 중입니다"); return; }
  if (ds.simOff != null) { S.sim = null; S.sel = null; render(); return; }
});
document.addEventListener("change", e => { const el = e.target;
  if (el.dataset.todo) saveTodo(+el.dataset.todo, el.checked);
  if (el.dataset.dcheck) { const [d, i] = el.dataset.dcheck.split(":").map(Number); saveCheck(d, i, el.checked); }
  if (el.id === "memo-day") { const form = $("#memo-form"); const i = +el.value; const items = days()[i]?.items || []; $("#memo-item").innerHTML = `<option value="">날짜 전체</option>` + items.map(it => `<option value="${it.id}">${hm(it.s, it.tz)} ${esc(it.ti)}</option>`).join(""); }
});
document.addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target;
  if (f.id === "login-form") {
    const em = $("#em").value.trim(), pw = $("#pw").value; const c = initSb(); if (!c) { $("#login-err").textContent = "인터넷 연결을 확인해 주세요."; return; }
    const btn = f.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "확인 중";
    const { error } = await c.auth.signInWithPassword({ email: em, password: pw });
    if (error) { btn.disabled = false; btn.textContent = "로그인"; $("#login-err").textContent = /Invalid login/i.test(error.message) ? "이메일 또는 비밀번호가 맞지 않습니다." : "로그인하지 못했습니다: " + error.message; return; }
    S.source = ""; render(); await load(true); return;
  }
  if (f.id === "memo-form") {
    const id = f.dataset.id ? +f.dataset.id : null; const d = days()[+$("#memo-day").value]; const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
    const ok = await saveMemo({ id, body: $("#memo-body").value, dayId: d?.id, itemId: +$("#memo-item").value || null, pinned: $("#memo-pin").checked });
    btn.disabled = false; if (ok) { S.editingMemo = null; render(); } return;
  }
  if (f.id === "quick-memo") {
    const input = $("#qm"); const ok = await saveMemo({ body: input.value, dayId: +f.dataset.dayid, itemId: +f.dataset.qitem }); if (ok) { render(); openItem(+f.dataset.qitem); }
  }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSheet(); document.querySelector(".overlay")?.remove(); } });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.data && Date.now() - S.lastLoad > 60000) load(true); });
window.addEventListener("online", () => { if (S.data) load(true); });
setInterval(() => { if (!S.sim && S.data && (S.tab === "today") && !S.sheet && !document.activeElement?.closest?.("form")) render(); }, 60000);

/* ── 시작 ── */
(async () => {
  const cache = ls.get(CACHE_KEY);
  const c = initSb();
  if (!c) { if (cache) { S.data = cache; S.source = "cache"; } else S.source = "error"; render(); return; }
  const { data: { session } } = await c.auth.getSession();
  if (!session) { S.source = "login"; render(); return; }
  if (cache) { S.data = cache; S.source = "cache"; render(); }
  await load(true);
  c.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { S.data = null; S.source = "login"; render(); } });
})();
})();
