// CS Tracker - "Dodge or Play" tab.
//
// Screens both squads of a FACEIT matchroom for suspected smurf accounts
// and players currently on tilt, then combines those flags with a
// standard Elo-based win estimate into a PLAY/DODGE recommendation.
// All the actual scoring happens on the backend (see
// cs2-overlay-backend PlayersController.dodgeOrPlay() /
// dodge-or-play.util.ts for the full, documented methodology) - this
// file only renders the result in the "case file" investigative-dossier
// style.
//
// Can be reached two ways:
//   1. Directly on this tab: paste a matchroom link, click "Run Analysis".
//   2. From the Overview tab's "FACEIT Matchroom" section - after a
//      successful "Load from Matchroom", a small badge appears there
//      (see launcher.js `loadFromMatchroom()`) that jumps here AND
//      auto-runs the same analysis (see `window.DodgeOrPlay.runFromUrl`).
(function () {
  const DOP_BACKEND_URL = "http://localhost:3000";

  const els = {
    input: document.getElementById("dop-matchroom-input"),
    analyzeBtn: document.getElementById("dop-analyze-btn"),
    status: document.getElementById("dop-status"),
    resultRoot: document.getElementById("dop-result-root"),
  };

  if (!els.input || !els.analyzeBtn || !els.resultRoot) return;

  function renderEmpty(message) {
    els.resultRoot.innerHTML = `<div class="dop-empty-state">${message}</div>`;
  }

  function renderLoading() {
    els.resultRoot.innerHTML = `
      <div class="lookup-loading-state">
        <div class="lookup-spinner"></div>
        <div class="lookup-loading-text">Pulling both squads' FACEIT records...</div>
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

  function initials(name) {
    return String(name || "?").slice(0, 2).toUpperCase();
  }

  function renderSubjectCard(analysis) {
    const p = analysis.profile;
    const name = p.faceit?.nickname || p.nickname || "Unknown";
    const kd = p.stats?.kd != null ? p.stats.kd.toFixed(2) : "N/A";
    const matches = p.stats?.matchesPlayed ?? "N/A";
    const wr = p.stats?.winRate != null ? `${p.stats.winRate}%` : "N/A";

    let stamps = "";
    if (analysis.smurf.suspected) {
      stamps += `<div class="dop-stamp">Suspected Smurf</div>`;
    }
    if (analysis.tilt.onTilt) {
      stamps += `<div class="dop-stamp dop-stamp-tilt">On Tilt</div>`;
    }
    if (!analysis.smurf.suspected && !analysis.tilt.onTilt) {
      stamps = `<div class="dop-stamp dop-stamp-clear">Clear</div>`;
    }

    const notes = [...(analysis.smurf.reasons || []), ...(analysis.tilt.reasons || [])].filter(Boolean);
    const noteHtml = notes.length ? `<div class="dop-subj-note">${notes.join(" ")}</div>` : "";

    return `
      <div class="dop-subject-card">
        <div class="dop-mugshot">${initials(name)}</div>
        <div class="dop-subj-body">
          <div class="dop-subj-name">${name}</div>
          <div class="dop-subj-stats">K/D ${kd} &middot; ${matches} matches &middot; WR ${wr}</div>
          ${noteHtml}
        </div>
        <div class="dop-stamps">${stamps}</div>
      </div>`;
  }

  function renderFolder(label, analyses) {
    if (!analyses || analyses.length === 0) {
      return `
        <div class="dop-folder">
          <div class="dop-folder-tab">${label}</div>
          <div class="dop-subj-note">No players resolved for this squad.</div>
        </div>`;
    }
    return `
      <div class="dop-folder">
        <div class="dop-folder-tab">${label}</div>
        ${analyses.map(renderSubjectCard).join("")}
      </div>`;
  }

  function renderVerdict(result) {
    const v = result.verdict;
    const isDodge = v.recommendation === "DODGE";
    return `
      <div class="dop-verdict-folder">
        <div class="dop-verdict-stamp ${isDodge ? "" : "dop-verdict-clear"}">${v.recommendation}</div>
        <div class="dop-verdict-prob">
          Estimated win probability: <b>${v.winProbabilityPercent}%</b><br>
          <span class="dop-verdict-base">(ELO-only baseline, before smurf/tilt adjustment: ${v.baseWinProbabilityPercent}%)</span>
        </div>
        <div class="dop-verdict-note">${v.summary}</div>
      </div>`;
  }

  function renderResult(result) {
    els.resultRoot.innerHTML = `
      <div class="dop-case-file">
        <div class="dop-case-header">
          <div>
            <div class="dop-case-title">MATCHROOM CASE FILE</div>
            <div class="dop-case-sub">Dodge or Play &middot; Investigation Unit</div>
          </div>
          <div class="dop-case-ref">
            MATCH ${result.matchId}<br>
            ${result.competitionName || "Unknown competition"}
          </div>
        </div>
        <div class="dop-folders">
          ${renderFolder("Own Squad", result.ownTeam)}
          ${renderFolder("Opposing Squad", result.enemyTeam)}
        </div>
        ${renderVerdict(result)}
      </div>
      <div class="dop-methodology">
        <b>How is this calculated?</b> Smurf score weighs low match count
        combined with elite K/D/win rate/headshot % (the classic "skilled
        but fresh account" pattern). Tilt score weighs an active losing
        streak and a dip between lifetime and last-20-match win rate.
        Both use only public FACEIT stats - a probabilistic indicator,
        never a confirmed accusation. Win probability starts from the
        standard Elo expected-score formula (based on average squad ELO),
        then each suspected smurf/tilted player nudges it a few
        percentage points in the appropriate direction. Two or more
        suspected enemy smurfs always recommend DODGE, regardless of the
        number, since match integrity is compromised either way.
      </div>`;
  }

  function setStatus(text, isError) {
    els.status.textContent = text || "";
    els.status.style.color = isError ? "var(--accent-red)" : "";
  }

  async function runAnalysis() {
    const url = els.input.value.trim();
    if (!url) {
      setStatus("Paste a FACEIT matchroom link or match ID first.", true);
      return;
    }
    setStatus("");
    els.analyzeBtn.disabled = true;
    renderLoading();

    try {
      const res = await fetch(`${DOP_BACKEND_URL}/match/dodge-or-play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
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
      const result = await res.json();
      renderResult(result);
    } catch (err) {
      renderErrorState(err?.message || String(err));
    } finally {
      els.analyzeBtn.disabled = false;
    }
  }

  /** Called from launcher.js's "Dodge or Play" quick-access badge (FACEIT Matchroom section, Overview tab) - pre-fills the same link and runs the analysis immediately. */
  function runFromUrl(url) {
    els.input.value = url || "";
    runAnalysis();
  }

  els.analyzeBtn.addEventListener("click", runAnalysis);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runAnalysis();
    }
  });

  renderEmpty("Paste a FACEIT matchroom link above (or jump here from the Overview tab after loading one) to run the analysis.");

  window.DodgeOrPlay = { runFromUrl };
})();
