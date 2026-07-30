// CS Tracker - "Player Summary" tab logic.
// A standalone lookup: type in a FACEIT nickname (or Steam ID), click
// "View Stats", and get a single impressive, full-width summary card -
// rank/ELO, lifetime stats, per-map breakdown, CS Rating, Leetify,
// commendations and recent results - built from the SAME normalized
// PlayerProfile the roster tracker uses (GET /players/:identifier/summary),
// just rendered as one big hero page instead of a multi-row table.
(function () {
  const PS_BACKEND_URL = "http://localhost:3000";
  const PS_LAST_NICKNAME_KEY = "cs-tracker-player-summary-last-nickname";

  const els = {
    input: document.getElementById("ps-nickname-input"),
    lookupBtn: document.getElementById("ps-lookup-btn"),
    status: document.getElementById("ps-status"),
    resultRoot: document.getElementById("ps-result-root"),
  };

  // Guard: this script is only ever loaded on launcher.html, but stay
  // defensive in case the tab markup isn't present for any reason.
  if (!els.input || !els.lookupBtn || !els.resultRoot) return;

  // ---------------------------------------------------------------------
  // Small formatting helpers (mirrors tracker-render.js conventions so the
  // new tab looks/behaves identically to the rest of the app).
  // ---------------------------------------------------------------------
  function fmt(value, suffix = "", naTooltip = "") {
    if (value === null || value === undefined) {
      const tooltip = naTooltip ? ` title="${naTooltip}"` : "";
      return `<span class="na"${tooltip}>N/A</span>`;
    }
    return `${value}${suffix}`;
  }

  function countryFlag(code) {
    if (!code || typeof code !== "string" || code.length !== 2) return "";
    const points = code
      .toUpperCase()
      .split("")
      .map((c) => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...points);
  }

  function levelIconPath(level, elo) {
    // Reuse the roster tracker's own resolver so the level artwork always
    // stays in sync with the rest of the app (falls back to a small local
    // copy of the same logic if tracker-render.js hasn't loaded for some
    // reason - it's loaded just before this file in launcher.html).
    if (window.TrackerRenderer?.levelIconPath) {
      return window.TrackerRenderer.levelIconPath(level, elo);
    }
    if (level && level >= 1 && level <= 10) return `assets/faceit-levels/level${level}.png`;
    return "assets/faceit-levels/unranked.png";
  }

  function renderMembershipBadge(membership) {
    if (membership !== "premium") return "";
    return '<span class="membership-badge" title="FACEIT Premium member">\u2605</span>';
  }

  function renderSafetyRow(steamBans) {
    if (!steamBans) {
      return `<div class="ps-safety-row ps-safety-unknown">
        <span class="ps-safety-icon">?</span>
        <div><div class="ps-safety-title">No public Steam ban data</div>
        <div class="ps-safety-detail">This player's Steam profile may be private, or no Steam ID could be resolved.</div></div>
      </div>`;
    }
    if (steamBans.vacBanned || steamBans.gameBanCount > 0) {
      const detail = steamBans.vacBanned
        ? `VAC banned${steamBans.daysSinceLastBan != null ? ` (${steamBans.daysSinceLastBan} days ago)` : ""}`
        : `${steamBans.gameBanCount} game ban(s) on record`;
      return `<div class="ps-safety-row ps-safety-danger">
        <span class="ps-safety-icon">\u26A0</span>
        <div><div class="ps-safety-title">${detail}</div>
        <div class="ps-safety-detail">Public Steam ban status, via the official GetPlayerBans endpoint.</div></div>
      </div>`;
    }
    return `<div class="ps-safety-row ps-safety-ok">
      <span class="ps-safety-icon">\u2713</span>
      <div><div class="ps-safety-title">No public VAC or game bans</div>
      <div class="ps-safety-detail">Clean public Steam ban record.</div></div>
    </div>`;
  }

  function sumMultiKills(m) {
    const parts = [m.tripleKills, m.quadroKills, m.pentaKills];
    if (parts.every((v) => v === null || v === undefined)) return null;
    return parts.reduce((sum, v) => sum + (v || 0), 0);
  }

  // ---------------------------------------------------------------------
  // Markup builders
  // ---------------------------------------------------------------------
  function buildHeroHtml(profile) {
    const flag = countryFlag(profile.faceit?.country);
    const level = profile.faceit?.level;
    const elo = profile.faceit?.elo;
    const name = profile.faceit?.nickname || profile.nickname || "Unknown";
    const region = profile.faceit?.region ? profile.faceit.region.toUpperCase() : null;

    return `
      <div class="ps-hero-banner">
        <div class="ps-hero-glow"></div>
        <div class="ps-hero-grid-lines"></div>
        <div class="ps-hero-main">
          <div class="ps-avatar-ring">
            <div class="ps-avatar" style="${profile.avatarUrl ? `background-image:url('${profile.avatarUrl}')` : ""}">
              ${profile.avatarUrl ? "" : name.slice(0, 2).toUpperCase()}
            </div>
            <img class="ps-level-badge" src="${levelIconPath(level, elo)}" alt="FACEIT level ${level ?? "?"}" title="FACEIT Level ${level ?? "N/A"}" />
          </div>
          <div class="ps-hero-info">
            <div class="ps-hero-name-row">
              <h1 class="ps-nickname">${name}</h1>
              ${flag ? `<span class="flag-icon" title="${profile.faceit?.country || ""}">${flag}</span>` : ""}
              ${renderMembershipBadge(profile.faceit?.membership)}
            </div>
            <div class="ps-hero-sub">
              ${level ? `FACEIT Level ${level}` : "Unranked"}${region ? ` &middot; ${region} region` : ""}
            </div>
          </div>
          <div class="ps-hero-elo-block">
            <span class="ps-elo-value">${fmt(elo)}</span>
            <span class="ps-elo-label">ELO</span>
          </div>
        </div>
        <div class="ps-hero-footer">
          <span class="ps-hero-updated">Updated ${new Date(profile.lastUpdated).toLocaleString()}</span>
          <button id="ps-refresh-btn" class="secondary-btn">Refresh</button>
        </div>
      </div>`;
  }

  function buildStatsGridHtml(profile) {
    const s = profile.stats || {};
    const tiles = [
      { cls: "blue", label: "K/D Ratio", value: fmt(s.kd) },
      { cls: "green", label: "Win Rate", value: fmt(s.winRate, "%") },
      { cls: "gold", label: "HS%", value: fmt(s.hsPercent, "%") },
      { cls: "violet", label: "ADR", value: fmt(s.adr) },
      { cls: "blue", label: "K/R Ratio", value: fmt(s.krRatio) },
      { cls: "green", label: "Matches Played", value: fmt(s.matchesPlayed) },
      {
        cls: "gold",
        label: "Current Streak",
        value: s.currentWinStreak ? `\u{1F525} ${s.currentWinStreak}` : fmt(s.currentWinStreak),
      },
      { cls: "violet", label: "Longest Streak", value: fmt(s.longestWinStreak) },
    ];
    return `
      <div class="ps-stats-grid">
        ${tiles
          .map(
            (t) => `
          <div class="tile ${t.cls} ps-tile">
            <span class="lbl">${t.label}</span>
            <span class="val">${t.value}</span>
          </div>`,
          )
          .join("")}
      </div>`;
  }

  function buildRecentResultsHtml(profile) {
    const results = profile.recentResults || [];
    const pills = results.length
      ? results
          .map(
            (r) =>
              `<span class="recent-badge ${r === "W" ? "win" : r === "L" ? "loss" : "na"}">${r === "W" ? "W" : r === "L" ? "L" : "?"}</span>`,
          )
          .join("")
      : '<span class="na">No recent match history available</span>';
    return `
      <div class="ps-card">
        <h2>Recent Results</h2>
        <div class="recent-badges ps-recent-badges">${pills}</div>
      </div>`;
  }

  function buildCommendationsHtml(profile) {
    const c = profile.commendations;
    return `
      <div class="ps-card">
        <h2>Commendations</h2>
        <div class="commend-badges">
          <div class="commend-badge friendly"><span class="count">${fmt(c?.friendly)}</span><span class="label">Friendly</span></div>
          <div class="commend-badge leader"><span class="count">${fmt(c?.leader)}</span><span class="label">Leader</span></div>
          <div class="commend-badge skilled"><span class="count">${fmt(c?.skilled)}</span><span class="label">Skilled</span></div>
        </div>
      </div>`;
  }

  function buildRatingCardsHtml(profile) {
    const premier = profile.premier;
    const leetify = profile.leetify;

    const premierHtml = `
      <div class="ps-card">
        <h2>CS Rating <span class="badge-optional">Premier</span></h2>
        <div class="ps-rating-value-row">
          <span class="ps-rating-value">${fmt(premier?.rating, "", "No official public Premier API is available for other players yet")}</span>
          <span class="ps-rating-sub">${fmt(premier?.seasonWins)} season wins</span>
        </div>
      </div>`;

    // Same convention as tracker-render.js: only aim/positioning/utility
    // are genuinely 0-100 (bar-charted, never rescaled), rating/opening
    // are signed delta-style scores shown as plain numbers instead - see
    // Leetify's Developer Guidelines "do not modify our metrics".
    const leetifyBars = leetify
      ? [
          ...["aim", "positioning", "utility"].map((key) => {
            const value = leetify[key];
            const pct = value != null ? Math.max(0, Math.min(100, value)) : 0;
            return `
            <div class="leetify-bar-row">
              <span class="leetify-bar-label">${key}</span>
              <div class="leetify-bar-track"><div class="leetify-bar-fill" style="width:${pct}%"></div></div>
              <span class="leetify-bar-value">${fmt(value)}</span>
            </div>`;
          }),
          ...["rating", "opening"].map((key) => {
            const value = leetify[key];
            return `
            <div class="leetify-plain-row">
              <span class="leetify-bar-label">${key}</span>
              <span class="leetify-bar-value">${fmt(value)}</span>
            </div>`;
          }),
        ].join("")
      : `<div class="leetify-unavailable" title="No official Leetify API key is configured - see the Setup Wizard">
          Leetify data unavailable (no Leetify API key configured - see the Setup Wizard).
        </div>`;

    const leetifyAttributionHtml = leetify
      ? `<a class="leetify-attribution-link" href="https://leetify.com/" target="_blank" rel="noopener">
           <img src="assets/leetify/leetify-badge-black-small.png" alt="Data provided by Leetify" />
         </a>`
      : "";

    const leetifyHtml = `
      <div class="ps-card">
        <h2>Leetify Rating <span class="badge-optional">Optional</span></h2>
        ${leetifyBars}
        ${leetifyAttributionHtml}
      </div>`;

    return `<div class="ps-secondary-grid">${premierHtml}${leetifyHtml}</div>`;
  }

  function buildMapStatsHtml(profile) {
    const mapRows = (profile.faceitMapStats || [])
      .map(
        (m) => `
        <tr>
          <td>${m.map}</td>
          <td>${fmt(m.matches)}</td>
          <td>${fmt(m.winRatePercent, "%")}</td>
          <td>${fmt(m.avgKd)}</td>
          <td>${fmt(m.avgHsPercent, "%")}</td>
          <td>${fmt(m.avgMvps)}</td>
          <td>${fmt(sumMultiKills(m))}</td>
        </tr>`,
      )
      .join("");
    return `
      <div class="ps-card ps-map-card">
        <h2>Map Breakdown <span class="badge-optional">FACEIT</span></h2>
        <table class="map-stats-table">
          <thead>
            <tr><th>Map</th><th>M</th><th>WR</th><th>KD</th><th>HS%</th><th title="Average MVPs per match">MVP</th><th title="Combined 3k/4k/5k multi-kills">Multi-K</th></tr>
          </thead>
          <tbody>${mapRows || '<tr><td colspan="7" class="na">No per-map breakdown available</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  function buildSafetyHtml(profile) {
    return `
      <div class="ps-card">
        <h2>Account Safety <span class="badge-optional">Steam</span></h2>
        ${renderSafetyRow(profile.steamBans)}
      </div>`;
  }

  function renderProfile(profile) {
    els.resultRoot.innerHTML =
      buildHeroHtml(profile) +
      buildStatsGridHtml(profile) +
      `<div class="ps-secondary-grid">${buildRecentResultsHtml(profile)}${buildCommendationsHtml(profile)}</div>` +
      buildRatingCardsHtml(profile) +
      buildMapStatsHtml(profile) +
      buildSafetyHtml(profile);

    const refreshBtn = document.getElementById("ps-refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        const nickname = els.input.value.trim();
        if (nickname) lookupPlayer(nickname);
      });
    }
  }

  function renderLoading(nickname) {
    els.resultRoot.innerHTML = `
      <div class="lookup-loading-state">
        <div class="lookup-spinner"></div>
        <div class="lookup-loading-text">Looking up ${nickname}...</div>
      </div>`;
  }

  function renderError(message) {
    els.resultRoot.innerHTML = `
      <div class="lookup-error-state">
        <div class="lookup-error-title">\u26A0 Lookup failed</div>
        <div class="lookup-error-detail">${message || "Unknown error."}</div>
        <div class="lookup-error-hint">
          Check that the backend is running and reachable, and that your
          FACEIT API key is configured correctly (Setup &amp; GSI tab).
        </div>
      </div>`;
  }

  function setStatus(text, isError) {
    if (!els.status) return;
    els.status.textContent = text || "";
    els.status.style.color = isError ? "var(--accent-red)" : "";
  }

  async function lookupPlayer(nicknameRaw) {
    const nickname = (nicknameRaw || "").trim();
    if (!nickname) {
      setStatus("Enter a FACEIT nickname first.", true);
      return;
    }
    setStatus("");
    renderLoading(nickname);
    try {
      localStorage.setItem(PS_LAST_NICKNAME_KEY, nickname);
    } catch (e) {
      // localStorage can fail in some sandboxed contexts - non-fatal.
    }

    try {
      const res = await fetch(`${PS_BACKEND_URL}/players/${encodeURIComponent(nickname)}/summary`);
      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }
      const profile = await res.json();
      if (!profile || (!profile.faceit && !profile.stats)) {
        renderError(`No FACEIT profile found for "${nickname}".`);
        return;
      }
      renderProfile(profile);
      // The "ELO Forecast" and "Map Pool Radar" cards mirror whichever
      // nickname is currently shown here - see elo-forecast.js /
      // map-pool-radar.js for the actual fetch/render.
      window.EloForecast?.load(nickname);
      window.MapPoolRadar?.load(nickname);
      // "Recent Form" is GSI-free and already included in this SAME
      // profile response (profile.recentForm) - no extra fetch needed,
      // see recent-form.js.
      window.RecentForm?.render(profile.recentForm, nickname);
      // "FACEIT Match History" - unlike Recent Form, this needs its OWN
      // fetch (a dedicated match-list endpoint, not part of the summary
      // response) - see faceit-match-history.js.
      window.FaceitMatchHistory?.load(nickname);
    } catch (err) {
      renderError(err?.message || String(err));
    }
  }

  els.lookupBtn.addEventListener("click", () => lookupPlayer(els.input.value));
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") lookupPlayer(els.input.value);
  });

  /**
   * "Bejelentkezés FACEIT-tel / Steammel" (AuthModule) - if the user has
   * linked their own FACEIT and/or Steam account (Account tab) and has
   * never manually searched anyone on THIS tab before (no
   * `PS_LAST_NICKNAME_KEY` in localStorage), automatically pre-fill AND
   * run the lookup for their OWN profile - so "my own stats" appear
   * immediately without ever having to type their own nickname in. A
   * manual search always takes priority and is remembered afterwards
   * (see the existing `PS_LAST_NICKNAME_KEY` prefill below), so this
   * only ever fires ONCE, the very first time, and never overrides a
   * deliberate later search for someone else.
   */
  async function autoLoadFromLinkedAccount() {
    try {
      const res = await fetch(`${PS_BACKEND_URL}/auth/status`);
      if (!res.ok) return;
      const status = await res.json();
      // Prefer FACEIT's nickname (this tab's lookup is FACEIT-nickname-
      // shaped) - fall back to the linked Steam account via the
      // `steam:`-forced-source prefix (see PlayersService.getSummary())
      // when only Steam is linked.
      const identifier = status.faceit?.displayName
        ? status.faceit.displayName
        : status.steam?.providerUserId
          ? `steam:${status.steam.providerUserId}`
          : null;
      if (!identifier) return;
      els.input.value = identifier;
      lookupPlayer(identifier);
    } catch (err) {
      console.warn("Auto-loading Player Summary from the linked account failed:", err);
    }
  }

  // Prefill (but don't auto-fetch) the last nickname searched, so
  // switching tabs and coming back doesn't lose your place. If nothing
  // was ever searched before, fall back to auto-loading the linked
  // FACEIT/Steam account's own profile instead (see above).
  let hadPreviousSearch = false;
  try {
    const last = localStorage.getItem(PS_LAST_NICKNAME_KEY);
    if (last) {
      els.input.value = last;
      hadPreviousSearch = true;
    }
  } catch (e) {
    // ignore
  }
  if (!hadPreviousSearch) {
    autoLoadFromLinkedAccount();
  }
})();
