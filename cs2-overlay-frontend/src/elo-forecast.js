// Historical API/global names retained so existing callers continue working.
// These are observed profile snapshots, not match results or predictions.
(function () {
  const root = document.getElementById("ef-root");
  if (!root) return;
  let requestId = 0;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const date = (value) => {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : "Unknown time";
  };
  function chart(history) {
    if (history.length < 2) return '<div class="empty-state">A second changed ELO observation is needed to draw the history.</div>';
    const first = Date.parse(history[0].recordedAt), last = Date.parse(history.at(-1).recordedAt);
    const values = history.map(h => h.elo), low = Math.min(...values) - 15, high = Math.max(...values) + 15;
    const x = h => 50 + (Date.parse(h.recordedAt) - first) / Math.max(1, last - first) * 610;
    const y = h => 180 - (h.elo - low) / (high - low) * 160;
    const path = history.map((h, i) => `${i ? "L" : "M"} ${x(h).toFixed(2)} ${y(h).toFixed(2)}`).join(" ");
    return `<svg viewBox="0 0 680 220" role="img" aria-label="Recorded FACEIT ELO over time">
      <text x="0" y="22" class="ef-axis-label">${Math.round(high)}</text>
      <text x="0" y="180" class="ef-axis-label">${Math.round(low)}</text>
      <path d="${path}" fill="none" stroke="var(--accent-blue)" stroke-width="2.4" />
      ${history.map(h => `<circle cx="${x(h)}" cy="${y(h)}" r="3" fill="var(--accent-blue)"><title>${escape(date(h.recordedAt))}: ${h.elo} ELO</title></circle>`).join("")}
      <text x="50" y="210" class="ef-axis-label">${escape(new Date(first).toLocaleDateString())}</text>
      <text x="660" y="210" text-anchor="end" class="ef-axis-label">${escape(new Date(last).toLocaleDateString())}</text>
    </svg>`;
  }
  function render(data) {
    const history = (data.history || []).filter(h => Number.isFinite(h.elo) && Number.isFinite(Date.parse(h.recordedAt))).sort((a,b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
    const change = history.length >= 2 ? history.at(-1).elo - history[0].elo : null;
    root.innerHTML = `<div class="ef-hero-banner">
      <div class="ef-hero-top"><p class="ef-hero-title">ELO History</p><span class="ef-refresh-note">${history.length} saved observations</span></div>
      <div class="ef-headline-num">${escape(data.currentElo)} ELO</div>
      <div class="ef-headline-label">${data.targetElo == null ? "Highest FACEIT level reached" : `${escape(data.eloRemaining)} ELO to Level ${escape(data.targetLevel)} (${escape(data.targetElo)} ELO)`}</div>
    </div>
    <div class="ef-stats-grid"><div class="ef-tile"><div class="lbl">Observed change</div><div class="val">${change == null ? "N/A" : `${change > 0 ? "+" : ""}${change}`}</div><div class="sub">Last saved ELO minus first saved ELO</div></div>
    <div class="ef-tile"><div class="lbl">Observation period</div><div class="sub">${history.length ? `${escape(date(history[0].recordedAt))}<br />to ${escape(date(history.at(-1).recordedAt))}` : "No saved observations"}</div></div></div>
    <div class="ef-card"><h2>Recorded ELO</h2><div class="ef-chart-wrap">${chart(history)}</div></div>
    <div class="ef-card"><h2>What does this show?</h2><div class="ef-note">Source: FACEIT profile lookups saved on this PC. A point is stored only when ELO changes. Timestamps show when the value was observed, not when a match ended. Multiple matches can fall between observations; unchanged observations are not stored. This is not per-match ELO history, and cannot predict how many matches you need to reach the next level.</div></div>`;
  }
  async function load(identifier) {
    const id = ++requestId, name = String(identifier || "").trim();
    if (!name) { root.innerHTML = '<div class="empty-state">Look up a player to see ELO history.</div>'; return; }
    root.innerHTML = '<div class="lookup-loading-state"><div class="lookup-spinner"></div>Loading ELO history...</div>';
    try {
      const response = await fetch(`http://localhost:3000/players/${encodeURIComponent(name)}/elo-forecast`);
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
      const data = await response.json();
      if (id !== requestId) return;
      if (data.currentElo == null) { root.innerHTML = '<div class="empty-state">No FACEIT ELO available for this player.</div>'; return; }
      render(data);
    } catch (error) {
      if (id === requestId) root.innerHTML = `<div class="lookup-error-state">ELO history unavailable: ${escape(error.message)}</div>`;
    }
  }
  root.innerHTML = '<div class="empty-state">Look up a player to see ELO history.</div>';
  window.EloForecast = { load };
})();
