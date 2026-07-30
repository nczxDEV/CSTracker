// CS Tracker - "Match Summary" popup window logic.
//
// Runs in a SEPARATE Tauri window (see src-tauri/src/main.rs
// `open_match_summary_window`, opened from faceit-match-history.js) -
// reads `matchId`/`identifier` from its own URL query string, fetches
// the full match summary from the backend
// (GET /players/:identifier/faceit-match-history/:matchId), and renders
// it into the reference "FACEIT match summary" design.
//
// TRANSPARENCY: ADR is shown per-player when the match actually has it
// (some matches/game modes don't - see the backend's
// FaceitMatchSummary.adrAvailable), and KAST / per-match ELO change are
// NEVER shown as real numbers - FACEIT's public Data API does not expose
// either of those (see faceit-match-history.model.ts doc comments) - a
// single honest footer notice explains this instead of a fake or
// always-"N/A" column for every row.
(function () {
  const MS_BACKEND_URL = "http://localhost:3000";
  const root = document.getElementById("ms-root");

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderError(title, detail) {
    root.innerHTML = `
      <div class="ms-error-state">
        <div class="ms-error-title">\u26A0 ${escapeHtml(title)}</div>
        <div class="ms-error-detail">${escapeHtml(detail)}</div>
      </div>`;
  }

  function initials(nickname) {
    const clean = (nickname || "").replace(/[^a-zA-Z0-9]/g, "");
    return (clean.slice(0, 2) || "??").toUpperCase();
  }

  function levelClass(level) {
    return level ? `lvl-${Math.max(1, Math.min(10, Math.round(level)))}` : "lvl-1";
  }

  function formatWhen(iso) {
    if (!iso) return "Unknown time";
    try {
      const date = new Date(iso);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins < 60) return `Finished \u00b7 ${Math.max(1, diffMins)}m ago`;
      const diffHours = Math.round(diffMins / 60);
      if (diffHours < 24) return `Finished \u00b7 ${diffHours}h ago`;
      const diffDays = Math.round(diffHours / 24);
      if (diffDays < 30) return `Finished \u00b7 ${diffDays}d ago`;
      return `Finished \u00b7 ${date.toLocaleDateString()}`;
    } catch {
      return "Unknown time";
    }
  }

  function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || seconds < 0) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function statCell(value, decimals) {
    if (value === null || value === undefined) return `<div class="stat-num na">N/A</div>`;
    const display = typeof decimals === "number" ? value.toFixed(decimals) : value;
    return `<div class="stat-num">${display}</div>`;
  }

  function playerRow(player) {
    const kda = `${player.kills ?? "N/A"} / ${player.deaths ?? "N/A"} / ${player.assists ?? "N/A"}`;
    return `
      <div class="roster-row ${player.isMatchMvp ? "mvp-row" : ""}">
        <span class="mvp-star">${player.isMatchMvp ? "\u2605" : ""}</span>
        <div class="player-cell">
          <div class="avatar-wrap">
            <div class="avatar">${player.avatar ? `<img src="${escapeHtml(player.avatar)}" alt="" />` : initials(player.nickname)}</div>
            <div class="lvl-badge ${levelClass(player.skillLevel)}">${player.skillLevel ?? "?"}</div>
          </div>
          <div class="player-names">
            <div class="p-nick">${escapeHtml(player.nickname)}</div>
            <div class="p-sub">${player.skillLevel ? `Level ${player.skillLevel}` : "Level N/A"}</div>
          </div>
        </div>
        <div class="kda-block stat-num">${kda}</div>
        ${statCell(player.adr, 1)}
        ${statCell(player.headshotsPercent !== null ? `${player.headshotsPercent}%` : null)}
        ${statCell(player.mvps)}
      </div>`;
  }

  function teamSection(team, isWin) {
    const rows = team.players.map(playerRow).join("");
    return `
      <div class="team-section fade-up">
        <div class="team-header ${isWin ? "win" : "lose"}">
          <div class="team-header-left">
            <div class="flag-bar"></div>
            <div class="team-header-name">${escapeHtml(team.name)}</div>
          </div>
          <div class="team-header-avgelo">Avg Level: <b>${team.avgSkillLevel ?? "N/A"}</b></div>
        </div>
        <div class="roster-table hud-card">
          <div class="roster-head">
            <span></span>
            <span class="col-player">Player</span>
            <span class="col-num">K/D/A</span>
            <span class="col-num">ADR</span>
            <span class="col-num">HS%</span>
            <span class="col-num">MVPs</span>
          </div>
          ${rows}
        </div>
      </div>`;
  }

  function sumStat(players, key) {
    const values = players.map((p) => p[key]).filter((v) => v !== null && v !== undefined);
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0);
  }
  function avgStat(players, key) {
    const values = players.map((p) => p[key]).filter((v) => v !== null && v !== undefined);
    if (values.length === 0) return null;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }

  function compareBar(labelA, labelB, name) {
    const total = labelA + labelB;
    const pctA = total > 0 ? Math.round((labelA / total) * 100) : 50;
    const pctB = 100 - pctA;
    return `
      <div class="compare-metric">
        <div class="compare-metric-name">${name}</div>
        <div class="compare-labels"><span class="a">${labelA}</span><span class="b">${labelB}</span></div>
        <div class="compare-bar-track">
          <div class="compare-bar-fill-a" data-target="${pctA}"></div>
          <div class="compare-bar-fill-b" data-target="${pctB}"></div>
        </div>
      </div>`;
  }

  function render(summary) {
    const teamAKills = sumStat(summary.teamA.players, "kills");
    const teamBKills = sumStat(summary.teamB.players, "kills");
    const teamAAdr = avgStat(summary.teamA.players, "adr");
    const teamBAdr = avgStat(summary.teamB.players, "adr");
    const teamALevel = summary.teamA.avgSkillLevel;
    const teamBLevel = summary.teamB.avgSkillLevel;

    const duration = formatDuration(summary.durationSeconds);
    const mapLabel = summary.map ? `<b>${escapeHtml(summary.map)}</b>` : "Map unknown";

    const limitationNotices = [];
    if (!summary.adrAvailable) {
      limitationNotices.push("ADR wasn't provided by FACEIT for this match.");
    }
    limitationNotices.push(
      "KAST and per-match ELO change aren't available from FACEIT's public API - see the Player Summary tab's ELO Forecast for overall ELO trend instead.",
    );

    root.innerHTML = `
      <div class="match-hero fade-up hud-card">
        <div class="match-hero-grid"></div>
        <div class="match-meta-row">
          <span class="pill">${escapeHtml(summary.competitionName || "FACEIT match")}</span>
          <span class="pill status-finished">${formatWhen(summary.finishedAt)}</span>
          ${duration ? `<span class="pill">Duration: ${duration}</span>` : "<span></span>"}
        </div>
        <div class="score-row">
          <div class="score-side ${summary.teamA.won ? "win" : "lose"}">
            <div class="team-name">${escapeHtml(summary.teamA.name)}</div>
            <span class="score-num">${summary.teamA.score ?? "-"}</span>
            <div class="team-tag">${summary.teamA.won ? "WINNER" : summary.teamA.won === false ? "LOST" : ""}</div>
          </div>
          <div class="score-sep">:</div>
          <div class="score-side ${summary.teamB.won ? "win" : "lose"}">
            <div class="team-name">${escapeHtml(summary.teamB.name)}</div>
            <span class="score-num">${summary.teamB.score ?? "-"}</span>
            <div class="team-tag">${summary.teamB.won ? "WINNER" : summary.teamB.won === false ? "LOST" : ""}</div>
          </div>
        </div>
        <div class="map-strip">
          <span>${mapLabel}</span>
          ${summary.mvpNickname ? `<span class="dot"></span><span>MVP: <b style="color:var(--accent-orange)">${escapeHtml(summary.mvpNickname)}</b></span>` : ""}
        </div>
      </div>

      <div class="compare-card fade-up hud-card">
        <div class="compare-title">Team Comparison</div>
        ${compareBar(teamALevel ?? 0, teamBLevel ?? 0, "Avg Skill Level")}
        ${compareBar(teamAKills ?? 0, teamBKills ?? 0, "Total Kills")}
        ${teamAAdr !== null || teamBAdr !== null ? compareBar(teamAAdr ?? 0, teamBAdr ?? 0, "Avg ADR") : ""}
      </div>

      ${teamSection(summary.teamA, summary.teamA.won === true)}
      ${teamSection(summary.teamB, summary.teamB.won === true)}

      <div class="ms-notice">${limitationNotices.join(" ")}</div>
    `;

    // Animate comparison bars once, matching match-summary demo timing.
    requestAnimationFrame(() => {
      setTimeout(() => {
        root.querySelectorAll(".compare-bar-fill-a, .compare-bar-fill-b").forEach((el) => {
          el.classList.add("animate");
          el.style.width = `${el.dataset.target}%`;
        });
      }, 300);
    });
  }

  async function load() {
    const p = params();
    const matchId = p.get("matchId");
    const identifier = p.get("identifier") || "-";
    if (!matchId) {
      renderError("Missing match ID", "This window was opened without a match ID to look up.");
      return;
    }

    try {
      const res = await fetch(
        `${MS_BACKEND_URL}/players/${encodeURIComponent(identifier)}/faceit-match-history/${encodeURIComponent(matchId)}`,
      );
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.message) detail = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
        } catch {
          // keep the plain HTTP status detail
        }
        renderError("Couldn't load this match", detail);
        return;
      }
      const summary = await res.json();
      render(summary);
    } catch (err) {
      renderError("Couldn't reach the backend", err?.message || String(err));
    }
  }

  document.title = "Match Summary - CS Tracker";
  load();
})();
