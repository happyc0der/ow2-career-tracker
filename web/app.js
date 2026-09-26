/* OW2 Career Tracker — front end (vanilla JS + Chart.js). */
"use strict";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const ORANGE = "#f99e1a", BLUE = "#3fa9ff", WIN = "#4fe3a0", LOSS = "#ff5a5f";
const ROLE_COLOR = { tank: BLUE, damage: LOSS, support: WIN };

const S = { mode: "all", role: "all", sort: "time_played", hero: null, careerMode: null, careerCat: null, data: null, charts: {} };

/* ---------------- formatting ---------------- */
const nf = new Intl.NumberFormat("en-US");
const fmtInt = v => v == null ? "—" : nf.format(Math.round(v));
const fmtNum = (v, d = 2) => v == null ? "—" : (Math.abs(v) >= 1000 ? nf.format(Math.round(v)) : (+v).toFixed(d).replace(/\.?0+$/, ""));
const fmtCompact = v => v == null ? "—" : Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const fmtPct = v => v == null ? "—" : `${(+v).toFixed(1)}%`;
function fmtDur(sec, long = false) {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (long) return h ? `${h}h ${m}m` : `${m}m`;
  return h >= 1 ? `${h}<small>h</small> ${m}<small>m</small>` : `${m}<small>m</small>`;
}
const fmtDate = ts => new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = ts => new Date(ts * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const cap = s => (s || "").replace(/\b\w/g, c => c.toUpperCase());
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function statLabel(key) {
  let k = key, suffix = "";
  const tails = [["_avg_per_10_min", "avg / 10 min"], ["_most_in_game", "most in game"], ["_most_in_life", "most in life"], ["_best_in_game", "best in game"]];
  for (const [t, s] of tails) if (k.endsWith(t)) { k = k.slice(0, -t.length); suffix = s; break; }
  const label = cap(k.replace(/_/g, " ")).replace(/\bKda\b/, "KDA");
  return suffix ? `${label} <em>(${suffix})</em>` : label;
}
function statValue(key, v) {
  if (typeof v !== "number") return esc(v);
  if (/time|duration/.test(key) && !/times/.test(key) && v >= 60) return fmtDur(v, true);
  if (/accuracy|percentage|_rate$|winrate/.test(key)) return fmtPct(v);
  return fmtNum(v);
}

/* ---------------- data ---------------- */
async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 3500);
}

/* ---------------- charts ---------------- */
Chart.defaults.font.family = "'Barlow Condensed', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = "#8d9bb8";
Chart.defaults.borderColor = "rgba(255,255,255,0.06)";

