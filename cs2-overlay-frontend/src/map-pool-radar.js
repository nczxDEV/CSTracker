// CS Tracker - "Map Pool Radar" card (Player Summary tab).
//
// Shows a spider/radar chart comparing the player's per-map win rate (or
// Rating/K-D, via the toggle pills) against a baseline, plus a
// per-map breakdown table - using small map icon images (instead of
// plain text map names, per the approved mockup) wherever official art
// is available, falling back to a 2-letter initials badge otherwise.
//
// Data comes from the backend's GET /players/:identifier/map-pool (see
// cs2-overlay-backend PlayersController.mapPool() / map-pool.util.ts),
// which reshapes the SAME faceitMapStats already fetched for the Player
// Summary's "Map Breakdown" table - no extra external API calls.
//
// Triggered by player-summary.js right after a successful lookup (see
// `window.MapPoolRadar.load()` below), mirroring elo-forecast.js.
(function () {
  const MP_BACKEND_URL = "http://localhost:3000";

  const root = document.getElementById("mp-root");
  if (!root) return;

  // Only maps we have official art for (backgrounds already removed -
  // see the asset pipeline notes in the PR/commit that added these).
  // Any map NOT in this list (e.g. Anubis, Train, Overpass, Vertigo)
  // falls back to a small initials badge instead of a broken <img>.
  const MAP_ICONS = {
    mirage: "assets/map-icons/mirage.png",
    inferno: "assets/map-icons/inferno.png",
    ancient: "assets/map-icons/ancient.png",
    nuke: "assets/map-icons/nuke.png",
    cache: "assets/map-icons/cache.png",
    dust2: "assets/map-icons/dust2.png",
  };

  let currentMetric = "winrate"; // 'winrate' | 'rating' | 'kd'
  let currentMapPool = null;
  let currentNickname = "";

  // NOTE: map keys arrive PRE-NORMALIZED from the backend (see
  // map-pool.util.ts `normalizeMapKey()`) - both sides intentionally use
  // the exact same normalization logic, so there is no need to
  // re-normalize `m.mapKey` here; it's used as-is to look up MAP_ICONS.

  function initialsFor(name) {
    return String(name || "?").slice(0, 2).toUpperCase();
  }

  function iconHtmlFor(mapKey, displayName, sizeClass) {
    const src = MAP_ICONS[mapKey];
    if (src) {
      return `<img class="${sizeClass}" src="${src}" alt="${displayName}" title="${displayName}" />`;
    }
    return `<div class="${sizeClass}-fallback" title="${displayName}">${initialsFor(displayName)}</div>`;
  }

  function renderEmpty(message) {
    root.innerHTML = `<div class="empty-state mp-empty-state">${message}</div>`;
  }

  function renderLoading() {
    root.innerHTML = `
      <div class="lookup-loading-state">
        <div class="lookup-spinner"></div>
        <div class="lookup-loading-text">Loading map pool...</div>
      </div>`;
  }

  function wrClass(wr) {
    if (wr >= 55) return "good";
    if (wr >= 45) return "mid";
    return "bad";
  }

  function barColor(wr) {
    if (wr >= 55) return "var(--accent-green)";
    if (wr >= 45) return "var(--accent-orange)";
    return "var(--accent-red)";
  }

  /** Returns the 0-100 "radar scale" value for the currently-selected metric, for a single map entry. */
  function metricValue(map, metric) {
    if (metric === "winrate") return map.winRatePercent;
    if (metric === "kd") return map.avgKd !== null ? map.avgKd * 50 : null; // ~1.0 KD -> 50 on the radar scale
    if (metric === "rating") return map.rating !== null ? map.rating * 50 : null;
    return null;
  }

  function metricDisplay(map, metric) {
    if (metric === "winrate") return map.winRatePercent !== null ? `${map.winRatePercent}%` : "N/A";
    if (metric === "kd") return map.avgKd !== null ? map.avgKd.toFixed(2) : "N/A";
    if (metric === "rating") return map.rating !== null ? `${map.rating.toFixed(2)} rtg` : "N/A";
    return "N/A";
  }

  function renderRows(mapPool) {
    const maps = mapPool.maps;
    const html = maps
      .map((m) => {
        const wr = m.winRatePercent ?? 0;
        return `
      <div class="mp-row">
        ${iconHtmlFor(m.mapKey, m.displayName, "mp-row-icon")}
        <div>
          <div class="name-wrap">
            <div class="name">${m.displayName}</div>
            <div class="played">${m.matches ?? 0} meccs</div>
          </div>
          <div class="mp-bar-track">
            <div class="mp-bar-fill" style="width:${Math.max(2, wr)}%; background:${barColor(wr)};"></div>
          </div>
        </div>
        <div class="wr ${wrClass(wr)}">${m.winRatePercent !== null ? m.winRatePercent + "%" : "N/A"}</div>
        <div class="rating">${metricDisplay(m, "rating")}</div>
      </div>`;
      })
      .join("");
    document.getElementById("mp-rows").innerHTML = html;
  }

  function renderRadar(mapPool, metric) {
    const maps = mapPool.maps;
    const size = 420;
    const cx = size / 2;
    const cy = size / 2 + 6;
    const maxR = 148;
    const n = maps.length;
    const angleFor = (i) => -Math.PI / 2 + (i / n) * Math.PI * 2;

    const scale = (v) => Math.max(0.05, Math.min(1, (v ?? 0) / 100)) * maxR;

    const ptsFor = (values) =>
      values.map((v, i) => {
        const r = scale(v);
        const a = angleFor(i);
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      });

    const playerValues = maps.map((m) => metricValue(m, metric));
    const avgValues = maps.map((m) => (metric === "winrate" ? m.levelAvgWinRate : metricValue(m, metric)));

    const playerPts = ptsFor(playerValues);
    const avgPts = ptsFor(avgValues);

    const playerPath = playerPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
    const avgPath = avgPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";

    let rings = "";
    [0.25, 0.5, 0.75, 1].forEach((frac) => {
      const ringPts = Array.from({ length: n }, (_, i) => {
        const r = maxR * frac;
        const a = angleFor(i);
        return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
      }).join(" ");
      rings += `<polygon points="${ringPts}" fill="none" stroke="var(--line)" stroke-width="1" />`;
    });

    let spokes = "";
    let iconDefs = "";
    let iconUses = "";
    const iconR = 17;
    maps.forEach((m, i) => {
      const a = angleFor(i);
      const x2 = cx + maxR * Math.cos(a);
      const y2 = cy + maxR * Math.sin(a);
      spokes += `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--line)" stroke-width="1" />`;

      const lx = cx + (maxR + 30) * Math.cos(a);
      const ly = cy + (maxR + 30) * Math.sin(a);
      const clipId = `mp-clip-${i}`;
      const src = MAP_ICONS[m.mapKey];

      iconDefs += `<clipPath id="${clipId}"><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${iconR}" /></clipPath>`;

      if (src) {
        iconUses += `
          <circle class="mp-axis-icon-bg" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${iconR}" />
          <image href="${src}" x="${(lx - iconR).toFixed(1)}" y="${(ly - iconR).toFixed(1)}"
                 width="${iconR * 2}" height="${iconR * 2}" clip-path="url(#${clipId})"
                 preserveAspectRatio="xMidYMid meet">
            <title>${m.displayName}</title>
          </image>
          <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${iconR}" fill="none" stroke="var(--border-subtle)" stroke-width="1" />`;
      } else {
        iconUses += `
          <circle class="mp-axis-icon-bg" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${iconR}" fill="var(--accent-purple-dim)" />
          <text class="mp-axis-fallback-text" x="${lx.toFixed(1)}" y="${(ly + 1).toFixed(1)}">${initialsFor(m.displayName)}</text>
          <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${iconR}" fill="none" stroke="var(--border-subtle)" stroke-width="1" />
          <title>${m.displayName}</title>`;
      }
    });

    let tickLabel = "";
    [0.5, 1].forEach((frac) => {
      const y = cy - maxR * frac;
      const label = metric === "winrate" ? `${Math.round(frac * 100)}%` : (frac * 2).toFixed(1);
      tickLabel += `<text class="mp-tick-label" x="${cx + 4}" y="${(y - 2).toFixed(1)}">${label}</text>`;
    });

    const svg = `
    <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>${iconDefs}</defs>
      ${rings}
      ${spokes}
      ${tickLabel}
      <path d="${avgPath}" fill="rgba(150,150,150,0.06)" stroke="var(--text-muted)" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.8" />
      <path d="${playerPath}" fill="var(--accent-purple)" fill-opacity="0.22" stroke="var(--accent-purple)" stroke-width="2.2" stroke-linejoin="round" />
      ${playerPts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="var(--accent-purple)" stroke="#0d1015" stroke-width="1" />`).join("")}
      ${iconUses}
    </svg>`;

    document.getElementById("mp-radar").innerHTML = svg;
  }

  function setMetric(metric) {
    currentMetric = metric;
    root.querySelectorAll(".mp-toggle").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-metric") === metric);
    });
    if (currentMapPool) renderRadar(currentMapPool, currentMetric);
  }

  function renderMapPool(mapPool, nickname) {
    if (!mapPool.maps || mapPool.maps.length === 0) {
      renderEmpty(`No per-map statistics available for "${nickname}" yet.`);
      return;
    }

    const best = mapPool.bestMap;
    const worst = mapPool.worstMap;
    const subLine =
      best && worst && best.mapKey !== worst.mapKey
        ? `Your strongest map right now is <b class="best">${best.displayName}</b> (${best.winRatePercent}% WR),
           and your weakest is <b class="worst">${worst.displayName}</b> (${worst.winRatePercent}% WR) -
           might be worth banning it or practicing it in MM.`
        : `Play a few more matches on at least 3 different maps to see which is your strongest/weakest map.`;

    root.innerHTML = `
      <div class="mp-hero-banner">
        <div class="mp-hero-grid-lines"></div>
        <div class="mp-hero-top">
          <p class="mp-hero-title"><span class="dot"></span>Map Pool Radar</p>
          <span class="mp-refresh-note">based on ${mapPool.totalMatches} ranked matches</span>
        </div>
        <div class="mp-hero-sub">${subLine}</div>
        <div class="mp-toggle-row">
          <button type="button" class="mp-toggle" data-metric="winrate">Winrate</button>
          <button type="button" class="mp-toggle" data-metric="rating">Rating</button>
          <button type="button" class="mp-toggle" data-metric="kd">KD</button>
        </div>
      </div>

      <div class="mp-card">
        <h2>
          Map Performance
          <span class="mp-legend">
            <span><i style="background:var(--accent-purple)"></i>You</span>
            <span><i style="background:var(--text-muted); opacity:0.6;"></i>Level average*</span>
          </span>
        </h2>
        <div class="mp-radar-wrap" id="mp-radar"></div>
      </div>

      <div class="mp-card">
        <h2>Per-Map Breakdown</h2>
        <div class="mp-rows" id="mp-rows"></div>
      </div>

      <div class="mp-card">
        <h2>What does this show?</h2>
        <div class="mp-note">
          The radar compares your <b>win rate</b> (or the other two metrics via the Rating/KD toggle)
          per map against the "Level average*" line. The further the purple shape is from the center on a
          given axis, the better you perform on that map.<br />
          <b>* Level average note:</b> this is currently a neutral 50% baseline, NOT the real average of
          players at your own FACEIT level - the official FACEIT API doesn't publish that data. A real
          version would require this app to collect and bucket users' own map stats by level over time.
        </div>
      </div>`;

    root.querySelectorAll(".mp-toggle").forEach((btn) => {
      btn.addEventListener("click", () => setMetric(btn.getAttribute("data-metric")));
    });

    currentMapPool = mapPool;
    currentNickname = nickname;
    setMetric("winrate");
    renderRows(mapPool);
  }

  async function load(identifier) {
    const nickname = (identifier || "").trim();
    if (!nickname) {
      renderEmpty("Check your stats above to see the Map Pool Radar.");
      return;
    }
    renderLoading();
    try {
      const res = await fetch(`${MP_BACKEND_URL}/players/${encodeURIComponent(nickname)}/map-pool`);
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const mapPool = await res.json();
      renderMapPool(mapPool, nickname);
    } catch (err) {
      root.innerHTML = `
        <div class="lookup-error-state">
          <div class="lookup-error-title">\u26A0 Map pool lookup failed</div>
          <div class="lookup-error-detail">${err?.message || String(err)}</div>
          <div class="lookup-error-hint">
            Check that the backend is running and reachable (Setup &amp; GSI tab).
          </div>
        </div>`;
    }
  }

  renderEmpty("Check your stats above to see the Map Pool Radar.");

  window.MapPoolRadar = { load };
})();
