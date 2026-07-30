// CS Tracker - "Time Performance" tab.
//
// GSI-FREE: shows a win-rate-by-hour-of-day/day-of-week heatmap for ANY
// FACEIT nickname the user types in (own lookup, independent of the
// Player Summary tab) - built purely from the official FACEIT Data
// API's match history endpoint. All the actual bucketing/aggregation
// happens on the backend (see cs2-overlay-backend
// PlayersController.timePerformance() / time-performance.util.ts); this
// file only renders the result, closely mirroring the approved design
// mockup's own rendering functions.
(function () {
  const TP_BACKEND_URL = "http://localhost:3000";

  const els = {
    input: document.getElementById("tp-nickname-input"),
    analyzeBtn: document.getElementById("tp-analyze-btn"),
    status: document.getElementById("tp-status"),
    resultRoot: document.getElementById("tp-result-root"),
  };

  if (!els.input || !els.analyzeBtn || !els.resultRoot) return;

  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  function renderEmpty(message) {
    els.resultRoot.innerHTML = `<div class="tp-empty-state">${message}</div>`;
  }

  function renderLoading() {
    els.resultRoot.innerHTML = `
      <div class="lookup-loading-state">
        <div class="lookup-spinner"></div>
        <div class="lookup-loading-text">Pulling match history and building the heatmap...</div>
      </div>`;
  }

  function renderErrorState(message) {
    els.resultRoot.innerHTML = `
      <div class="lookup-error-state">
        <div class="lookup-error-title">\u26A0 Analysis failed</div>
        <div class="lookup-error-detail">${message || "Unknown error."}</div>
        <div class="lookup-error-hint">
          Check that the backend is running and that your FACEIT API key
          is configured (Setup &amp; GSI tab).
        </div>
      </div>`;
  }

  function setStatus(text, isError) {
    els.status.textContent = text || "";
    els.status.style.color = isError ? "var(--accent-red)" : "";
  }

  function hourLabel(h) {
    const ampm = h < 12 ? "a" : "p";
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}${ampm}`;
  }

  /** "7p" -> "7 PM". */
  function hourLabelFull(short) {
    const ampm = short.slice(-1) === "p" ? "PM" : "AM";
    const num = short.slice(0, -1);
    return `${num} ${ampm}`;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Red (poor form) -> neutral slate -> green (strong form), matching the app's existing --accent-red/--accent-green tokens. */
  function winRateColor(winRate) {
    const red = [255, 77, 94];
    const slate = [58, 66, 82];
    const green = [57, 229, 138];
    let rgb;
    if (winRate <= 50) {
      const t = winRate / 50;
      rgb = red.map((c, i) => lerp(c, slate[i], t));
    } else {
      const t = (winRate - 50) / 50;
      rgb = slate.map((c, i) => lerp(c, green[i], t));
    }
    return rgb.map((v) => Math.round(v));
  }

  function buildHero(data) {
    const b = data.best;
    const w = data.worst;
    if (!b || !w) {
      return `<div class="tp-empty-state">Not enough recent match history with usable timestamps to determine a prime-time window yet.</div>`;
    }
    return `
      <div class="tp-hero-banner">
        <div class="tp-hero-primary">
          <div class="tp-hero-eyebrow">Your Prime Time</div>
          <h1 class="tp-hero-headline">${b.dayFull} evenings around <b>${hourLabelFull(b.hourLabel)}</b> is when you play best</h1>
          <div class="tp-hero-sub">${b.winRate}% win rate across ${b.matches} matches in that hour window.</div>
        </div>
        <div class="tp-hero-divider"></div>
        <div class="tp-hero-worst">
          <div class="tp-hero-worst-label">Toughest window</div>
          <div class="tp-hero-worst-value">${w.dayFull} ${hourLabelFull(w.hourLabel)} &middot; ${w.winRate}% WR</div>
          <div class="tp-hero-worst-sub">${w.matches} matches - maybe not your best time to queue ranked.</div>
        </div>
      </div>`;
  }

  function buildHeatmap(data) {
    const days = data.days;
    const maxMatches = Math.max(1, ...Object.values(data.matrix).map((c) => c.matches));

    let cells = `<div class="tp-heatmap-hourlabel" style="grid-column:1"></div>`;
    HOURS.forEach((h) => {
      cells += `<div class="tp-heatmap-hourlabel" style="grid-column:${h + 2}">${h % 3 === 0 ? hourLabel(h) : ""}</div>`;
    });

    days.forEach((day) => {
      cells += `<div class="tp-heatmap-daylabel">${day}</div>`;
      HOURS.forEach((h) => {
        const cell = data.matrix[`${day}-${h}`];
        if (!cell || !cell.matches) {
          cells += `<div class="tp-cell no-data" title="${day} ${hourLabel(h)} - no matches played"></div>`;
          return;
        }
        const [r, g, bch] = winRateColor(cell.winRate);
        const opacity = 0.35 + 0.65 * Math.min(1, cell.matches / maxMatches);
        cells += `<div class="tp-cell" style="background:rgba(${r},${g},${bch},${opacity.toFixed(2)})" title="${day} ${hourLabel(h)} - ${cell.winRate}% WR over ${cell.matches} match${cell.matches === 1 ? "" : "es"}"></div>`;
      });
    });

    return `
      <div class="tp-card">
        <h2>Win Rate by Hour &amp; Day <span class="badge-optional">Last ${data.matchesConsidered} matches</span></h2>
        <p class="tp-card-hint">Each square is one hour of one weekday. Brighter green = higher win rate; brighter red = lower. Faded squares mean fewer matches were played then.</p>
        <div class="tp-heatmap-scroll">
          <div class="tp-heatmap">${cells}</div>
        </div>
        <div class="tp-heatmap-legend">
          <span>Lower win rate</span>
          <div class="tp-legend-scale">
            <span style="background:rgb(255,77,94)"></span>
            <span style="background:rgb(156,71,88)"></span>
            <span style="background:rgb(58,66,82)"></span>
            <span style="background:rgb(58,148,105)"></span>
            <span style="background:rgb(57,229,138)"></span>
          </div>
          <span>Higher win rate</span>
        </div>
      </div>`;
  }

  function buildSegments(data) {
    const segs = [
      { key: "morning", icon: "\u2600", name: "Morning", range: "6am-12pm" },
      { key: "afternoon", icon: "\u26C5", name: "Afternoon", range: "12pm-6pm" },
      { key: "evening", icon: "\u{1F303}", name: "Evening", range: "6pm-11pm" },
      { key: "night", icon: "\u{1F319}", name: "Night", range: "11pm-6am" },
    ];
    const best = segs.reduce((a, b) =>
      (data.segments[a.key].winRate || 0) > (data.segments[b.key].winRate || 0) ? a : b,
    );
    const tiles = segs
      .map((s) => {
        const d = data.segments[s.key];
        const isBest = s.key === best.key && d.matches > 0;
        return `
        <div class="tp-segment-tile ${isBest ? "best" : ""}">
          <div class="tp-segment-icon">${s.icon}</div>
          <div class="tp-segment-name">${s.name}${isBest ? " \u2605" : ""}</div>
          <div class="tp-segment-winrate">${d.winRate !== null ? d.winRate + "%" : "N/A"}</div>
          <div class="tp-segment-matches">${d.matches} matches &middot; ${s.range}</div>
        </div>`;
      })
      .join("");
    return `
      <div class="tp-card">
        <h2>By Time of Day</h2>
        <div class="tp-segment-grid">${tiles}</div>
      </div>`;
  }

  function buildWeekdayVsWeekend(data) {
    const wd = data.weekday;
    const we = data.weekend;
    return `
      <div class="tp-card">
        <h2>Weekday vs. Weekend</h2>
        <div class="tp-vs-row">
          <div class="tp-vs-label">Weekday</div>
          <div class="tp-vs-track"><div class="tp-vs-fill weekday" style="width:${wd.winRate || 0}%"></div></div>
          <div class="tp-vs-value">${wd.winRate !== null ? wd.winRate + "%" : "N/A"}</div>
        </div>
        <div class="tp-vs-sub">${wd.matches} matches, Mon-Fri</div>
        <div class="tp-vs-row">
          <div class="tp-vs-label">Weekend</div>
          <div class="tp-vs-track"><div class="tp-vs-fill weekend" style="width:${we.winRate || 0}%"></div></div>
          <div class="tp-vs-value">${we.winRate !== null ? we.winRate + "%" : "N/A"}</div>
        </div>
        <div class="tp-vs-sub">${we.matches} matches, Sat-Sun</div>
      </div>`;
  }

  function renderResult(data) {
    if (!data.matchesConsidered) {
      renderEmpty(
        `No FACEIT match history with usable timestamps found for "${data.nickname}" yet - play a few ranked matches and check back.`,
      );
      return;
    }
    els.resultRoot.innerHTML =
      buildHero(data) +
      buildHeatmap(data) +
      `<div class="tp-secondary-grid">${buildSegments(data)}${buildWeekdayVsWeekend(data)}</div>`;
  }

  async function runAnalysis() {
    const nickname = els.input.value.trim();
    if (!nickname) {
      setStatus("Enter a FACEIT nickname first.", true);
      return;
    }
    setStatus("");
    els.analyzeBtn.disabled = true;
    renderLoading();

    try {
      const res = await fetch(`${TP_BACKEND_URL}/players/${encodeURIComponent(nickname)}/time-performance`);
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.message) {
            detail = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
          }
        } catch {
          // Response body wasn't JSON - keep the plain HTTP status detail.
        }
        throw new Error(detail);
      }
      const data = await res.json();
      renderResult(data);
    } catch (err) {
      renderErrorState(err?.message || String(err));
    } finally {
      els.analyzeBtn.disabled = false;
    }
  }

  els.analyzeBtn.addEventListener("click", runAnalysis);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runAnalysis();
    }
  });

  renderEmpty("Enter a FACEIT nickname above and click Analyze to see when you play best.");
})();
