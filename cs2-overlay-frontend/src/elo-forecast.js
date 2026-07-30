// CS Tracker - "ELO Forecast" card (Player Summary tab).
//
// Answers "how many matches until my next FACEIT level?" from a simple
// linear-regression trend over the ELO snapshots recorded by the backend
// (see cs2-overlay-backend EloHistoryModule) every time this identifier's
// Player Summary is looked up. Triggered by player-summary.js right after
// a successful lookup (see `window.EloForecast.load()` below) - not a
// standalone lookup of its own, since it always mirrors whichever
// nickname is currently shown on the Player Summary tab.
(function () {
  const EF_BACKEND_URL = "http://localhost:3000";
  const EF_PROJECTION_MATCHES = 10; // how far to extend the dashed trend line on the chart

  const root = document.getElementById("ef-root");
  if (!root) return;

  function renderEmpty(message) {
    root.innerHTML = `<div class="empty-state ef-empty-state">${message}</div>`;
  }

  function renderLoading() {
    root.innerHTML = `
      <div class="lookup-loading-state">
        <div class="lookup-spinner"></div>
        <div class="lookup-loading-text">Computing ELO forecast...</div>
      </div>`;
  }

  function confidenceLabel(confidence) {
    if (confidence === "high") return { cls: "ef-conf-high", label: "HIGH CONFIDENCE" };
    if (confidence === "medium") return { cls: "ef-conf-mid", label: "MEDIUM CONFIDENCE" };
    return { cls: "ef-conf-low", label: "LOW CONFIDENCE" };
  }

  function bestGainStreak(history) {
    let best = 0;
    let current = 0;
    for (let i = 1; i < history.length; i++) {
      const delta = history[i].elo - history[i - 1].elo;
      if (delta > 0) {
        current += delta;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    }
    return best;
  }

  function linreg(ys) {
    const n = ys.length;
    const xs = ys.map((_, i) => i);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - xMean) * (ys[i] - yMean);
      den += (xs[i] - xMean) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;
    return { slope, intercept };
  }

  function buildChartSvg(forecast) {
    const eloValues = forecast.history.map((h) => h.elo);
    const n = eloValues.length;
    const targetElo = forecast.targetElo;
    const W = 680;
    const H = 220;
    const padL = 40;
    const padR = 14;
    const padT = 14;
    const padB = 22;
    const totalPoints = n + EF_PROJECTION_MATCHES;

    const { slope, intercept } = linreg(eloValues);

    const projectionValues = Array.from({ length: EF_PROJECTION_MATCHES }, (_, i) => intercept + slope * (n + i));
    const allValsForRange = eloValues.concat(projectionValues);
    if (targetElo !== null) allValsForRange.push(targetElo);
    const minY = Math.min(...allValsForRange) - 15;
    const maxY = Math.max(...allValsForRange) + 15;

    const xFor = (i) => padL + (i / (totalPoints - 1)) * (W - padL - padR);
    const yFor = (v) => H - padB - ((v - minY) / (maxY - minY || 1)) * (H - padT - padB);

    const histPath = eloValues
      .map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`)
      .join(" ");

    const trendPts = [];
    const step = Math.max(1, Math.floor(n / 6));
    for (let i = 0; i < n; i += step) trendPts.push([i, intercept + slope * i]);
    trendPts.push([n - 1, intercept + slope * (n - 1)]);
    for (let i = 1; i <= EF_PROJECTION_MATCHES; i++) trendPts.push([n - 1 + i, intercept + slope * (n - 1 + i)]);
    const trendPath = trendPts
      .map(([i, v], idx) => `${idx === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`)
      .join(" ");

    const gridCount = 4;
    let gridlines = "";
    for (let g = 0; g <= gridCount; g++) {
      const v = minY + (g / gridCount) * (maxY - minY);
      const y = yFor(v);
      gridlines += `<line class="ef-gridline" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" />`;
      gridlines += `<text class="ef-axis-label" x="4" y="${(y + 3).toFixed(1)}">${Math.round(v)}</text>`;
    }

    const lastX = xFor(n - 1);
    const lastY = yFor(eloValues[n - 1]);

    let targetLine = "";
    let crossMarker = "";
    if (targetElo !== null) {
      const targetY = yFor(targetElo);
      targetLine = `
        <line x1="${padL}" y1="${targetY.toFixed(1)}" x2="${W - padR}" y2="${targetY.toFixed(1)}"
              stroke="var(--text-muted)" stroke-width="1.2" stroke-dasharray="3 4" opacity="0.8" />
        <text class="ef-axis-label" x="${W - padR - 2}" y="${(targetY - 6).toFixed(1)}" text-anchor="end" fill="var(--text-secondary)">target: ${targetElo}</text>`;

      const matchesToTarget = slope > 0 ? (targetElo - eloValues[n - 1]) / slope : null;
      if (matchesToTarget && matchesToTarget > 0 && matchesToTarget <= EF_PROJECTION_MATCHES) {
        const cx = xFor(n - 1 + matchesToTarget);
        crossMarker = `
          <circle cx="${cx.toFixed(1)}" cy="${targetY.toFixed(1)}" r="4.5" fill="#0d1015" stroke="var(--accent-orange)" stroke-width="2" />
          <circle cx="${cx.toFixed(1)}" cy="${targetY.toFixed(1)}" r="9" fill="none" stroke="var(--accent-orange)" stroke-width="1" opacity="0.4" />`;
      }
    }

    return `
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        ${gridlines}
        ${targetLine}
        <path d="${trendPath}" fill="none" stroke="var(--accent-orange)" stroke-width="2" stroke-dasharray="5 4" opacity="0.85" />
        <path d="${histPath}" fill="none" stroke="var(--accent-blue)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
        <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="4" fill="var(--accent-blue)" stroke="#0d1015" stroke-width="1.5" />
        ${crossMarker}
        <text class="ef-axis-label" x="${padL}" y="${H - 5}">-${n} data points</text>
        <text class="ef-axis-label" x="${lastX.toFixed(1)}" y="${H - 5}" text-anchor="middle">now</text>
        <text class="ef-axis-label" x="${(W - padR).toFixed(1)}" y="${H - 5}" text-anchor="end">+${EF_PROJECTION_MATCHES}</text>
      </svg>`;
  }

  function renderForecast(forecast, nickname) {
    if (forecast.dataPoints < 2) {
      // Not enough recorded ELO snapshots yet to draw a trend - this
      // grows over time as the player checks their Player Summary again
      // after playing more matches (see EloHistoryService doc comment).
      root.innerHTML = `
        <div class="empty-state ef-empty-state">
          Not enough recorded ELO data points yet for <b>${nickname}</b>'s
          forecast (currently: ${forecast.dataPoints}). Check the Player
          Summary again after playing a few more matches - every time your
          ELO has changed since the last check, a new data point is
          recorded.
        </div>`;
      return;
    }

    if (forecast.targetElo === null) {
      root.innerHTML = `
        <div class="ef-hero-banner">
          <div class="ef-hero-grid-lines"></div>
          <div class="ef-hero-top">
            <p class="ef-hero-title"><span class="dot"></span>ELO Forecast</p>
            <span class="ef-refresh-note">based on ${forecast.dataPoints} data points</span>
          </div>
          <div class="ef-hero-main">
            <div>
              <div class="ef-headline-num" style="font-size:28px;">Max level reached</div>
              <div class="ef-headline-label">You're already at <b>Level 10</b> (${forecast.currentElo} ELO) - there's no higher FACEIT level to track.</div>
            </div>
          </div>
        </div>`;
      return;
    }

    const conf = confidenceLabel(forecast.confidence);
    const bestStreak = bestGainStreak(forecast.history);
    const trendVal = forecast.avgEloChangePerMatch;
    const trendCls = trendVal > 0 ? "up" : trendVal < 0 ? "down" : "";
    const trendSign = trendVal > 0 ? "+" : "";

    const headline =
      forecast.matchesToTarget !== null
        ? `~${forecast.matchesToTarget} matches`
        : trendVal !== null && trendVal <= 0
          ? "N/A"
          : "?";

    const headlineLabel =
      forecast.matchesToTarget !== null
        ? `estimated number of matches to reach <b>Level ${forecast.targetLevel}</b>, based on your current form`
        : `can't be estimated from the current trend (not increasing) when you'll reach <b>Level ${forecast.targetLevel}</b>`;

    root.innerHTML = `
      <div class="ef-hero-banner">
        <div class="ef-hero-grid-lines"></div>
        <div class="ef-hero-top">
          <p class="ef-hero-title"><span class="dot"></span>ELO Forecast</p>
          <span class="ef-refresh-note">based on ${forecast.dataPoints} data points</span>
        </div>
        <div class="ef-hero-main">
          <div>
            <div class="ef-headline-num">${headline}</div>
            <div class="ef-headline-label">${headlineLabel}</div>
          </div>
          <div class="ef-target-chip">
            <div class="ef-target-icon">L${forecast.targetLevel}</div>
            <div class="ef-target-text">
              <div class="t1">Target threshold</div>
              <div class="t2">${forecast.targetElo} ELO</div>
            </div>
          </div>
        </div>
        <div class="ef-hero-footer">
          <span>Current: <b style="color:var(--text-secondary)">${forecast.currentElo} ELO</b> &middot; remaining: <b style="color:var(--text-secondary)">${forecast.eloRemaining} ELO</b></span>
          <span class="ef-conf-badge ${conf.cls}">${conf.label}</span>
        </div>
      </div>

      <div class="ef-stats-grid">
        <div class="ef-tile">
          <div class="lbl">Avg ELO / data point</div>
          <div class="val ${trendCls}">${trendSign}${trendVal}</div>
          <div class="sub">based on ${forecast.dataPoints} data points</div>
        </div>
        <div class="ef-tile">
          <div class="lbl">Best gain streak</div>
          <div class="val up">+${bestStreak}</div>
          <div class="sub">cumulative gain</div>
        </div>
        <div class="ef-tile">
          <div class="lbl">Volatility</div>
          <div class="val">&plusmn;${forecast.volatility ?? "N/A"}</div>
          <div class="sub">std. dev. per data point</div>
        </div>
        <div class="ef-tile">
          <div class="lbl">Data Points</div>
          <div class="val">${forecast.dataPoints}</div>
          <div class="sub">recorded ELO changes</div>
        </div>
      </div>

      <div class="ef-card">
        <h2>
          ELO Trend &amp; Forecast
          <span class="ef-legend">
            <span><i style="background:var(--accent-blue)"></i>Historical ELO</span>
            <span><i style="background:var(--accent-orange); opacity:0.9;"></i>Trend line (forecast)</span>
            <span><i style="background:var(--text-muted)"></i>Target level</span>
          </span>
        </h2>
        <div class="ef-chart-wrap">${buildChartSvg(forecast)}</div>
      </div>

      <div class="ef-card">
        <h2>How is this calculated?</h2>
        <div class="ef-note">
          The estimate runs a linear regression over the recorded
          ELO data points - a new data point is recorded every time you
          check your stats on the Player Summary tab AND your ELO has
          changed since the last check (CS2's GSI never sends FACEIT ELO,
          so for now this only updates "per check", not in real time per
          match). This produces the <b>estimated ELO gain per data
          point</b> and its standard deviation (volatility). The headline
          number above is the remaining ELO distance divided by that
          average. The more data points accumulate, the more reliable the
          estimate becomes.
        </div>
      </div>`;
  }

  async function load(identifier) {
    const nickname = (identifier || "").trim();
    if (!nickname) {
      renderEmpty("Check your stats above to see the ELO forecast.");
      return;
    }
    renderLoading();
    try {
      const res = await fetch(`${EF_BACKEND_URL}/players/${encodeURIComponent(nickname)}/elo-forecast`);
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const forecast = await res.json();
      if (forecast.currentElo === null) {
        renderEmpty(`No FACEIT ELO available for "${nickname}" - check that the nickname is correct.`);
        return;
      }
      renderForecast(forecast, nickname);
    } catch (err) {
      root.innerHTML = `
        <div class="lookup-error-state">
          <div class="lookup-error-title">\u26A0 ELO forecast failed</div>
          <div class="lookup-error-detail">${err?.message || String(err)}</div>
          <div class="lookup-error-hint">
            Check that the backend is running and reachable (Setup &amp; GSI tab).
          </div>
        </div>`;
    }
  }

  renderEmpty("Check your stats above to see the ELO forecast.");

  window.EloForecast = { load };
})();
