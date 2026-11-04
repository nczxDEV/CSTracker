(() => {
  const $ = id => document.getElementById(id);
  const selected = new Set();
  let roster = [], currentRound = null, summary = null, seek = null, version = 0, busy = false, getTime = () => 0;
  const node = (tag, text, className = "") => { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; };
  function invalidate() { version++; $("coach-result").replaceChildren(); $("coach-status").textContent = busy ? "Selection changed. The previous request will finish without replacing this view." : ""; }
  function renderOptions() {
    const target = $("coach-player-options"); target.replaceChildren();
    const query = $("coach-search").value.trim().toLocaleLowerCase();
    for (const player of roster.filter(p => p.name.toLocaleLowerCase().includes(query) || selected.has(p.id))) {
      const label = node("label", "", "coach-player-option");
      const input = document.createElement("input"); input.type = "checkbox"; input.checked = selected.has(player.id);
      input.disabled = !input.checked && selected.size >= 5;
      input.addEventListener("change", () => { if (input.checked) selected.add(player.id); else selected.delete(player.id); invalidate(); renderOptions(); });
      label.append(input, node("span", player.name), node("small", player.side === "counter-terrorist" ? "CT" : "T")); target.append(label);
    }
    if (!target.children.length) target.append(node("p", "No matching players.", "detail-note"));
    $("coach-picker-label").textContent = `Choose players · ${selected.size} / 5`;
    const names=roster.filter(p=>selected.has(p.id)).map(p=>p.name);
    $("coach-selected-count").textContent = names.length ? names.slice(0,2).join(" · ")+(names.length>2?` +${names.length-2} more`:"") : "No players selected";
    $("coach-duo-prompt").hidden = selected.size !== 2;
    if(selected.size!==2 && $("coach-question").value===$("coach-duo-prompt").dataset.question) $("coach-question").value="";
  }
  function timestamp(tick) {
    const seconds = Math.max(0, Math.floor((tick - currentRound.summary.startTick) / summary.tickRate));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function findingCard(finding, evidence) {
    const card = node("article", "", `coach-finding ${finding.kind}`);
    card.append(node("strong", finding.kind === "strength" ? "WHAT WORKED" : "MOMENT TO REVIEW", "coach-finding-label"), node("p", finding.observation), node("p", finding.advice, "coach-advice"));
    const links = node("div", "", "coach-evidence");
    for (const id of finding.evidenceIds) {
      const item = evidence.get(id); if (!item) continue;
      const button = node("button", `${timestamp(item.tick)} · ${item.kind === "round_economy_at_freeze_end" ? "round economy" : item.kind.replaceAll("_", " ")}`);
      button.type = "button"; button.addEventListener("click", () => seek?.(item.tick)); links.append(button);
    }
    card.append(links); return card;
  }
  function renderResult(result) {
    const target = $("coach-result"); target.replaceChildren();
    const evidence = new Map(result.evidence.map(item => [item.id, item]));
    const names = new Map(result.players.map(player => [player.id, player.name]));
    target.append(node("h3", `Round ${currentRound.summary.number} · AI review`), node("p", result.review.overview, "coach-overview"));
    for (const player of result.review.players) {
      const section = node("section", "", "coach-player-review"); section.append(node("h3", names.get(player.playerId) || "Player"), node("p", player.summary));
      const findings = node("div", "", "coach-findings"); for (const finding of player.findings) findings.append(findingCard(finding, evidence));
      section.append(findings, node("p", `NEXT ROUND · ${player.nextRound}`, "coach-next")); target.append(section);
    }
    if (result.review.teamwork.length) {
      target.append(node("h3", "Duo / team coordination"));
      for (const finding of result.review.teamwork) target.append(findingCard(finding, evidence));
    }
    target.append(node("p", result.review.limitations, "detail-note"));
  }
  $("coach-search").addEventListener("input", renderOptions);
  for (const id of ["coach-model","coach-language"]) $(id).addEventListener("change",invalidate);
  let modelRequest=0;
  const providerSelect=document.createElement("select");providerSelect.id="coach-provider";
  for(const [value,label] of [["openai","OpenAI"],["gemini","Google Gemini"]]){const option=node("option",label);option.value=value;providerSelect.append(option);}
  providerSelect.value="openai";
  const providerLabel=node("label","Provider");providerLabel.htmlFor="coach-provider";
  $("coach-key").parentElement.parentElement.prepend(providerLabel,providerSelect);
  const provider=()=>providerSelect.value;
  const providerName=()=>provider()==="gemini"?"Google Gemini":"OpenAI";
  const keyLabel=document.querySelector('label[for="coach-key"]');
  document.querySelector(".coach-disclosure").textContent="Generate sends selected player names, events, economy and sampled context to the provider chosen in AI Coach Setup. Provider quotas and charges apply. The .dem file and Steam IDs stay on this PC. Check advice against linked moments.";
  providerSelect.addEventListener("change",()=>{invalidate();$("coach-key").value="";resetModels();keyLabel.textContent=providerName()+" API key";$("coach-key").placeholder=provider()==="gemini"?"Gemini API key":"sk-…";$("coach-model-status").textContent=provider()==="gemini"?"Create a Gemini key in Google AI Studio, then load models. Free-tier availability depends on model and account quotas.":"Enter your OpenAI key, then load models.";});
  function resetModels(){modelRequest++;$("coach-model").replaceChildren(node("option","Load models with your API key"));$("coach-model").children[0].value="";$("coach-model").disabled=true;$("coach-model-status").textContent="Enter a key, then click Load models.";}
  $("coach-key").addEventListener("input",resetModels);
  $("coach-forget-key").addEventListener("click",()=>{$("coach-key").value="";resetModels();$("coach-status").textContent="Key cleared from this window.";});
  $("coach-load-models").addEventListener("click",async()=>{
    const key=$("coach-key").value.trim(),status=$("coach-model-status");
    if(!key){status.textContent=`Enter your ${providerName()} API key first.`;return;}
    const token=++modelRequest;$("coach-load-models").disabled=true;status.textContent="Loading available models…";
    try{
      const models=await window.__TAURI__.core.invoke("list_coach_models",{apiKey:key,provider:provider()});
      if(token!==modelRequest)return;
      $("coach-model").replaceChildren();for(const id of models){const option=node("option",id);option.value=id;$("coach-model").append(option);}
      $("coach-model").value=models.includes("gpt-4.1-mini")?"gpt-4.1-mini":models[0];$("coach-model").disabled=false;
      status.textContent=`${models.length} models available from ${providerName()}. Structured output compatibility is checked when generating.`;
    }catch(error){if(token===modelRequest)status.textContent=String(error);}
    finally{$("coach-load-models").disabled=false;}
  });

  $("coach-generate").addEventListener("click", async () => {
    if (busy || !currentRound) return;
    const status = $("coach-status");
    if (!selected.size) { status.textContent = "Select at least one player."; return; }
    if (!$("coach-key").value.trim()) { status.textContent = `Open AI Coach Setup and enter your ${providerName()} API key.`; $("coach-settings-dialog").showModal(); $("coach-key").focus(); return; }
    if ($("coach-model").disabled || !$("coach-model").value) {status.textContent="Open AI Coach Setup and load your models first.";$("coach-settings-dialog").showModal();return;}
    let scope = null;
    if ($("coach-clip-enabled").checked) {
      const start=Number($("coach-clip-start").value), end=Number($("coach-clip-end").value);
      const duration=(currentRound.summary.endTick-currentRound.summary.startTick)/summary.tickRate;
      if (!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration+.05) {status.textContent="Choose an interval inside this round (end must follow start).";return;}
      scope={startTick:currentRound.summary.startTick+Math.round(start*summary.tickRate),endTick:Math.min(currentRound.summary.endTick,currentRound.summary.startTick+Math.round(end*summary.tickRate)),question:$("coach-question").value.trim()};
    }
    const requestVersion = version;
    busy = true; $("coach-generate").disabled = true; $("coach-result").replaceChildren();
    status.textContent = `Reviewing this round with ${providerName()}…`;
    try {
      const result = await window.__TAURI__.core.invoke("generate_round_review", {
        scope, provider:provider(), number: currentRound.summary.number, playerIds: [...selected], apiKey: $("coach-key").value.trim(),
        model: $("coach-model").value.trim(), language: $("coach-language").value,
      });
      if (version !== requestVersion) return;
      renderResult(result); status.textContent = "Review ready. Click an evidence timestamp to check the moment.";
    } catch (error) { if (version === requestVersion) status.textContent = String(error); }
    finally { busy = false; $("coach-generate").disabled = false; if (version !== requestVersion) status.textContent = "Ready to review the current selection."; }
  });
  for (const id of ["coach-clip-enabled","coach-clip-start","coach-clip-end","coach-question"]) $(id).addEventListener("input",invalidate);
  for (const [button,field] of [["coach-mark-start","coach-clip-start"],["coach-mark-end","coach-clip-end"]]) $(button).addEventListener("click",()=>{$(field).value=String(Math.floor(getTime()*10)/10);$("coach-clip-enabled").checked=true;invalidate()});
  $("coach-preview-clip").addEventListener("click",()=>{if(!currentRound)return;const start=Number($("coach-clip-start").value),end=Number($("coach-clip-end").value);if(window.DemoReplay.preview(start,end))document.getElementById("demo-radar").scrollIntoView({behavior:"smooth",block:"center"});else $("coach-status").textContent="Choose a valid interval before previewing.";});
  document.querySelectorAll("[data-question]").forEach(button=>button.addEventListener("click",()=>{if(button.id==="coach-duo-prompt" && selected.size!==2)return;$("coach-question").value=button.dataset.question;$("coach-clip-enabled").checked=true;invalidate()}));
  window.RoundCoach = {
    setRound(match, round, onSeek, timeReader) {
      getTime=timeReader || (()=>0);
      $("coach-clip-start").value="0";
      $("coach-clip-end").value=String(Math.floor(Math.min(10,(round.summary.endTick-round.summary.startTick)/match.tickRate)*10)/10);
      summary = match; currentRound = round; seek = onSeek; invalidate();
      const players = new Map();
      for (const frame of round.frames) for (const player of frame.players) {
        if (["counter-terrorist", "terrorist"].includes(player.side)) players.set(player.id, player);
      }
      roster = [...players.values()].sort((a,b) => a.name.localeCompare(b.name));
      for (const id of selected) if (!players.has(id)) selected.delete(id);
      renderOptions();
    },
  };
})();
