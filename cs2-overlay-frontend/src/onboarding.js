// First-launch Onboarding Wizard.
// Gates the rest of the Control Panel behind a short setup flow until
// the user has entered BOTH their FACEIT and Steam Web API keys (see
// README/CS_Tracker_MVP_Backlog.md "Setup Wizard" - this is the
// mandatory first-run version of that same feature). Purely a UI/UX
// gate calling the existing, already-ToS-compliant SettingsController
// endpoints (`GET /settings/status`, `PUT /settings/api-keys`) and the
// existing GSI config file download flow - no new backend behavior.
//
// Self-contained module, same convention as dodge-or-play.js /
// player-summary.js / etc. (own BACKEND_URL constant, exposes a small
// API on `window`), loaded BEFORE launcher.js (see launcher.html) so
// launcher.js's init() can call `window.OnboardingWizard.checkAndShow()`.
(function () {
  const ONB_BACKEND_URL = "http://localhost:3000";

  const onbEls = {
    overlay: document.getElementById("onboarding-overlay"),
    steps: document.querySelectorAll("#onboarding-overlay .onb-step"),
    segs: document.querySelectorAll("#onboarding-overlay .onb-progress-seg"),
    faceitInput: document.getElementById("onb-faceit-api-key"),
    steamInput: document.getElementById("onb-steam-api-key"),
    saveKeysBtn: document.getElementById("onb-save-keys-btn"),
    keysStatus: document.getElementById("onb-keys-status"),
    continueStep1Btn: document.getElementById("onb-continue-step1-btn"),
    gsiDownloadBtn: document.getElementById("onb-gsi-download-btn"),
    gsiStatus: document.getElementById("onb-gsi-status"),
    checklistGsiIco: document.getElementById("onb-checklist-gsi-ico"),
    checklistGsiLabel: document.getElementById("onb-checklist-gsi-label"),
    finishBtn: document.getElementById("onb-finish-btn"),
  };

  let gsiDownloaded = false;
  let resolveCompletion = null;

  function goTo(stepIndex) {
    onbEls.steps.forEach((step) => {
      step.classList.toggle("active", step.getAttribute("data-onb-step") === String(stepIndex));
    });
    onbEls.segs.forEach((seg, i) => {
      seg.classList.remove("active", "done");
      if (i < stepIndex) seg.classList.add("done");
      if (i === stepIndex) seg.classList.add("active");
    });
  }

  document.querySelectorAll("#onboarding-overlay [data-onb-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      goTo(parseInt(btn.getAttribute("data-onb-goto"), 10));
    });
  });

  onbEls.saveKeysBtn?.addEventListener("click", async () => {
    const faceitApiKey = onbEls.faceitInput.value.trim() || undefined;
    const steamApiKey = onbEls.steamInput.value.trim() || undefined;

    onbEls.saveKeysBtn.disabled = true;
    onbEls.keysStatus.className = "onb-status-line";
    onbEls.keysStatus.innerHTML = '<span class="onb-spinner"></span> Saving &amp; testing...';
    try {
      const res = await fetch(`${ONB_BACKEND_URL}/settings/api-keys`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faceitApiKey, steamApiKey }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const status = await res.json();
      const faceitOk = Boolean(status.faceitConfigured);
      const steamOk = Boolean(status.steamConfigured);

      if (faceitOk && steamOk) {
        onbEls.keysStatus.className = "onb-status-line onb-ok";
        onbEls.keysStatus.innerHTML = "\u2713 Both keys saved successfully";
        onbEls.continueStep1Btn.disabled = false;
      } else {
        const missing = [];
        if (!faceitOk) missing.push("FACEIT");
        if (!steamOk) missing.push("Steam");
        onbEls.keysStatus.className = "onb-status-line onb-err";
        onbEls.keysStatus.innerHTML = `\u26A0 Still missing: ${missing.join(" and ")} - both keys are required to continue.`;
        onbEls.continueStep1Btn.disabled = true;
      }

      // Keep the (already-open) Setup & GSI tab's status dots in sync, if
      // launcher.js has already exposed its refresh function by now.
      window.refreshSettingsStatusDots?.();
    } catch (err) {
      console.warn("Onboarding: saving API keys failed:", err);
      onbEls.keysStatus.className = "onb-status-line onb-err";
      onbEls.keysStatus.innerHTML =
        "\u26A0 Could not reach the CS Tracker backend - make sure it's running, then try again.";
      onbEls.continueStep1Btn.disabled = true;
    } finally {
      onbEls.saveKeysBtn.disabled = false;
    }
  });

  onbEls.gsiDownloadBtn?.addEventListener("click", async () => {
    onbEls.gsiDownloadBtn.disabled = true;
    onbEls.gsiStatus.className = "onb-status-line";
    onbEls.gsiStatus.innerHTML = '<span class="onb-spinner"></span> Preparing config file...';
    try {
      const res = await fetch(`${ONB_BACKEND_URL}/gsi/config-file`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contents = await res.text();

      const invokeFn = window.__TAURI__?.core?.invoke;
      if (invokeFn) {
        const savedPath = await invokeFn("save_gsi_config_file", { contents });
        onbEls.gsiStatus.className = "onb-status-line onb-ok";
        onbEls.gsiStatus.innerHTML = savedPath ? `\u2713 Saved to ${savedPath}` : "\u2713 Config file ready";
      } else {
        // Plain-browser preview fallback (not running inside Tauri).
        window.open(`${ONB_BACKEND_URL}/gsi/config-file`, "_blank");
        onbEls.gsiStatus.className = "onb-status-line onb-ok";
        onbEls.gsiStatus.innerHTML = "\u2713 Download started";
      }
      gsiDownloaded = true;
      updateDoneChecklist();
    } catch (err) {
      console.warn("Onboarding: GSI config download failed:", err);
      onbEls.gsiStatus.className = "onb-status-line onb-err";
      onbEls.gsiStatus.innerHTML = "\u26A0 Failed - you can retry later from the Setup &amp; GSI tab.";
    } finally {
      onbEls.gsiDownloadBtn.disabled = false;
    }
  });

  function updateDoneChecklist() {
    if (onbEls.checklistGsiIco) {
      onbEls.checklistGsiIco.textContent = gsiDownloaded ? "\u2713" : "\u2013";
    }
    if (onbEls.checklistGsiLabel) {
      onbEls.checklistGsiLabel.textContent = gsiDownloaded ? "downloaded" : "skipped (optional)";
    }
  }

  onbEls.finishBtn?.addEventListener("click", () => {
    hide();
    if (typeof resolveCompletion === "function") {
      const resolve = resolveCompletion;
      resolveCompletion = null;
      resolve();
    }
  });

  function hide() {
    if (!onbEls.overlay) return;
    onbEls.overlay.classList.add("onb-hidden");
    setTimeout(() => onbEls.overlay?.remove(), 300);
  }

  /**
   * Checks whether both FACEIT and Steam API keys are already configured
   * on the backend. If so, hides the onboarding overlay immediately and
   * resolves right away - the overlay is visible by default (see
   * onboarding.css `.onb-overlay`) precisely so there is never a "flash"
   * of the main app before this check completes. Otherwise, the overlay
   * stays up (on top of #startup-loading-overlay too) and this only
   * resolves once the user reaches the final step and clicks
   * "Start Using CS Tracker".
   *
   * Retries the initial status check a few times - the backend sidecar
   * can take a moment to finish starting up on a cold launch - before
   * falling back to showing the wizard defensively (safer than silently
   * letting the user into an unconfigured app).
   */
  async function checkAndShow() {
    let status = null;
    for (let attempt = 0; attempt < 6 && !status; attempt++) {
      try {
        const res = await fetch(`${ONB_BACKEND_URL}/settings/status`);
        if (res.ok) status = await res.json();
      } catch (err) {
        // Backend not up yet - retry below.
      }
      if (!status && attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    if (status && status.faceitConfigured && status.steamConfigured) {
      hide();
      return true;
    }

    goTo(0);
    return new Promise((resolve) => {
      resolveCompletion = resolve;
    });
  }

  window.OnboardingWizard = { checkAndShow };
})();
