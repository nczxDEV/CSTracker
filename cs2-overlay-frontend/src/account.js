// CS Tracker - "Bejelentkezés FACEIT-tel / Steammel" (Account tab).
//
// Independent of the "saved players" feature (saved-players-client.js) -
// this is "who am I" (the local user running this copy of CS Tracker),
// not "who have I looked up/saved". See the backend's AuthModule.
//
// The Account tab is NOT one of the permanent nav-tab buttons
// (Overview/Appearance/...) - it's only ever reachable via the header's
// avatar button (see the click handler at the bottom of this file),
// same idea as clicking your own profile picture in Discord/Steam.
(function () {
  const ACCOUNT_BACKEND_URL = "http://localhost:3000";

  const els = {
    avatarBtn: document.getElementById("account-avatar-btn"),
    avatarInitials: document.getElementById("account-avatar-initials"),
    avatarStatusDot: document.getElementById("account-avatar-status-dot"),
    headerAvatar: document.getElementById("account-header-avatar"),
    headerName: document.getElementById("account-header-name"),
    headerSub: document.getElementById("account-header-sub"),
    faceitLoginBtn: document.getElementById("faceit-login-btn"),
    faceitUnlinkBtn: document.getElementById("faceit-unlink-btn"),
    faceitName: document.getElementById("linked-account-name-faceit"),
    steamLoginBtn: document.getElementById("steam-login-btn"),
    steamUnlinkBtn: document.getElementById("steam-unlink-btn"),
    steamName: document.getElementById("linked-account-name-steam"),
    loginStatus: document.getElementById("account-login-status"),
    leetifySection: document.getElementById("my-leetify-stats-section"),
    leetifyRoot: document.getElementById("my-leetify-stats-root"),
  };

  let pollTimer = null;
  let lastSteamId = null;
  let pendingProvider = null;
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel sign-in'; cancelButton.hidden = true;
  els.loginStatus?.after(cancelButton);
  cancelButton.addEventListener('click', async () => {
    const provider = pendingProvider;
    clearInterval(pollTimer); pollTimer = null; pendingProvider = null;
    cancelButton.hidden = true;
    try {
      if (provider) {
        const res = await fetch(`${ACCOUNT_BACKEND_URL}/auth/${provider}/pending`, { method:'DELETE' });
        if (!res.ok) throw new Error();
      }
      els.loginStatus.textContent = 'Sign-in cancelled. Close the browser login tab.';
    } catch { els.loginStatus.textContent = 'Stopped waiting; backend unavailable. Close the browser login tab.'; }
  });

  /** Opens a URL in the user's SYSTEM DEFAULT BROWSER - never inside this app's own webview, the standard, secure pattern for OAuth/OpenID login. Falls back to a plain browser new-tab when previewing outside Tauri. */
  async function openInSystemBrowser(url) {
    const opener = window.__TAURI__?.opener;
    try {
      if (opener?.openUrl) {
        await opener.openUrl(url);
        return;
      }
      if (opener?.open) {
        await opener.open(url);
        return;
      }
    } catch (err) {
      throw new Error('Could not open the system browser. Please retry.');
    }
    if (window.__TAURI__) throw new Error('System browser opener is unavailable. Restart the app.');
    window.open(url, "_blank");
  }

  function initials(name) {
    const clean = (name || "").replace(/[^a-zA-Z0-9]/g, "");
    return (clean.slice(0, 2) || "?").toUpperCase();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderAvatar(el, name, avatarUrl) {
    if (avatarUrl && /^https:\/\//i.test(avatarUrl)) {
      const img=document.createElement('img');img.src=avatarUrl;img.alt='Profile photo';img.referrerPolicy='no-referrer';
      img.onerror=()=>{el.textContent=initials(name);};el.replaceChildren(img);
    } else {
      el.textContent = initials(name);
    }
  }

  function renderStatus(status) {
    window.CSTrackerAccountStatus=status;
    window.dispatchEvent(new CustomEvent('cstracker-account-status', { detail: status }));
    const faceit = status.faceit;
    const steam = status.steam;
    const anyLinked = Boolean(faceit || steam);

    // Header avatar (top-right button) + Account tab's own header card -
    // both mirror whichever account is linked, preferring FACEIT's
    // display name/avatar (closer to how the user identifies themselves
    // in-game) when both are linked.
    const primaryName = faceit?.displayName || steam?.displayName || null;
    const primaryAvatar = faceit?.avatarUrl || steam?.avatarUrl || null;

    if (anyLinked) {
      els.avatarInitials.textContent = initials(primaryName);
      if (primaryAvatar) {
        els.avatarBtn.style.backgroundImage = `url(${JSON.stringify(primaryAvatar)})`;
        els.avatarBtn.style.backgroundSize = "cover";
        els.avatarInitials.style.display = "none";
      } else {
        els.avatarBtn.style.backgroundImage = "";
        els.avatarInitials.style.display = "";
      }
      els.avatarStatusDot.classList.add("linked");
    } else {
      els.avatarInitials.textContent = "?";
      els.avatarBtn.style.backgroundImage = "";
      els.avatarInitials.style.display = "";
      els.avatarStatusDot.classList.remove("linked");
    }

    renderAvatar(els.headerAvatar, primaryName, primaryAvatar);
    els.headerName.textContent = anyLinked ? primaryName || "Your connected profile" : "Make it your HQ.";
    els.headerSub.textContent = anyLinked
      ? [faceit ? "FACEIT linked" : null, steam ? "Steam linked" : null].filter(Boolean).join(" \u00b7 ")
      : "Connect your FACEIT identity. Your progress follows.";

    // FACEIT row
    if (faceit) {
      const level = faceit.extra?.level;
      const elo = faceit.extra?.elo;
      const detail = [level ? `Level ${level}` : null, elo ? `${elo} ELO` : null].filter(Boolean).join(" \u00b7 ");
      els.faceitName.textContent = detail ? `${faceit.displayName} \u00b7 ${detail}` : faceit.displayName || "Linked";
      els.faceitLoginBtn.style.display = "none";
      els.faceitUnlinkBtn.style.display = faceit.extra?.identitySource === 'steam-data-api' ? 'none' : '';
      if (faceit.extra?.identitySource === 'steam-data-api') els.faceitName.textContent += ' · Found via Steam';
    } else {
      els.faceitName.textContent = "Not connected";
      if (status.capabilities?.faceit === false) els.faceitName.textContent = steam ? 'No FACEIT profile found yet. Check your FACEIT Data API key in Setup & GSI.' : 'Connect Steam to find your FACEIT profile automatically.';
      els.faceitLoginBtn.style.display = status.capabilities?.faceit === false ? 'none' : '';
      els.faceitUnlinkBtn.style.display = "none";
    }

    // Steam row
    if (steam) {
      els.steamName.textContent = steam.displayName || "Linked";
      els.steamLoginBtn.style.display = "none";
      els.steamUnlinkBtn.style.display = "";
    } else {
      els.steamName.textContent = "Not connected";
      els.steamLoginBtn.style.display = "";
      els.steamUnlinkBtn.style.display = "none";
    }

    // "My Leetify Stats" only makes sense once a Steam account is linked
    // (Leetify identifies players by SteamID64).
    if (steam) {
      els.leetifySection.style.display = "";
      if (lastSteamId !== steam.providerUserId) loadLeetifyStats();
    } else {
      els.leetifySection.style.display = "none";
    }
    lastSteamId = steam?.providerUserId || null;
  }

  async function loadStatus() {
    try {
      const res = await fetch(`${ACCOUNT_BACKEND_URL}/auth/status`, {signal:AbortSignal.timeout(1500)});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const status = await res.json();
      renderStatus(status);
      return status;
    } catch (err) {
      els.loginStatus.textContent = 'Backend unavailable. Account connection could not be checked.';
      return null;
    }
  }

  /** Starts short-lived polling right after a "Login with ..." click - stops automatically once the target provider shows up as linked, or after a generous timeout (the user may have abandoned the browser tab). */
  function startPollingForLinkChange(provider) {
    pendingProvider = provider; cancelButton.hidden = false;
    if (pollTimer) clearInterval(pollTimer);
    let elapsedMs = 0;
    const intervalMs = 1500;
    const timeoutMs = 3 * 60 * 1000; // 3 minutes - generous, covers a slow login/consent screen
    pollTimer = setInterval(async () => {
      elapsedMs += intervalMs;
      const status = await loadStatus();
      if (pendingProvider !== provider) return;
      const linked = provider === "faceit" ? status?.faceit : status?.steam;
      if (linked) {
        pendingProvider = null; cancelButton.hidden = true;
        clearInterval(pollTimer);
        pollTimer = null;
        els.loginStatus.textContent = `${provider === "faceit" ? "FACEIT" : "Steam"} account linked \u2713`;
        els.loginStatus.classList.add("saved");
        setTimeout(() => {
          els.loginStatus.textContent = "";
          els.loginStatus.classList.remove("saved");
        }, 3000);
      } else if (elapsedMs >= timeoutMs) {
        pendingProvider = null; cancelButton.hidden = true;
        els.loginStatus.textContent = 'Sign-in did not finish. Check the browser result, then retry.';
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, intervalMs);
  }

  async function signIn(provider) {
    try {
      const status = await loadStatus();
      if (!status) return;
      if (status.capabilities?.[provider] === false) throw new Error('FACEIT OAuth client credentials and a registered callback must be configured by the app developer. You can still look up players using the Data API.');
      if (status[provider]) { els.loginStatus.textContent = 'Already linked. Unlink first to switch accounts.'; return; }
      await openInSystemBrowser(`${ACCOUNT_BACKEND_URL}/auth/${provider}/login`);
      els.loginStatus.textContent = 'Complete sign-in in your browser. Waiting for the callback…';
      startPollingForLinkChange(provider);
    } catch (error) { els.loginStatus.textContent = error.message; }
  }
  els.faceitLoginBtn?.addEventListener('click', () => signIn('faceit'));
  els.steamLoginBtn?.addEventListener('click', () => signIn('steam'));
  window.addEventListener('focus', loadStatus);

  async function unlink(provider) {
    if (pendingProvider === provider) cancelButton.click();
    try {
      const res = await fetch(`${ACCOUNT_BACKEND_URL}/auth/${provider}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const status = await res.json();
      renderStatus(status);
    } catch (err) {
      console.warn(`Failed to unlink ${provider}:`, err);
    }
  }
  els.faceitUnlinkBtn?.addEventListener("click", () => unlink("faceit"));
  els.steamUnlinkBtn?.addEventListener("click", () => unlink("steam"));
  document.getElementById('account-api-settings')?.addEventListener('click',()=>window.activateTab?.('tab-setup'));

  // ---------------------------------------------------------------------
  // "My Leetify Stats" - see the backend's leetify-profile.model.ts for
  // the full compliance/transparency notes this rendering follows:
  // metrics shown exactly as Leetify's API returns them (never
  // rescaled/renamed), no per-weapon breakdown (not available via the
  // official API), and the mandatory "Data Provided by Leetify" badge.
  // ---------------------------------------------------------------------
  function formatWhen(iso) {
    if (!iso) return "Unknown date";
    try {
      const date = new Date(iso);
      const diffMs = Date.now() - date.getTime();
      const diffDays = Math.round(diffMs / 86400000);
      if (diffDays < 1) return "Today";
      if (diffDays < 30) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return "Unknown date";
    }
  }

  function ratingCell(label, value, options = {}) {
    const display = value === null || value === undefined ? "N/A" : options.plusSign && value > 0 ? `+${value}` : value;
    const cls = options.plusSign && value !== null ? (value > 0 ? "pos" : value < 0 ? "neg" : "") : "";
    return `<div class="leetify-rating-cell"><span class="val ${cls}">${display}</span><span class="lbl">${label}</span></div>`;
  }

  function renderLeetifyProfile(profile) {
    const r = profile.rating || {};
    const s = profile.stats || {};

    const ratingGrid = [
      ratingCell("Aim", r.aim),
      ratingCell("Positioning", r.positioning),
      ratingCell("Utility", r.utility),
      ratingCell("Clutching", r.clutch, { plusSign: true }),
      ratingCell("Opening", r.opening, { plusSign: true }),
      ratingCell("CT Rating", r.ctRating, { plusSign: true }),
      ratingCell("T Rating", r.tRating, { plusSign: true }),
      ratingCell("Win Rate", profile.winratePercent !== null ? `${profile.winratePercent}%` : null),
    ].join("");

    const statLines = `
      <div class="leetify-stat-line-list">
        <div class="leetify-stat-line"><span class="lbl">Accuracy (overall)</span><span class="val">${s.accuracyPercent !== null ? s.accuracyPercent + "%" : "N/A"}</span></div>
        <div class="leetify-stat-line"><span class="lbl">Reaction Time</span><span class="val">${s.reactionTimeMs !== null ? s.reactionTimeMs + " ms" : "N/A"}</span></div>
        <div class="leetify-stat-line"><span class="lbl">Preaim</span><span class="val">${s.preaimDegrees !== null ? s.preaimDegrees + "\u00b0" : "N/A"}</span></div>
        <div class="leetify-stat-line"><span class="lbl">Total Matches Tracked</span><span class="val">${profile.totalMatches ?? "N/A"}</span></div>
      </div>`;

    const recentMatches = (profile.recentMatches || []).slice(0, 8);
    const recentMatchesHtml = recentMatches.length
      ? `<div class="leetify-recent-matches-list">${recentMatches
          .map((m) => {
            const badgeCls = m.outcome === "win" ? "win" : m.outcome === "loss" ? "loss" : "tie";
            const badgeLabel = m.outcome === "win" ? "W" : m.outcome === "loss" ? "L" : "?";
            const ratingCls = m.leetifyRating === null ? "" : m.leetifyRating > 0 ? "pos" : m.leetifyRating < 0 ? "neg" : "";
            const ratingLabel =
              m.leetifyRating === null ? "N/A" : `${m.leetifyRating > 0 ? "+" : ""}${m.leetifyRating}`;
            return `<div class="leetify-rm-row">
              <span class="leetify-rm-badge ${badgeCls}">${badgeLabel}</span>
              <span class="leetify-rm-map">${escapeHtml(m.mapName || "Unknown map")} \u00b7 ${formatWhen(m.finishedAt)}</span>
              <span class="leetify-rm-rating ${ratingCls}">${ratingLabel}</span>
            </div>`;
          })
          .join("")}</div>`
      : `<div class="empty-state">No recent matches available (private Leetify profile, or no matches tracked yet).</div>`;

    els.leetifyRoot.innerHTML = `
      <div class="leetify-rating-grid">${ratingGrid}</div>
      ${statLines}
      <div class="na-notice hint" style="font-style:italic; border:1px dashed var(--border-subtle); border-radius:8px; padding:9px 11px; margin-bottom:14px;">
        \u2139 Leetify's public API only provides overall/aggregated aim &amp; accuracy stats - a per-weapon breakdown
        (e.g. separate AK-47 / M4A4 / AWP spray accuracy) is not available through the official API, so it isn't
        fabricated or shown here.
      </div>
      <div class="section-title-row"><h2 style="margin:0; font-size:11.5px;">Recent Matches</h2></div>
      ${recentMatchesHtml}
      <a class="leetify-account-attribution" href="https://leetify.com/" target="_blank" rel="noopener">
        <img src="assets/leetify/leetify-badge-black-small.png" alt="Data provided by Leetify" />
      </a>`;
  }

  async function loadLeetifyStats() {
    els.leetifyRoot.innerHTML = `
      <div class="lookup-loading-state">
        <div class="lookup-spinner"></div>
        <div class="lookup-loading-text">Loading Leetify stats...</div>
      </div>`;
    try {
      const res = await fetch(`${ACCOUNT_BACKEND_URL}/auth/me/leetify-profile`);
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.message) message = body.message;
        } catch {
          // keep the plain HTTP status message
        }
        els.leetifyRoot.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
        return;
      }
      const profile = await res.json();
      renderLeetifyProfile(profile);
    } catch (err) {
      console.warn("Failed to load Leetify profile:", err);
      els.leetifyRoot.innerHTML = `<div class="empty-state">Couldn't load Leetify stats - make sure the backend is running.</div>`;
    }
  }

  // ---------------------------------------------------------------------
  // Avatar button -> switches the main content area to the Account tab.
  // Reuses launcher.js's `activateTab()` (exposed on `window` for exactly
  // this cross-file use) rather than duplicating the nav-tab/tab-panel
  // toggling logic here.
  // ---------------------------------------------------------------------
  els.avatarBtn?.addEventListener("click", () => {
    window.activateTab?.("tab-account");
    loadStatus();
  });

  // The local sidecar can start after the WebView. Retry only this bounded
  // startup check; focus and explicit login still refresh independently.
  window.CSTrackerAccountReady=(async()=>{
    for(let attempt=0;attempt<4;attempt++){
      const status=await loadStatus();if(status)return status;
      if(attempt<3)await new Promise(resolve=>setTimeout(resolve,300));
    }
    return null;
  })();
})();