function gradient(ctx, color) {
  const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.clientHeight || 200);
  g.addColorStop(0, color + "55"); g.addColorStop(1, color + "00"); return g;
}
function timeAxis(points) {
  const xs = points.map(p => p.x);
  const span = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const pad = span ? 0 : 12 * 3600 * 1000;
  return {
    type: "linear", min: xs.length ? Math.min(...xs) - pad : undefined, max: xs.length ? Math.max(...xs) + pad : undefined,
    grid: { display: false },
    ticks: {
      maxTicksLimit: 5, maxRotation: 0,
      callback: v => { const d = new Date(v); return span && span < 2 * 86400000 ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); },
    },
  };
}
function lineChart(canvas, datasets, { yFmt = v => v, y2Fmt = null, height } = {}) {
  const ctx = canvas.getContext("2d");
  const all = datasets.flatMap(d => d.data);
  const cfg = {
    type: "line",
    data: {
      datasets: datasets.map(d => ({
        label: d.label, data: d.data, yAxisID: d.y2 ? "y2" : "y",
        borderColor: d.color, backgroundColor: d.fill === false ? "transparent" : gradient(ctx, d.color),
        fill: d.fill !== false, borderWidth: 2.5, cubicInterpolationMode: "monotone",
        pointRadius: d.data.length < 2 ? 5 : 2.5, pointHoverRadius: 6, pointBackgroundColor: d.color, pointBorderWidth: 0,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      interaction: { mode: "nearest", axis: "x", intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, align: "end", labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: false } },
        tooltip: {
          backgroundColor: "rgba(10,15,28,.95)", borderColor: "rgba(249,158,26,.6)", borderWidth: 1, padding: 10, cornerRadius: 0,
          titleFont: { weight: "700" }, callbacks: {
            title: items => fmtDateTime(items[0].parsed.x / 1000),
            label: it => ` ${it.dataset.label}: ${(it.dataset.yAxisID === "y2" && y2Fmt ? y2Fmt : yFmt)(it.parsed.y)}`,
          },
        },
      },
      scales: {
        x: timeAxis(all),
        y: { grace: "12%", ticks: { maxTicksLimit: 4, callback: v => yFmt(v) } },
        ...(datasets.some(d => d.y2) ? { y2: { position: "right", grace: "12%", grid: { display: false }, ticks: { maxTicksLimit: 4, callback: v => (y2Fmt || yFmt)(v) } } } : {}),
      },
    },
  };
  return new Chart(ctx, cfg);
}
function destroyCharts(prefix) {
  for (const [k, c] of Object.entries(S.charts)) if (k.startsWith(prefix)) { c.destroy(); delete S.charts[k]; }
}

/* ---------------- banner & overview ---------------- */
function renderBanner(d) {
  const s = d.summary || {};
  if (s.namecard) $("#banner-bg").style.backgroundImage = `url("${s.namecard}")`;
  if (s.avatar) $("#avatar").src = s.avatar;
  $("#player-name").textContent = s.username || "—";
  $("#player-title").textContent = s.title || "";
  const lvl = s.endorsement?.level;
  $("#endorse").innerHTML = lvl ? `<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="${ORANGE}" stroke-width="3"/><text x="16" y="21.5" text-anchor="middle" font-family="Teko" font-size="17" fill="#fff">${lvl}</text></svg><span>Endorsement <b>${lvl}</b></span>` : "";
  const m = d.meta || {};
  $("#tracking").innerHTML = m.tracking_since
    ? `Tracking since <b style="color:var(--text)">${fmtDate(m.tracking_since)}</b> · ${m.points} data point${m.points === 1 ? "" : "s"}`
    : "No data yet — press Sync";

  const cards = [];
  for (const [platform, comp] of Object.entries(s.competitive || {})) {
    if (!comp) continue;
    for (const role of ["tank", "damage", "support", "open"]) {
      const r = comp[role]; if (!r) continue;
      const icon = d.role_icons?.[role];
      cards.push(`<div class="rank-card">
        <div class="rank-icons"><img class="r" src="${esc(r.rank_icon)}" alt=""><img class="t" src="${esc(r.tier_icon)}" alt=""></div>
        <div class="rank-text"><div class="div">${esc(cap(r.division))} ${r.tier}</div>
          <div class="role">${icon ? `<img src="${esc(icon)}" alt="">` : ""}${role === "open" ? "Open Queue" : cap(role)} · ${platform.toUpperCase()}</div>
          <div class="role">Season ${comp.season ?? "—"}</div></div></div>`);
    }
  }
  $("#ranks").innerHTML = cards.join("") || `<div class="rank-card"><span class="rank-none">Unranked this season</span></div>`;
}

function renderStatStrip(d) {
  const g = d.general || {}, f = d.general_first || {};
  const dg = (g.games_played || 0) - (f.games_played || 0);
  const dw = (g.games_won || 0) - (f.games_won || 0);
  const dt = (g.time_played || 0) - (f.time_played || 0);
  const items = [
    ["Time played", fmtDur(g.time_played), dt > 0 ? `<span class="delta-up">+${fmtDur(dt, true)}</span> since tracking` : "lifetime"],
    ["Games", fmtInt(g.games_played), dg > 0 ? `<span class="delta-up">+${dg}</span> since tracking (${dw}W ${dg - dw}L)` : `${fmtInt(g.games_won)}W · ${fmtInt(g.games_lost)}L`],
    ["Win rate", fmtPct(g.winrate).replace("%", "<small>%</small>"), dg > 0 ? `session ${fmtPct(100 * dw / dg)}` : "all games"],
    ["KDA", fmtNum(g.kda), "(elims + assists) / deaths"],
    ["Elims / 10 min", fmtNum(g.avg_eliminations), `${fmtCompact(g.total_eliminations)} total`],
    ["Damage / 10 min", fmtInt(g.avg_damage), `${fmtCompact(g.total_damage)} total`],
    ["Healing / 10 min", fmtInt(g.avg_healing), `${fmtCompact(g.total_healing)} total`],
  ];
  $("#stat-strip").innerHTML = items.map(([l, v, s]) =>
    `<div class="stat"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join("")
    + (S.mode === "competitive" ? `<div class="mode-note">Competitive stats cover the <b>current season</b> only — Blizzard resets them on the career profile each season.</div>` : "");
}

function renderRoles(d) {
  const roles = ["tank", "damage", "support"].map(k => ({ k, ...(d.roles?.[k] || {}) }));
  const total = roles.reduce((a, r) => a + (r.time_played || 0), 0) || 1;
  $("#role-split").innerHTML = roles.map(r => {
    const pct = 100 * (r.time_played || 0) / total;
    const icon = d.role_icons?.[r.k];
    const meta = r.time_played
      ? `<span>${fmtDur(r.time_played, true)}</span><span>${fmtInt(r.games_played)} games</span><span>${fmtPct(r.winrate)} win</span><span>KDA ${fmtNum(r.kda)}</span>`
      : `<span>Not played in this mode</span>`;
    return `<div class="role-row${r.time_played ? "" : " role-empty"}">
      <div class="rr-head">${icon ? `<img src="${esc(icon)}" alt="">` : ""}<span class="rr-name">${cap(r.k)}</span><span class="rr-pct">${pct.toFixed(0)}%</span></div>
      <div class="bar"><i style="width:${pct}%;background:${ROLE_COLOR[r.k]}"></i></div>
      <div class="rr-meta">${meta}</div>
    </div>`;
  }).join("");
}

async function renderOverview() {
  const o = await api(`/api/overview?mode=${S.mode}`);
  destroyCharts("overview");
  const pts = key => o.general.map(p => ({ x: p.ts * 1000, y: p[key] }));
  S.charts.overview = lineChart($("#overview-chart"), [
    { label: "Win rate", data: pts("winrate"), color: ORANGE },
    { label: "KDA", data: pts("kda"), color: BLUE, y2: true, fill: false },
  ], { yFmt: v => `${(+v).toFixed(1)}%`, y2Fmt: v => (+v).toFixed(2) });
  $("#overview-hint").textContent = o.general.length < 2
    ? "starts today — a point is added whenever your stats change"
    : `${o.general.length} points since ${fmtDate(o.general[0].ts)}`;
}

/* ---------------- roster ---------------- */
function renderRoster() {
  const d = S.data; if (!d) return;
  const icons = d.role_icons || {};
  $$("#role-filter .chip").forEach(c => {
    const r = c.dataset.role; if (r !== "all" && icons[r] && !c.innerHTML) c.innerHTML = `<img src="${esc(icons[r])}" alt="${r}">`;
    c.classList.toggle("active", r === S.role);
  });
  let hs = d.heroes.filter(h => S.role === "all" || h.role === S.role);
  const key = S.sort;
  hs = [...hs].sort((a, b) => (b.latest[key] ?? -1) - (a.latest[key] ?? -1));
  const maxTime = Math.max(...d.heroes.map(h => h.latest.time_played || 0), 1);
  $("#roster").innerHTML = hs.map(h => {
    const val = key === "winrate" ? fmtPct(h.latest.winrate) : key === "kda" ? `KDA ${fmtNum(h.latest.kda)}` : key === "games_played" ? `${h.latest.games_played} games` : fmtDur(h.latest.time_played, true);
    return `<button class="hero-tile${h.key === S.hero ? " active" : ""}" data-key="${esc(h.key)}" title="${esc(h.name)}">
      ${icons[h.role] ? `<span class="ht-role"><img src="${esc(icons[h.role])}" alt=""></span>` : ""}
      ${h.delta.games_played > 0 ? `<span class="ht-new">+${h.delta.games_played}</span>` : ""}
      <img src="${esc(h.portrait || "")}" alt="" loading="lazy">
      <div class="ht-info"><div class="ht-name">${esc(h.name)}</div>
        <div class="ht-val"><span>${val}</span><span>${fmtPct(h.latest.winrate)}</span></div>
        <div class="ht-bar"><i style="width:${100 * (h.latest.time_played || 0) / maxTime}%"></i></div></div>
    </button>`;
  }).join("") || `<div class="empty-state">No heroes played in this mode.</div>`;
  $$("#roster .hero-tile").forEach(t => t.addEventListener("click", () => selectHero(t.dataset.key)));
}

/* ---------------- hero detail ---------------- */
async function selectHero(key) {
  S.hero = key; updateHash();
  $$("#roster .hero-tile").forEach(t => t.classList.toggle("active", t.dataset.key === key));
  const h = S.data.heroes.find(x => x.key === key);
  let d;
  try { d = await api(`/api/hero/${encodeURIComponent(key)}?mode=${S.mode}`); } catch (e) { toast(`Couldn't load ${key}`); return; }
  const last = d.series[d.series.length - 1], first = d.series[0];
  $("#hero-portrait").src = h?.portrait || d.meta.portrait || "";
  $("#hero-name").textContent = h?.name || d.meta.name || key;
  const icon = S.data.role_icons?.[h?.role];
  $("#hero-role").innerHTML = `${icon ? `<img src="${esc(icon)}" alt="">` : ""}${cap(h?.role || "")}`;
  $("#hero-record").innerHTML = `<b>${fmtInt(last.games_played)}</b> games · <span class="w">${fmtInt(last.games_won)}W</span> <span class="l">${fmtInt(last.games_lost)}L</span> · <b>${fmtDur(last.time_played, true)}</b> played`;

  const stats = [
    ["Time played", fmtDur(last.time_played)], ["Win rate", fmtPct(last.winrate)], ["KDA", fmtNum(last.kda)],
    ["Elims / 10", fmtNum(last.avg_eliminations)], ["Deaths / 10", fmtNum(last.avg_deaths)],
    ["Assists / 10", fmtNum(last.avg_assists)], ["Damage / 10", fmtInt(last.avg_damage)], ["Healing / 10", fmtInt(last.avg_healing)],
    ["Total elims", fmtInt(last.total_eliminations)], ["Total damage", fmtCompact(last.total_damage)],
  ];
  $("#hero-stats").innerHTML = stats.map(([l, v]) => `<div class="hstat"><div class="label">${l}</div><div class="value">${v}</div></div>`).join("");

  const dg = (last.games_played || 0) - (first.games_played || 0), dw = (last.games_won || 0) - (first.games_won || 0);
  const dt = (last.time_played || 0) - (first.time_played || 0);
  $("#since-box").innerHTML = d.series.length < 2 || dg <= 0
    ? `<span class="tag">Since tracking</span><span>No games on ${esc(h?.name || key)} since ${fmtDate(first.ts)} yet — play some and this fills in.</span>`
    : `<span class="tag">Since ${fmtDate(first.ts)}</span><span><b>+${dg}</b> games</span><span><b class="${dw / dg >= 0.5 ? "delta-up" : "delta-down"}">${dw}W ${dg - dw}L</b> (${fmtPct(100 * dw / dg)})</span><span><b>+${fmtDur(dt, true)}</b> played</span><span>KDA ${fmtNum(first.kda)} → <b>${fmtNum(last.kda)}</b></span>`;

  $("#hero-hint").textContent = d.series.length < 2 ? "tracking started " + fmtDate(first.ts) : `${d.series.length} points`;
  destroyCharts("hero");
  const defs = [
    ["Time played", "time_played", v => fmtDur(v, true), ORANGE, v => `${(v / 3600).toFixed(0)}h`],
    ["Win rate", "winrate", fmtPct, WIN], ["KDA", "kda", v => fmtNum(v), BLUE],
    ["Elims / 10 min", "avg_eliminations", v => fmtNum(v), ORANGE], ["Damage / 10 min", "avg_damage", fmtInt, LOSS],
    ["Healing / 10 min", "avg_healing", fmtInt, WIN],
  ];
  $("#chart-grid").innerHTML = defs.map(([l, k, f], i) =>
    `<div class="mini-chart"><div class="mc-head"><span class="mc-label">${l}</span><span class="mc-value">${f(last[k])}</span></div><div class="chart-wrap"><canvas id="hc-${i}"></canvas></div></div>`).join("");
  defs.forEach(([l, k, f, color, axisFmt], i) => {
    S.charts[`hero-${i}`] = lineChart($(`#hc-${i}`), [{ label: l, data: d.series.map(p => ({ x: p.ts * 1000, y: p[k] })), color }], { yFmt: axisFmt || f });
  });

  S.career = d.career;
  const modes = Object.keys(d.career);
  if (!modes.includes(S.careerMode)) S.careerMode = modes[0] || null;
  renderCareer();
}

function renderCareer() {
  const c = S.career || {}, modes = Object.keys(c);
  const box = $("#career-table"), tabs = $("#cat-tabs");
  if (!S.careerMode) { tabs.innerHTML = ""; box.innerHTML = `<div class="career-empty">No detailed career stats for this hero in this mode.</div>`; return; }
  const cats = Object.keys(c[S.careerMode] || {});
  if (!cats.includes(S.careerCat)) S.careerCat = cats.includes("hero_specific") ? "hero_specific" : cats[0];
  const modeTabs = modes.length > 1 ? modes.map(m => `<button class="cat-tab${m === S.careerMode ? " active" : ""}" data-cmode="${m}">${m === "quickplay" ? "QP" : "Comp"}</button>`).join("") + `<span style="width:10px"></span>` : "";
  tabs.innerHTML = modeTabs + cats.map(k => `<button class="cat-tab${k === S.careerCat ? " active" : ""}" data-cat="${k}">${cap(k.replace(/_/g, " "))}</button>`).join("");
  $$("[data-cmode]", tabs).forEach(b => b.addEventListener("click", () => { S.careerMode = b.dataset.cmode; renderCareer(); }));
  $$("[data-cat]", tabs).forEach(b => b.addEventListener("click", () => { S.careerCat = b.dataset.cat; renderCareer(); }));
  const rows = Object.entries(c[S.careerMode][S.careerCat] || {});
  box.innerHTML = rows.map(([k, v]) => `<div class="ct-row"><span>${statLabel(k)}</span><span>${statValue(k, v)}</span></div>`).join("")
    || `<div class="career-empty">Nothing recorded in this category.</div>`;
}

/* ---------------- page flow ---------------- */
function updateHash() { history.replaceState(null, "", `#mode=${S.mode}${S.hero ? `&hero=${S.hero}` : ""}`); }
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (["all", "quickplay", "competitive"].includes(p.get("mode"))) S.mode = p.get("mode");
  if (p.get("hero")) S.hero = p.get("hero");
}

async function load() {
  document.body.classList.add("loading");
  $$(".mode-tabs .tab").forEach(t => t.classList.toggle("active", t.dataset.mode === S.mode));
  const d = await api(`/api/state?mode=${S.mode}`);
  S.data = d;
  renderBanner(d);
  $("#foot-sync").textContent = d.meta?.last_sync ? `Last sync ${fmtDateTime(d.meta.last_sync.at)} · ${d.meta.last_sync.ok ? "OK" : "failed"}` : "";
  if (d.empty) {
    $("#stat-strip").innerHTML = `<div class="panel empty-state" style="grid-column:1/-1">No stats stored for this mode yet. Press <b>Sync</b> to fetch them.</div>`;
    $("#roster").innerHTML = ""; return;
  }
  renderStatStrip(d); renderRoles(d); renderRoster();
  await renderOverview();
  if (!S.hero || !d.heroes.some(h => h.key === S.hero)) S.hero = d.heroes[0]?.key;
  if (S.hero) await selectHero(S.hero);
  document.body.classList.remove("loading");
}

async function doSync() {
  const b = $("#sync-btn"); b.disabled = true; b.classList.add("busy"); $(".sync-label", b).textContent = "Syncing";
  try {
    const r = await api("/api/sync", { method: "POST" });
    toast(r.ok ? (r.new_points ? `Synced — ${r.new_points} new data point(s)` : "Synced — no changes since last time") : r.message);
    await load();
  } catch (e) { toast("Sync failed — is the server running?"); }
  finally { b.disabled = false; b.classList.remove("busy"); $(".sync-label", b).textContent = "Sync"; }
}

$$(".mode-tabs .tab").forEach(t => t.addEventListener("click", () => { if (S.mode !== t.dataset.mode) { S.mode = t.dataset.mode; updateHash(); load(); } }));
$$("#role-filter .chip").forEach(c => c.addEventListener("click", () => { S.role = c.dataset.role; renderRoster(); }));
$("#sort").addEventListener("change", e => { S.sort = e.target.value; renderRoster(); });
$("#sync-btn").addEventListener("click", doSync);

readHash();
load().catch(e => { console.error(e); toast("Couldn't load data — is the server running?"); });
