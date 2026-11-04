// Optional first-launch setup. Users can skip directly to the main window.
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
    onbEls.overlay?.classList.toggle('intro-active',stepIndex===0);
    window.dispatchEvent(new CustomEvent('cstracker-intro-step',{detail:stepIndex}));
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
    localStorage.setItem('cstracker-glacial-onboarding-complete','true');
    hide();
    if (typeof resolveCompletion === "function") {
      const resolve = resolveCompletion;
      resolveCompletion = null;
      resolve();
    }
  });

  document.querySelectorAll("#onboarding-overlay .onb-skip-setup-btn").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem("cstracker-setup-skipped", "true");
      localStorage.setItem('cstracker-glacial-onboarding-complete','true');
      localStorage.removeItem("cstracker-local-demo-mode");
      hide();
      window.activateTab?.("tab-overview");
      if (typeof resolveCompletion === "function") {
        const resolve = resolveCompletion;
        resolveCompletion = null;
        resolve(true);
      }
    });
  });

  function hide() {
    window.dispatchEvent(new CustomEvent('cstracker-intro-step',{detail:-1}));
    if (!onbEls.overlay) return;
    onbEls.overlay.classList.add("onb-hidden");
    setTimeout(() => onbEls.overlay?.remove(), 300);
  }

  async function checkAndShow() {
    if (localStorage.getItem('cstracker-glacial-onboarding-complete') === 'true') {
      localStorage.setItem("cstracker-setup-skipped", "true");
      localStorage.removeItem("cstracker-local-demo-mode");
      hide();
      window.activateTab?.("tab-overview");
      return true;
    }
    // Allow Skip setup to complete immediately even while the backend starts.
    const completion = new Promise(resolve => { resolveCompletion = resolve; });
    const checkStatus = async () => {
      let status = null;
      for (let attempt = 0; attempt < 6 && !status && resolveCompletion; attempt++) {
        try {
          const res = await fetch(`${ONB_BACKEND_URL}/settings/status`, { signal: AbortSignal.timeout(1500) });
          if (res.ok) status = await res.json();
        } catch { /* The backend may still be starting. */ }
        if (!status && attempt < 5 && resolveCompletion) await new Promise(resolve => setTimeout(resolve, 400));
      }
      if (!resolveCompletion) return true;
      if (status?.faceitConfigured && status?.steamConfigured) {
        onbEls.continueStep1Btn.disabled=false;
        onbEls.keysStatus.textContent='Your saved API keys are configured. Continue or replace them below.';
      }
      // Preserve a setup step the user opened while the backend was starting.
      return completion;
    };
    return Promise.race([completion, checkStatus()]);
  }

  window.OnboardingWizard = { checkAndShow };
})();
