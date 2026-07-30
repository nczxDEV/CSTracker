// Shared tracker rendering module.
//
// Extracted so the SAME rendering logic can be mounted either in the
// transparent overlay window (index.html/app.js) OR inline inside the
// Control Panel window (launcher.html/launcher.js) when "FACEIT Mode" is
// enabled - see launcher.js for the rationale (avoiding any always-on-top
// overlay window while playing on FACEIT, as a precaution against
// anti-cheat false positives).
//
// createTracker() returns an independent, stateful tracker instance bound
// to a given root element - multiple instances can coexist on the same
// page without interfering with each other.

(function () {
  /**
   * Official FACEIT CS2 Elo -> skill level thresholds (support.faceit.com
   * "FACEIT CS2 Elo and skill levels"). Used (a) as a fallback for real
   * profiles that only have an Elo value without an explicit level (see
   * `levelIconPath` below), and (b) to auto-derive the level for the
   * built-in mock/demo profiles (see `buildMockProfile`), so a demo
   * profile's displayed level can never drift out of sync with its Elo.
   */
  const FACEIT_LEVEL_THRESHOLDS = [
    { level: 10, min: 2001 },
    { level: 9, min: 1751 },
    { level: 8, min: 1531 },
    { level: 7, min: 1351 },
    { level: 6, min: 1201 },
    { level: 5, min: 1051 },
    { level: 4, min: 901 },
    { level: 3, min: 751 },
    { level: 2, min: 501 },
    { level: 1, min: 100 },
  ];

  function levelFromElo(elo) {
    if (elo === null || elo === undefined) return null;
    const match = FACEIT_LEVEL_THRESHOLDS.find((t) => elo >= t.min);
    return match ? match.level : null;
  }

  function buildMockProfile(overrides) {
    const merged = Object.assign(
      {
        steamId: null,
        nickname: "player",
        avatarUrl: null,
        faceit: { nickname: "player", elo: 1500, region: "EU" },
        stats: { kd: 1.0, adr: 75, hsPercent: 45, winRate: 50, matchesPlayed: 100 },
        faceitMapStats: [
          { map: "de_mirage", matches: 40, winRatePercent: 55, avgKd: 1.1, avgHsPercent: 48 },
          { map: "de_inferno", matches: 30, winRatePercent: 47, avgKd: 0.95, avgHsPercent: 42 },
          { map: "de_ancient", matches: 20, winRatePercent: 60, avgKd: 1.2, avgHsPercent: 50 },
        ],
        premier: null,
        leetify: null,
        commendations: null,
        recentResults: null,
        steamBans: { vacBanned: false, gameBanCount: 0, daysSinceLastBan: null, communityBanned: false },
        sources: ["faceit-api", "faceit-stats-api"],
      },
      overrides,
    );

    // Always DERIVE the demo profile's FACEIT skill level from its Elo,
    // using the official brackets above - this used to be a separately
    // hand-maintained "level" field per profile below, which had drifted
    // out of sync with reality for several entries (e.g. a profile with
    // 2212 Elo incorrectly showing "Level 6" instead of the correct
    // "Level 10" per FACEIT's official brackets). Deriving it here makes
    // that entire class of bug structurally impossible going forward.
    if (merged.faceit) {
      merged.faceit = { ...merged.faceit, level: levelFromElo(merged.faceit.elo) };
    }

    return merged;
  }

  const MOCK_PROFILES = [
    buildMockProfile({
      steamId: "76561198000000001",
      nickname: "shibe",
      faceit: { nickname: "shibe", elo: 1310, region: "EU" },
      stats: { kd: 0.9, adr: 65, hsPercent: 38, winRate: 35, matchesPlayed: 17 },
      premier: { rating: 12500, seasonWins: 8 },
      commendations: { friendly: 12, leader: 3, skilled: 20 },
      recentResults: ["W", "W", "L", "W", "L"],
    }),
    buildMockProfile({
      steamId: "76561198000000002",
      nickname: "Sapmi_",
      faceit: { nickname: "Sapmi_", elo: 1189, region: "EU" },
      stats: { kd: 1.57, adr: 94, hsPercent: 55, winRate: 60, matchesPlayed: 113 },
      leetify: { rating: 1.8, aim: 2.1, positioning: 1.6, utility: 1.4, opening: 1.9 },
    }),
    buildMockProfile({
      steamId: "76561198000000003",
      nickname: "chief",
      faceit: { nickname: "chief", elo: 1351, region: "EU" },
      stats: { kd: 1.13, adr: 78, hsPercent: 50, winRate: 35, matchesPlayed: 17 },
      commendations: { friendly: 40, leader: 15, skilled: 22 },
    }),
    buildMockProfile({
      steamId: "76561198000000004",
      nickname: "rinkebypeaksad",
      faceit: { nickname: "rinkebypeaksad", elo: 1101, region: "EU" },
      stats: { kd: 1.22, adr: 82, hsPercent: 60, winRate: 67, matchesPlayed: 73 },
      premier: { rating: 18700, seasonWins: 22 },
    }),
    buildMockProfile({
      steamId: "76561198000000005",
      nickname: "head",
      faceit: { nickname: "head", elo: 5425, region: "EU" },
      stats: { kd: 1.1, adr: 88, hsPercent: 58, winRate: 50, matchesPlayed: 167 },
      leetify: { rating: 2.6, aim: 2.8, positioning: 2.4, utility: 2.1, opening: 2.7 },
      commendations: { friendly: 200, leader: 90, skilled: 410 },
      premier: { rating: 26800, seasonWins: 61 },
    }),
    buildMockProfile({
      steamId: "76561198000000006",
      nickname: "WIN",
      faceit: { nickname: "WIN", elo: 2421, region: "EU" },
      stats: { kd: 0.9, adr: 70, hsPercent: 40, winRate: 49, matchesPlayed: 243 },
      steamBans: { vacBanned: true, gameBanCount: 1, daysSinceLastBan: 220, communityBanned: false },
    }),
    buildMockProfile({
      steamId: "76561198000000007",
      nickname: "AiZE...",
      faceit: { nickname: "AiZE...", elo: 2230, region: "EU" },
      stats: { kd: 0.82, adr: 68, hsPercent: 39, winRate: 49, matchesPlayed: 149 },
    }),
    buildMockProfile({
      steamId: "76561198000000008",
      nickname: "JAYCY164",
      faceit: { nickname: "JAYCY164", elo: 2212, region: "EU" },
      stats: { kd: 1.33, adr: 90, hsPercent: 52, winRate: 48, matchesPlayed: 87 },
    }),
    buildMockProfile({
      steamId: "76561198000000009",
      nickname: "Exii...",
      faceit: { nickname: "Exii...", elo: 2349, region: "EU" },
      stats: { kd: 1.11, adr: 79, hsPercent: 46, winRate: 52, matchesPlayed: 199 },
    }),
    buildMockProfile({
      steamId: "76561198000000010",
      nickname: "jengelke63",
      faceit: { nickname: "jengelke63", elo: 1211, region: "EU" },
      stats: { kd: 0.51, adr: 55, hsPercent: 30, winRate: 55, matchesPlayed: 33 },
    }),
  ];

  /**
   * Resolves the FACEIT rank icon image for a given skill level (1-10),
   * falling back to `elo`-derived level, then "unranked" if neither is
   * available. Icons are the official-style FACEIT level badges shipped
   * in assets/faceit-levels/ (levelN.png / unranked.png).
   */
  function levelIconPath(level, elo) {
    const resolved = level ?? levelFromElo(elo);
    if (resolved === null || resolved === undefined || resolved < 1 || resolved > 10) {
      return "assets/faceit-levels/unranked.png";
    }
    return `assets/faceit-levels/level${resolved}.png`;
  }

  function fmt(value, suffix = "", naTooltip = "") {
    if (value === null || value === undefined) {
      const tooltip = naTooltip ? ` title="${naTooltip}"` : "";
      return `<span class="na"${tooltip}>N/A</span>`;
    }
    return `${value}${suffix}`;
  }

  function fmtPlain(value, decimals = 0) {
    if (value === null || value === undefined) return "N/A";
    return value.toFixed(decimals);
  }

  function average(values) {
    const filtered = values.filter((v) => v !== null && v !== undefined);
    if (filtered.length === 0) return null;
    return filtered.reduce((a, b) => a + b, 0) / filtered.length;
  }

  function playerIdentifier(profile) {
    return profile.steamId || profile.faceit?.nickname || profile.nickname || "unknown";
  }

  /** Converts an ISO 3166-1 alpha-2 country code into a flag emoji (regional indicator symbols). */
  function countryFlag(code) {
    if (!code || typeof code !== "string" || code.length !== 2) return "";
    const points = code
      .toUpperCase()
      .split("")
      .map((c) => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...points);
  }

  function renderMembershipBadge(membership) {
    if (membership !== "premium") return "";
    return '<span class="membership-badge" title="FACEIT Premium member">\u2605</span>';
  }

  // ---------------------------------------------------------------------
  // Configurable stat columns - which of these render depends on the
  // user's "Display" settings (settings-store.js DEFAULT_SETTINGS.visibleColumns),
  // set in the Control Panel. "rank"/"chevron" columns are always shown;
  // the player name column is handled separately (not toggleable).
  // ---------------------------------------------------------------------
  const COLUMN_DEFS = [
    {
      key: "rank",
      label: "RANK",
      flex: 0.75,
      render: (p) => `
        <div class="rank-badge">
          <img class="rank-icon-img" src="${levelIconPath(p.faceit?.level, p.faceit?.elo)}" alt="FACEIT level ${p.faceit?.level ?? "?"}" />
          ${fmt(p.faceit?.elo)}
        </div>`,
    },
    { key: "level", label: "LEVEL", flex: 0.55, render: (p) => fmt(p.faceit?.level) },
    { key: "matches", label: "MATCHES", flex: 0.65, render: (p) => fmt(p.stats?.matchesPlayed) },
    {
      key: "kd",
      label: "KD",
      flex: 0.6,
      render: (p) => fmt(p.stats?.kd),
      cellClass: (p) => (p.stats?.kd >= 1 ? "stat-kd-good" : p.stats?.kd != null ? "stat-kd-bad" : ""),
    },
    { key: "kr", label: "K/R", flex: 0.55, render: (p) => fmt(p.stats?.krRatio) },
    { key: "wr", label: "WR", flex: 0.55, render: (p) => fmt(p.stats?.winRate, "%") },
    {
      key: "csrating",
      label: "CS RATING",
      flex: 0.75,
      render: (p) =>
        fmt(p.premier?.rating, "", "CS Rating: no official public Premier API is available for other players yet"),
    },
    {
      key: "leetify",
      label: "LEETIFY",
      flex: 0.65,
      render: (p) => fmt(p.leetify?.rating, "", "Leetify: no official public API is configured (see Setup Wizard)"),
    },
    { key: "hs", label: "HS%", flex: 0.55, render: (p) => fmt(p.stats?.hsPercent, "%") },
  ];

  function activeColumns() {
    const settings = window.OverlaySettingsStore?.loadSettings?.() || {};
    const defaultCols = window.OverlaySettingsStore?.DEFAULT_SETTINGS?.visibleColumns;
    const keys = settings.visibleColumns || defaultCols || COLUMN_DEFS.map((c) => c.key);
    const byKey = new Map(COLUMN_DEFS.map((c) => [c.key, c]));
    return keys.map((k) => byKey.get(k)).filter(Boolean);
  }

  function rowGridTemplate(columns) {
    return `1.6fr ${columns.map((c) => `${c.flex}fr`).join(" ")} 24px`;
  }

  /** Sums the 3k/4k/5k multi-kill counters for a map segment, staying N/A if all three are missing. */
  function sumMultiKills(mapStat) {
    const parts = [mapStat.tripleKills, mapStat.quadroKills, mapStat.pentaKills];
    if (parts.every((v) => v === null || v === undefined)) return null;
    return parts.reduce((sum, v) => sum + (v || 0), 0);
  }

  function renderSafetyBadge(steamBans) {
    if (!steamBans) {
      return '<span class="safety-badge safety-unknown" title="No public Steam ban data available">?</span>';
    }
    if (steamBans.vacBanned || steamBans.gameBanCount > 0) {
      const detail = steamBans.vacBanned
        ? `VAC banned${steamBans.daysSinceLastBan != null ? ` (${steamBans.daysSinceLastBan}d ago)` : ""}`
        : `${steamBans.gameBanCount} game ban(s)`;
      return `<span class="safety-badge safety-danger" title="${detail}">\u26A0</span>`;
    }
    return '<span class="safety-badge safety-ok" title="No public VAC/game bans">\u2713</span>';
  }

  /** "Strongest/weakest link" team insight, based on K/D ratio. */
  function findStrongestWeakest(profiles) {
    const withKd = profiles
      .map((p) => ({ name: p.nickname || p.faceit?.nickname || "?", kd: p.stats?.kd }))
      .filter((p) => p.kd !== null && p.kd !== undefined);
    if (withKd.length === 0) return { strongest: null, weakest: null };
    const sorted = [...withKd].sort((a, b) => b.kd - a.kd);
    return { strongest: sorted[0].name, weakest: sorted[sorted.length - 1].name };
  }

  /**
   * Creates an independent tracker instance bound to `rootId`.
   * @param {string} rootId - id of the container element to render into.
   */
  function createTracker(rootId) {
    const trackerState = {
      profiles: [],
      expanded: new Set(),
      compactView: Boolean(window.OverlaySettingsStore?.loadSettings?.()?.defaultCompactView),
      // Marks whether the currently-shown profiles are the built-in
      // sample/demo data (e.g. the initial view on startup, or clicking
      // "Look Up" with an empty roster field) rather than a real
      // resolved lookup - see the "DEMO DATA" banner in render() below.
      // Distinguishing these clearly (instead of silently substituting
      // demo data whenever a REAL search happens to fail) is what
      // prevents a failed lookup from being mistaken for a working one.
      isDemo: false,
    };

    function renderPlayerRow(profile, columns) {
      const id = playerIdentifier(profile);
      const isExpanded = trackerState.expanded.has(id);
      const flag = countryFlag(profile.faceit?.country);

      const cellsHtml = columns
        .map((col) => {
          const cls = col.cellClass ? col.cellClass(profile) : "";
          return `<div class="cell ${cls}">${col.render(profile)}</div>`;
        })
        .join("");

      const rowHtml = `
        <div class="row player-row ${isExpanded ? "expanded" : ""}" data-id="${id}" style="grid-template-columns:${rowGridTemplate(columns)}">
          <div class="cell player-cell">
            <div class="avatar" style="${profile.avatarUrl ? `background-image:url('${profile.avatarUrl}')` : ""}">
              ${profile.avatarUrl ? "" : (profile.nickname || "?").slice(0, 2).toUpperCase()}
            </div>
            <span class="online-dot"></span>
            ${flag ? `<span class="flag-icon" title="${profile.faceit?.country || ""}">${flag}</span>` : ""}
            <span class="player-name" data-save-id="${id}" title="Click to save to the saved players list (notes can be added there)">${profile.nickname || profile.faceit?.nickname || "Unknown"}</span>
            ${renderMembershipBadge(profile.faceit?.membership)}
            ${renderSafetyBadge(profile.steamBans)}
          </div>
          ${cellsHtml}
          <div class="cell chevron">\u25B8</div>
        </div>
      `;

      const detailHtml = isExpanded ? renderDetailPanel(profile) : "";
      return rowHtml + detailHtml;
    }

    function renderDetailPanel(profile) {
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

      const stats = profile.stats;
      const streakHtml = `
        <div class="performance-grid">
          <div class="perf-stat">
            <span class="perf-value">${fmt(stats?.krRatio)}</span>
            <span class="perf-label">K/R Ratio</span>
          </div>
          <div class="perf-stat">
            <span class="perf-value">${fmt(stats?.totalHeadshots)}</span>
            <span class="perf-label">Total HS</span>
          </div>
          <div class="perf-stat">
            <span class="perf-value streak-value">${stats?.currentWinStreak ? `\u{1F525} ${stats.currentWinStreak}` : fmt(stats?.currentWinStreak)}</span>
            <span class="perf-label">Current Streak</span>
          </div>
          <div class="perf-stat">
            <span class="perf-value">${fmt(stats?.longestWinStreak)}</span>
            <span class="perf-label">Longest Streak</span>
          </div>
        </div>`;

      // Leetify metrics are shown EXACTLY as their official API returns
      // them (per Leetify's Developer Guidelines "do not modify our
      // metrics") - only "aim"/"positioning"/"utility" are genuinely on
      // a 0-100 scale (bar-charted accordingly, pct === value, never
      // rescaled), "rating"/"opening" are signed delta-style scores on a
      // totally different range and are shown as plain +/- numbers
      // instead, never bar-charted alongside the 0-100 dimensions.
      const leetifyHtml = profile.leetify
        ? [
            ...["aim", "positioning", "utility"].map((key) => {
              const value = profile.leetify[key];
              const pct = value != null ? Math.max(0, Math.min(100, value)) : 0;
              return `
              <div class="leetify-bar-row">
                <span class="leetify-bar-label">${key}</span>
                <div class="leetify-bar-track"><div class="leetify-bar-fill" style="width:${pct}%"></div></div>
                <span class="leetify-bar-value">${fmt(value)}</span>
              </div>`;
            }),
            ...["rating", "opening"].map((key) => {
              const value = profile.leetify[key];
              return `
              <div class="leetify-plain-row">
                <span class="leetify-bar-label">${key}</span>
                <span class="leetify-bar-value">${fmt(value)}</span>
              </div>`;
            }),
          ].join("")
        : `<div class="leetify-unavailable" title="No official Leetify API key is configured - see the Setup Wizard">
            Leetify data unavailable (no Leetify API key configured -
            see the Setup Wizard).
          </div>`;
      const leetifyAttributionHtml = profile.leetify
        ? `<a class="leetify-attribution-link" href="https://leetify.com/" target="_blank" rel="noopener">
             <img src="assets/leetify/leetify-badge-black-small.png" alt="Data provided by Leetify" />
           </a>`
        : "";

      const commend = profile.commendations;
      const commendHtml = `
        <div class="commend-badges">
          <div class="commend-badge friendly">
            <span class="count">${commend?.friendly ?? "N/A"}</span>
            <span class="label">Friendly</span>
          </div>
          <div class="commend-badge leader">
            <span class="count">${commend?.leader ?? "N/A"}</span>
            <span class="label">Leader</span>
          </div>
          <div class="commend-badge skilled">
            <span class="count">${commend?.skilled ?? "N/A"}</span>
            <span class="label">Skilled</span>
          </div>
        </div>`;

      const bans = profile.steamBans;
      const safetyDetailHtml = `
        <div class="safety-detail">
          ${
            bans
              ? `
                <div class="safety-row"><span class="label">VAC Banned</span><span class="value">${bans.vacBanned ? "Yes" : "No"}</span></div>
                <div class="safety-row"><span class="label">Game Bans</span><span class="value">${bans.gameBanCount}</span></div>
                <div class="safety-row"><span class="label">Community Banned</span><span class="value">${bans.communityBanned ? "Yes" : "No"}</span></div>
                ${bans.daysSinceLastBan != null ? `<div class="safety-row"><span class="label">Days Since Last Ban</span><span class="value">${bans.daysSinceLastBan}</span></div>` : ""}
              `
              : '<div class="na">No public Steam ban data available.</div>'
          }
        </div>`;

      return `
        <div class="detail-panel">
          <div class="detail-section">
            <h4>Faceit Stats In Detail</h4>
            <table class="map-stats-table">
              <thead>
                <tr><th>Map</th><th>M</th><th>WR</th><th>KD</th><th>HS%</th><th title="Average MVPs per match">MVP</th><th title="Combined 3k/4k/5k multi-kills">Multi-K</th></tr>
              </thead>
              <tbody>${mapRows || '<tr><td colspan="7" class="na">No per-map breakdown available</td></tr>'}</tbody>
            </table>
            <div class="cs-rating-manual">
              CS Rating: ${fmt(profile.premier?.rating)}
              ${profile.premier ? "" : '<span title="Can be entered manually since there is no official public Premier API">(can be entered manually)</span>'}
            </div>
          </div>
          <div class="detail-section">
            <h4>Performance</h4>
            ${streakHtml}
          </div>
          <div class="detail-section">
            <h4>Leetify Ratings</h4>
            ${leetifyHtml}
            ${leetifyAttributionHtml}
          </div>
          <div class="detail-section">
            <h4>Safety</h4>
            ${safetyDetailHtml}
          </div>
          <div class="detail-section">
            <h4>Commendations</h4>
            ${commendHtml}
            <div class="save-hint">
              Click the player's name above to add a note in the saved players list.
            </div>
          </div>
        </div>
      `;
    }

    function renderCompactTeamBlock(teamLabel, teamClass, profiles, averages) {
      const { strongest, weakest } = findStrongestWeakest(profiles);

      const pills = profiles
        .map((p) => {
          const name = p.nickname || p.faceit?.nickname || "Unknown";
          const kd = p.stats?.kd;
          const kdClass = kd >= 1 ? "stat-kd-good" : kd != null ? "stat-kd-bad" : "";
          return `<span class="compact-pill" title="${name} - K/D ${fmt(kd)}">
            <span class="compact-pill-name">${name}</span>
            <span class="compact-pill-kd ${kdClass}">${fmt(kd)}</span>
          </span>`;
        })
        .join("");

      return `
        <div class="team-block compact ${teamClass}">
          <div class="team-accent">${teamLabel}</div>
          <div class="compact-pills">${pills}</div>
          <div class="compact-summary">
            <span>AVG KD <b>${fmtPlain(averages.avgKd, 2)}</b></span>
            <span>AVG WR <b>${fmtPlain(averages.avgWr, 1)}%</b></span>
            ${strongest ? `<span class="link-strongest" title="Highest K/D on the team">\u2191 ${strongest}</span>` : ""}
            ${weakest ? `<span class="link-weakest" title="Lowest K/D on the team">\u2193 ${weakest}</span>` : ""}
          </div>
        </div>
      `;
    }

    function renderTeamBlock(teamLabel, teamClass, profiles) {
      if (profiles.length === 0) return "";

      const avgKd = average(profiles.map((p) => p.stats?.kd));
      const avgWr = average(profiles.map((p) => p.stats?.winRate));
      const avgMatches = average(profiles.map((p) => p.stats?.matchesPlayed));

      if (trackerState.compactView) {
        return renderCompactTeamBlock(teamLabel, teamClass, profiles, { avgKd, avgWr, avgMatches });
      }

      const columns = activeColumns();
      const headerCellsHtml = columns.map((c) => `<div>${c.label}</div>`).join("");

      return `
        <div class="team-block ${teamClass}">
          <div class="team-accent">${teamLabel}</div>
          <div class="team-table">
            <div class="row header-row" style="grid-template-columns:${rowGridTemplate(columns)}">
              <div>PLAYER</div>${headerCellsHtml}<div></div>
            </div>
            ${profiles.map((p) => renderPlayerRow(p, columns)).join("")}
          </div>
        </div>
        <div class="avg-strip">
          <div class="avg-box blue"><span class="value">${fmtPlain(avgMatches)}</span>AVG MATCHES</div>
          <div class="avg-box blue"><span class="value">${fmtPlain(avgKd, 2)}</span>AVG KD</div>
          <div class="avg-box orange"><span class="value">${fmtPlain(avgWr, 1)}%</span>AVG WR</div>
        </div>
      `;
    }

    /**
     * "Team Strength" prediction - a rough HEURISTIC estimate (explicitly
     * NOT a guarantee) of each team's relative win chance.
     *
     * Method: each team's average ELO is adjusted by how far its average
     * K/D and win rate deviate from a "neutral" baseline (K/D 1.0, WR
     * 50%), producing an "effective rating". The two teams' effective
     * ratings are then compared using the same expected-score formula
     * chess/ELO systems use (`1 / (1 + 10^(diff/400))`), which maps a
     * rating difference to a win probability. The result is clamped to
     * 5-95% so the UI never claims false certainty either way.
     *
     * This is intentionally simple and transparent (no ML/black box) -
     * it's meant as a fun, rough indicator, not a serious prediction
     * model. The UI always pairs it with a visible disclaimer.
     */
    function computeTeamRating(profiles) {
      const elos = profiles.map((p) => p.faceit?.elo).filter((v) => v !== null && v !== undefined);
      const kds = profiles.map((p) => p.stats?.kd).filter((v) => v !== null && v !== undefined);
      const wrs = profiles.map((p) => p.stats?.winRate).filter((v) => v !== null && v !== undefined);
      if (elos.length === 0 && kds.length === 0 && wrs.length === 0) return null;

      const avgElo = elos.length ? average(elos) : 1200; // neutral baseline ELO if unknown
      const avgKd = kds.length ? average(kds) : 1;
      const avgWr = wrs.length ? average(wrs) : 50;

      return avgElo + (avgKd - 1) * 300 + (avgWr - 50) * 5;
    }

    function computeWinProbability(teamA, teamB) {
      const ratingA = computeTeamRating(teamA);
      const ratingB = computeTeamRating(teamB);
      if (ratingA === null || ratingB === null) return null;

      const rawProbA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
      const probA = Math.min(0.95, Math.max(0.05, rawProbA));
      return { probA, probB: 1 - probA };
    }

    function renderWinProbability(teamA, teamB) {
      const settings = window.OverlaySettingsStore?.loadSettings?.() || {};
      if (settings.showWinProbability === false) return "";
      if (teamA.length === 0 || teamB.length === 0) return "";

      const probability = computeWinProbability(teamA, teamB);
      if (!probability) return "";

      const pctA = Math.round(probability.probA * 100);
      const pctB = 100 - pctA;

      return `
        <div class="win-probability">
          <div class="win-prob-header">
            <span class="win-prob-title">Team Strength (estimate)</span>
          </div>
          <div class="win-prob-bar">
            <div class="win-prob-fill win-prob-a" style="width:${pctA}%"><span>${pctA}%</span></div>
            <div class="win-prob-fill win-prob-b" style="width:${pctB}%"><span>${pctB}%</span></div>
          </div>
          <div class="win-prob-disclaimer">
            Rough estimate based on average ELO/K-D/win rate - NOT a guarantee.
          </div>
        </div>`;
    }

    /**
     * Team-vs-team comparison bar - shown above the two team blocks (when
     * both teams have at least one player, and the "Display" setting
     * `showTeamComparison` is on). Compares average ELO/K-D/Win Rate and
     * highlights which team currently leads on each metric.
     */
    function renderComparisonBar(teamA, teamB) {
      const settings = window.OverlaySettingsStore?.loadSettings?.() || {};
      if (settings.showTeamComparison === false) return "";
      if (teamA.length === 0 || teamB.length === 0) return "";

      const metrics = [
        { key: "elo", label: "ELO", get: (p) => p.faceit?.elo, decimals: 0 },
        { key: "kd", label: "K/D", get: (p) => p.stats?.kd, decimals: 2 },
        { key: "wr", label: "WIN RATE", get: (p) => p.stats?.winRate, decimals: 1, suffix: "%" },
      ];

      const rows = metrics
        .map((m) => {
          const a = average(teamA.map(m.get));
          const b = average(teamB.map(m.get));
          let aLeads = false;
          let bLeads = false;
          if (a !== null && b !== null && a !== b) {
            aLeads = a > b;
            bLeads = b > a;
          }
          const suffix = m.suffix || "";
          return `
            <div class="compare-row">
              <span class="compare-value compare-a ${aLeads ? "compare-lead" : ""}">${fmtPlain(a, m.decimals)}${a != null ? suffix : ""}</span>
              <span class="compare-label">${m.label}</span>
              <span class="compare-value compare-b ${bLeads ? "compare-lead" : ""}">${fmtPlain(b, m.decimals)}${b != null ? suffix : ""}</span>
            </div>`;
        })
        .join("");

      return `
        <div class="team-compare-bar">
          <div class="compare-header">
            <span class="compare-team-tag team-a-tag">TEAM A</span>
            <span class="compare-vs">VS</span>
            <span class="compare-team-tag team-b-tag">TEAM B</span>
          </div>
          ${rows}
        </div>`;
    }

    function attachRowHandlers(root) {
      root.querySelectorAll(".row.player-row").forEach((row) => {
        row.addEventListener("click", () => {
          const id = row.getAttribute("data-id");
          if (trackerState.expanded.has(id)) {
            trackerState.expanded.delete(id);
          } else {
            trackerState.expanded.add(id);
          }
          render();
        });
      });
    }

    function attachSaveHandlers(root) {
      root.querySelectorAll(".player-name[data-save-id]").forEach((nameEl) => {
        nameEl.addEventListener("click", async (e) => {
          e.stopPropagation(); // don't also toggle the row's detail panel
          if (nameEl.classList.contains("saving")) return;

          nameEl.classList.add("saving");
          const identifier = nameEl.getAttribute("data-save-id");
          const result = window.SavedPlayersClient
            ? await window.SavedPlayersClient.savePlayer(identifier)
            : null;
          nameEl.classList.remove("saving");
          nameEl.classList.add(result ? "saved-flash" : "save-failed-flash");
          setTimeout(() => {
            nameEl.classList.remove("saved-flash", "save-failed-flash");
          }, 1400);
        });
      });
    }

    function render() {
      const root = document.getElementById(rootId);
      if (!root) return;

      if (trackerState.profiles.length === 0) {
        root.innerHTML = `<div class="empty-state">
          Enter up to 10 players above, then click <b>Look Up</b>,
          or open the demo view with the sample data below.
        </div>`;
        return;
      }

      const teamA = trackerState.profiles.slice(0, 5);
      const teamB = trackerState.profiles.slice(5, 10);

      // Unmissable banner whenever sample/demo data is being shown (NOT a
      // real lookup result) - see `isDemo` doc comment on trackerState
      // above. This is the key fix for "I searched for a player but it
      // just shows demo names" confusion: a real failed search now shows
      // a distinct error message instead (see `renderErrorState`), never
      // silently falling back to indistinguishable-looking demo data.
      const demoBannerHtml = trackerState.isDemo
        ? `<div class="demo-data-banner">
             <span class="demo-data-badge">DEMO DATA</span>
             Sample profiles for preview only - not a real lookup result.
           </div>`
        : "";

      root.innerHTML =
        demoBannerHtml +
        renderComparisonBar(teamA, teamB) +
        renderWinProbability(teamA, teamB) +
        renderTeamBlock("A", "team-a", teamA) +
        renderTeamBlock("B", "team-b", teamB);

      attachRowHandlers(root);
      attachSaveHandlers(root);
    }

    return {
      /**
       * @param {object[]} profiles
       * @param {object} [options]
       * @param {boolean} [options.isDemo] - true when these are sample/demo
       *   profiles (not a real lookup result) - shows the "DEMO DATA"
       *   banner, see render() above.
       */
      setProfiles(profiles, options) {
        trackerState.profiles = profiles || [];
        trackerState.isDemo = Boolean(options?.isDemo);
        trackerState.expanded.clear();
      },
      getProfiles() {
        return trackerState.profiles;
      },
      isCompact() {
        return trackerState.compactView;
      },
      setCompact(value) {
        trackerState.compactView = value;
      },
      toggleCompact() {
        trackerState.compactView = !trackerState.compactView;
        return trackerState.compactView;
      },
      render,
    };
  }

  /**
   * Renders a clear, distinct ERROR state into `rootId` - used when a
   * REAL player search fails (network error, backend unreachable, HTTP
   * error status), as opposed to the plain "no players yet" empty-state
   * or the "DEMO DATA" banner (see createTracker().setProfiles). This is
   * what lets a failed search be immediately recognized as FAILED,
   * instead of silently looking like a successful lookup that happened
   * to return demo-looking data.
   */
  function renderErrorState(rootId, message) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = `
      <div class="lookup-error-state">
        <div class="lookup-error-title">\u26A0 Lookup failed</div>
        <div class="lookup-error-detail">${message || "Unknown error."}</div>
        <div class="lookup-error-hint">
          Check that the backend is running and reachable, and that your
          FACEIT/Steam API keys are configured correctly (Setup &amp; GSI
          tab). This is NOT demo data - your search genuinely failed.
        </div>
      </div>`;
  }

  /**
   * Renders a "resolving players..." loading state - shown IMMEDIATELY
   * when a lookup starts (before the fetch resolves), so a search that
   * takes a few seconds (multiple external API calls per player) doesn't
   * look "stuck"/unresponsive. `count` is the number of players being
   * resolved, purely for the message text.
   */
  function renderLoadingState(rootId, count) {
    const root = document.getElementById(rootId);
    if (!root) return;
    const label = count === 1 ? "1 player" : `${count} players`;
    root.innerHTML = `
      <div class="lookup-loading-state">
        <div class="lookup-spinner"></div>
        <div class="lookup-loading-text">Looking up ${label}...</div>
      </div>`;
  }

  window.TrackerRenderer = {
    createTracker,
    MOCK_PROFILES,
    levelIconPath,
    renderErrorState,
    renderLoadingState,
  };
})();
