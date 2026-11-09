// Post-match 2D replay. All demo parsing happens in the local Tauri process.
(() => {
  const $ = (id) => document.getElementById(id);
  const ui = {
    importButton: $("demo-import-btn"), status: $("demo-import-status"),
    empty: $("demo-empty"), workspace: $("demo-workspace"),
    fileName: $("demo-file-name"), meta: $("demo-match-meta"),
    roundList: $("demo-round-list"), roundTitle: $("demo-round-title"),
    layerButton: $("demo-layer-btn"), canvas: $("demo-radar"),
    radarMessage: $("demo-radar-message"), playButton: $("demo-play-btn"),
    speed: $("demo-speed"), timeline: $("demo-timeline"),
    timeLabel: $("demo-time-label"), ctPlayers: $("demo-ct-players"), tPlayers: $("demo-t-players"),
    events: $("demo-event-list"),
  };
  const ctx = ui.canvas.getContext("2d");
  let mapData = null;
  let summary = null;
  let round = null;
  let radar = null;
  let lowerRadar = null;
  let lowerLevel = false;
  let selectedPlayer = null;
  let currentTick = 0;
  let playing = false;
  let previewEnd = null;
  let loopStart = null, loopEnd = null, loopEnabled = false;
  let previousFrameTime = 0;
  let loadingRound = 0;
  let lastRosterFrame = -1;
  let zoom = 1, panX = 0, panY = 0;
  let dragging = null, moved = false;
  let callouts = [], calloutRequest = 0, lastFeedKey = "";
  let eventPlayers = new Map();
  const calloutTip = $("demo-callout");
  const feedSizes = ["small", "medium", "large"];
  let feedSize = 0;
  $("demo-feed-size").addEventListener("click", () => {
    feedSize = (feedSize + 1) % feedSizes.length;
    $("demo-killfeed").className = `killfeed size-${feedSizes[feedSize]}`;
    $("demo-feed-size").textContent = `Size: ${["S", "M", "L"][feedSize]}`;
  });

  const mapDataPromise = fetch("assets/demo-radars/map-data.json")
    .then((response) => response.ok ? response.json() : null)
    .then((data) => { mapData = data; return data; })
    .catch(() => null);

  function setStatus(message, error = false) {
    ui.status.textContent = message;
    if (!$("studio-loading").hidden && message) $("studio-loading-stage").textContent = message;
    ui.status.style.color = error ? "var(--accent-red)" : "";
  }
  function formatTime(seconds) {
    const value = Math.max(0, Math.floor(seconds));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
  }
  function roundDuration() {
    return round ? (round.summary.endTick - round.summary.startTick) / summary.tickRate : 0;
  }
  function currentSeconds() {
    return round ? (currentTick - round.summary.startTick) / summary.tickRate : 0;
  }
  function updatePlaybackUi() {
    if (round) {
      const score = window.DemoMath.roundScore(summary.rounds, round.summary, currentTick);
      $("demo-score-ct").textContent = score?.ct ?? "—";
      $("demo-score-t").textContent = score?.t ?? "—";
      $("demo-match-score").title = score ? "Score reconstructed from recorded rounds, shown for the current CT and T teams." : "Score unavailable: incomplete round history or unresolved team identities.";
    }
    ui.playButton.textContent = playing ? "Pause" : "Play";
    ui.timeline.value = round ? Math.round(1000 * (currentTick - round.summary.startTick) / Math.max(1, round.summary.endTick - round.summary.startTick)) : 0;
    ui.timeLabel.textContent = `${formatTime(currentSeconds())} / ${formatTime(roundDuration())}`;
  }
  function imageForMap(mapName, lower = false) {
    return new Promise((resolve) => {
      if (!/^[a-z0-9_]+$/.test(mapName)) return resolve(null);
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = `assets/demo-radars/radars/${mapName}${lower ? "_lower" : ""}.png`;
    });
  }
  function mapPoint(x, y) {
    const data = mapData?.[summary?.mapName];
    if (!data || !Number.isFinite(data.scale) || data.scale <= 0) return null;
    return { x: (x - data.pos_x) / data.scale, y: (data.pos_y - y) / data.scale };
  }
  function lowerThreshold() {
    const value = Number(mapData?.[summary?.mapName]?.verticalsections?.lower?.AltitudeMax);
    return Number.isFinite(value) ? value : null;
  }
  function findFramePair(tick) {
    return window.DemoMath.framePair(round?.frames, tick);
  }

  function seekTo(tick) {
    if (!round || ui.timeline.disabled || !Number.isFinite(tick)) return;
    currentTick = Math.max(round.summary.startTick, Math.min(round.summary.endTick, tick));
    playing = false; previewEnd = null; previousFrameTime = 0;
    loopEnabled = false; updateLoopUi();
    lastRosterFrame = -1;
    updatePlaybackUi(); renderPlayers(); draw();
  }
  function updateLoopUi() {
    const valid = Number.isFinite(loopStart) && Number.isFinite(loopEnd) && loopEnd > loopStart;
    $("demo-loop-toggle").disabled = !valid;
    $("demo-loop-toggle").setAttribute("aria-pressed", String(loopEnabled));
    const time = tick => formatTime((tick-round.summary.startTick)/summary.tickRate);
    $("demo-loop-range").textContent = loopStart == null ? "Select a start and end" : `A ${time(loopStart)} · B ${loopEnd == null ? "not set" : time(loopEnd)}`;
  }
  $("demo-loop-a").addEventListener("click",()=>{
    if(!round || ui.timeline.disabled)return;
    loopStart=currentTick;if(loopEnd<=loopStart)loopEnd=null;loopEnabled=false;updateLoopUi();
  });
  $("demo-loop-b").addEventListener("click",()=>{
    if(!round || ui.timeline.disabled)return;
    if(loopStart==null || currentTick<=loopStart){$("demo-review-status").textContent="Set A first, then choose a later moment for B.";return;}
    loopEnd=currentTick;loopEnabled=false;$("demo-review-status").textContent="Loop range ready.";updateLoopUi();
  });
  $("demo-loop-toggle").addEventListener("click",()=>{
    if(!round || ui.timeline.disabled || loopEnd<=loopStart)return;
    loopEnabled=!loopEnabled;previewEnd=null;
    if(loopEnabled && (currentTick<loopStart || currentTick>=loopEnd))currentTick=loopStart;
    previousFrameTime=0;updateLoopUi();updatePlaybackUi();renderPlayers();draw();
  });
  $("demo-statboard-btn").addEventListener("click",()=>{
    if(!round || ui.timeline.disabled)return;
    playing=false;updatePlaybackUi();window.DemoStatboard.render(summary,round.summary);$("demo-statboard").showModal();
  });
  const momentKey="cstracker-demo-moments-v1";
  function readMoments(){
    const rows=JSON.parse(localStorage.getItem(momentKey)||"[]");
    if(!Array.isArray(rows))throw Error("Saved moments could not be read. Existing data was preserved.");
    return rows;
  }
  function renderBookmarks(){
    const list=$("demo-bookmark-list");list.replaceChildren();
    try{
      const items=readMoments().filter(m=>m && m.demoId===summary?.libraryId && Number.isFinite(m.tick));
      for(const m of items){
        const row=textElement("div","","demo-saved-moment");
        const open=textElement("button",`Round ${m.round} · ${formatTime(m.seconds)}`);open.type="button";
        open.onclick=async()=>{open.disabled=true;try{await loadRound(m.round);if(round?.summary.number===m.round)seekTo(m.tick);}finally{open.disabled=false;}};
        const note=document.createElement("input");note.type="text";note.maxLength=500;note.value=String(m.note||"");note.placeholder="Add a review note";note.setAttribute("aria-label",`Note for round ${m.round}`);
        const save=textElement("button","Save note"),remove=textElement("button","Remove");save.type=remove.type="button";
        save.onclick=()=>{try{const rows=readMoments(),item=rows.find(r=>r.id===m.id);if(item)item.note=note.value.slice(0,500);localStorage.setItem(momentKey,JSON.stringify(rows));$("demo-review-status").textContent="Note saved locally.";}catch(e){$("demo-review-status").textContent=e.message;}};
        remove.onclick=()=>{try{localStorage.setItem(momentKey,JSON.stringify(readMoments().filter(r=>r.id!==m.id)));renderBookmarks();}catch(e){$("demo-review-status").textContent=e.message;}};
        row.append(open,note,save,remove);list.append(row);
      }
      if(!items.length)list.append(textElement("p","No saved moments for this demo.","detail-note"));
    }catch(e){$("demo-review-status").textContent=e.message;}
  }
  $("demo-bookmark").addEventListener("click",()=>{
    if(!round || ui.timeline.disabled)return;
    try{
      if(!summary.libraryId)throw Error("Save this demo in Past demos before bookmarking.");
      const rows=readMoments();if(rows.length>=500)throw Error("Remove an old saved moment before adding more (500 limit).");
      if(rows.some(m=>m.demoId===summary.libraryId && m.round===round.summary.number && Math.abs(m.tick-currentTick)<summary.tickRate)){ $("demo-review-status").textContent="This moment is already bookmarked.";return;}
      rows.push({id:crypto.randomUUID(),demoId:summary.libraryId,round:round.summary.number,tick:currentTick,seconds:currentSeconds(),note:"",createdAt:new Date().toISOString()});
      localStorage.setItem(momentKey,JSON.stringify(rows));renderBookmarks();$("demo-review-status").textContent="Moment saved locally. Add a note under Saved moments.";
    }catch(e){$("demo-review-status").textContent=e.message;}
  });
  function renderTimelineEvents() {
    const lanes = {kill:$("timeline-kills"),grenade:$("timeline-utility"),bomb:$("timeline-bomb")};
    Object.values(lanes).forEach(lane=>lane.replaceChildren());
    const tip = $("demo-event-tooltip"); tip.hidden = true;
    for (const event of window.DemoMath.timelineEvents(round.events,round.summary.startTick,round.summary.endTick)) {
      const button = textElement("button", "", "timeline-event-marker " + event.kind);
      button.type = "button";
      button.style.left = event.position + "%";
      const label = `${formatTime((event.tick-round.summary.startTick)/summary.tickRate)} · ${event.label}`;
      button.setAttribute("aria-label", label);
      const show = () => {tip.textContent=label;tip.hidden=false;};
      button.addEventListener("pointerenter",show);button.addEventListener("focus",show);
      button.addEventListener("pointerleave",()=>{tip.hidden=true;});button.addEventListener("blur",()=>{tip.hidden=true;});
      button.addEventListener("click",()=>{seekTo(event.tick);show();});
      lanes[event.kind].append(button);
    }
  }
  function renderInspectorEvents() {
    const list = $("demo-all-events"); list.replaceChildren();
    for (const event of round.events) {
      const button = textElement("button", `${formatTime((event.tick-round.summary.startTick)/summary.tickRate)} · ${event.label}`, "inspector-event");
      button.type = "button";
      button.addEventListener("click", () => seekTo(event.tick));
      list.append(button);
    }
    if (!round.events.length) list.append(textElement("p", "No recorded events in this round.", "detail-note"));
  }
  $("demo-inspector-toggle").addEventListener("click", () => {
    const panel = $("demo-inspector"); panel.hidden = !panel.hidden;
    $("demo-inspector-toggle").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) panel.scrollIntoView({behavior:"smooth", block:"nearest"});
  });
  for (const button of document.querySelectorAll("[data-inspect]")) button.addEventListener("click", () => {
    for (const tab of document.querySelectorAll("[data-inspect]")) {
      const active = tab === button;
      tab.setAttribute("aria-pressed", String(active));
      $("inspector-" + tab.dataset.inspect).hidden = !active;
    }
  });
  $("demo-back").addEventListener("click", () => seekTo(currentTick - summary?.tickRate * 5));
  $("demo-forward").addEventListener("click", () => seekTo(currentTick + summary?.tickRate * 5));
  document.addEventListener("visibilitychange", () => {
    // Do not jump through unseen action after minimizing the window.
    if (document.hidden) { playing = false; previewEnd = null; previousFrameTime = 0; updatePlaybackUi(); }
  });
  function visiblePlayers() {
    const pair = findFramePair(currentTick);
    if (!pair) return [];
    const nextById = new Map(pair.after.players.map((player) => [player.id, player]));
    return pair.before.players.map((player) => {
      const next = nextById.get(player.id);
      if (!next || next.health <= 0 || player.health <= 0) return player;
      return {
        ...player,
        x: player.x + (next.x - player.x) * pair.fraction,
        y: player.y + (next.y - player.y) * pair.fraction,
        z: player.z + (next.z - player.z) * pair.fraction,
        yaw: window.DemoMath.interpolateYaw(player.yaw, next.yaw, pair.fraction),
      };
    });
  }
  function sideClass(side) { return side === "counter-terrorist" ? "ct" : "t"; }
  function drawGrid() {
    ctx.fillStyle = "#101923";
    ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
    ctx.strokeStyle = "rgba(139, 163, 190, .13)";
    ctx.lineWidth = 1;
    for (let position = 0; position <= ui.canvas.width; position += ui.canvas.width / 8) {
      ctx.beginPath(); ctx.moveTo(position, 0); ctx.lineTo(position, ui.canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, position); ctx.lineTo(ui.canvas.width, position); ctx.stroke();
    }
  }
  function draw() {
    if (!ctx) return;
    renderEvents();
    const image = lowerLevel ? lowerRadar : radar;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#151517"; ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
    ctx.save();
    ctx.translate(ui.canvas.width / 2 + panX, ui.canvas.height / 2 + panY);
    ctx.scale(zoom, zoom); ctx.translate(-ui.canvas.width / 2, -ui.canvas.height / 2);
    if (image) { ctx.filter = "grayscale(1) brightness(.65)"; ctx.drawImage(image, 0, 0, ui.canvas.width, ui.canvas.height); ctx.filter = "none"; }
    else drawGrid();
    if (!round || !mapData?.[summary?.mapName]) { ctx.restore(); return; }
    if ($("demo-utility-toggle").checked) drawUtility();
    const level = lowerThreshold();
    for (const event of round.events) {
      const age = (currentTick - event.tick) / summary.tickRate;
      if (event.kind === "grenade" || age < 0 || age > 2.5 || event.x == null || event.y == null) continue;
      if (level != null && event.z != null && (event.z < level) !== lowerLevel) continue;
      const point = mapPoint(event.x, event.y);
      if (!point) continue;
      ctx.beginPath();
      ctx.arc(point.x, point.y, event.kind === "kill" ? 17 : 22, 0, Math.PI * 2);
      ctx.fillStyle = event.kind === "kill" ? "rgba(238, 98, 115, .7)" : "rgba(248, 188, 89, .7)";
      ctx.fill();
      ctx.fillStyle = "#111820";
      ctx.textAlign = "center";
      ctx.font = "bold 19px Segoe UI";
      ctx.fillText(event.kind === "kill" ? "×" : "B", point.x, point.y + 7);
    }
    for (const player of visiblePlayers().filter((p) => p.health > 0)) {
      const point = mapPoint(player.x, player.y);
      if (!point || point.x < 0 || point.x > ui.canvas.width || point.y < 0 || point.y > ui.canvas.height) continue;
      const onOtherLevel = level != null && (player.z < level) !== lowerLevel;
      ctx.globalAlpha = onOtherLevel ? .35 : 1;
      const selected = selectedPlayer === player.id;
      ctx.beginPath(); ctx.arc(point.x, point.y, selected ? 17 : 13, 0, Math.PI * 2);
      ctx.fillStyle = player.side === "counter-terrorist" ? "#78b4fa" : "#f1ad67";
      ctx.fill();
      ctx.lineWidth = selected ? 5 : 2;
      ctx.strokeStyle = selected ? "#ffffff" : "#14202c";
      ctx.stroke();
      const angle = player.yaw * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(point.x, point.y);
      ctx.lineTo(point.x + Math.cos(angle) * 25, point.y - Math.sin(angle) * 25);
      ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = "bold 13px Segoe UI";
      ctx.textAlign = "center"; ctx.fillStyle = "#ffffff";
      if ($("demo-names-toggle").checked) ctx.fillText(player.name.slice(0, 13), point.x, point.y - 22);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function textElement(tag, text, className = "") {
    const el = document.createElement(tag); el.textContent = text; el.className = className; return el;
  }
  function money(value) { return "$" + Math.max(0, value ?? 0).toLocaleString("en-US"); }
  function equipmentIcon(name, active = false) {
    const aliases = { incendiary: "incgrenade", m4a1_s: "m4a1_silencer", "m4a1-s": "m4a1_silencer" };
    const key = String(name || "").trim().toLowerCase().replace(/^weapon_/, "");
    const icon = aliases[key] || (key.startsWith("knife") ? "knife" : key);
    const slot = textElement("span", "", `equipment-icon${active ? " active" : ""}`);
    slot.title = key.replaceAll("_", " ");
    if (!/^[a-z0-9_]+$/.test(icon)) return slot;
    const img = document.createElement("img");
    img.alt = slot.title; img.src = `assets/equipment/${icon}.svg`;
    img.addEventListener("error", () => { img.hidden = true; slot.textContent = slot.title; slot.className += " unknown-equipment"; });
    slot.append(img); return slot;
  }
  function renderPlayers() {
    ui.ctPlayers.replaceChildren(); ui.tPlayers.replaceChildren();
    const players = visiblePlayers().sort((a, b) => a.name.localeCompare(b.name));
    for (const player of players) {
      if (!["counter-terrorist", "terrorist"].includes(player.side)) continue;
      const button = document.createElement("button"); button.type = "button";
      button.className = `player-card${selectedPlayer === player.id ? " selected" : ""}${player.health <= 0 ? " dead" : ""}`;
      const line = textElement("div", "", "player-line");
      line.append(textElement("strong", player.name), textElement("small", player.health > 0 ? `${player.health} HP` : "DEAD"));
      const equipment = textElement("div", "", "player-equipment");
      const weapons = textElement("div", "", "player-weapons");
      const utility = textElement("div", "", "player-utility");
      const grenades = new Set(["hegrenade", "flashbang", "smokegrenade", "molotov", "incendiary", "incgrenade", "decoy", "c4"]);
      const inventory = String(player.inventory || "").split(",").map(w => w.trim().replace(/^weapon_/, "")).filter(Boolean);
      if (player.activeWeapon && !inventory.includes(player.activeWeapon)) inventory.unshift(player.activeWeapon);
      for (const weapon of inventory) (grenades.has(weapon) ? utility : weapons).append(equipmentIcon(weapon, weapon === player.activeWeapon));
      if (player.armor > 0) utility.append(equipmentIcon(player.hasHelmet ? "armor_helmet" : "armor"));
      if (player.hasDefuser) utility.append(equipmentIcon("defuser"));
      equipment.append(weapons, utility);
      const health = textElement("div", "", "health-track"); const bar = document.createElement("i"); bar.style.width = `${Math.min(100, Math.max(0, player.health))}%`; health.append(bar);
      button.title = `${player.name} · ${player.health} HP · ${player.armor} armor · Equipment ${money(player.equipmentValue)}`;
      button.append(line, equipment, health);
      const row = textElement("div", "", `player-card-row${player.health <= 0 ? " dead" : ""}`);
      const cash = textElement("span", money(player.money), "player-cash"); cash.title = "Current money";
      row.append(button, cash);
      button.addEventListener("click", () => { selectedPlayer = player.id; renderPlayers(); draw(); });
      (player.side === "counter-terrorist" ? ui.ctPlayers : ui.tPlayers).append(row);
    }
    for (const [side, id] of [["counter-terrorist", "demo-ct-economy"], ["terrorist", "demo-t-economy"]]) {
      const team = players.filter(p => p.side === side);
      $(id).textContent = `${team.filter(p => p.health > 0).length} alive · cash ${money(team.reduce((sum,p) => sum + p.money, 0))}`;
    }
  }
  function renderEconomy() {
    const target = $("demo-economy-details"); target.replaceChildren();
    for (const team of round.economy || []) {
      const row = textElement("div", "", `economy-row ${sideClass(team.side)}`);
      row.append(textElement("strong", team.side === "counter-terrorist" ? "CT" : "T"), textElement("span", `${team.buyType.toUpperCase()} BUY`), textElement("strong", money(team.equipmentValue)));
      target.append(row);
    }
    if (!round.economy?.length) target.textContent = "Round economy unavailable for this round.";
  }
  function drawUtility() {
    const threshold = lowerThreshold();
    const onLayer = p => threshold == null || (p.z < threshold) === lowerLevel;
    for (const area of round.areas || []) {
      if (currentTick < area.startTick || currentTick > area.endTick || !onLayer(area)) continue;
      const point = mapPoint(area.x, area.y); if (!point) continue;
      const smoke = area.kind === "smoke";
      const radius = (smoke ? 144 : 120) / mapData[summary.mapName].scale;
      ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = smoke ? "rgba(178,187,204,.35)" : "rgba(255,133,46,.40)"; ctx.fill();
      ctx.strokeStyle = smoke ? "#b9c3d4" : "#ffa14e"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#f5f2fa"; ctx.font = "12px Segoe UI"; ctx.textAlign = "center"; ctx.fillText(smoke ? "SMOKE" : "FIRE", point.x, point.y + 4);
    }
    for (const track of round.grenades || []) {
      const points = track.points; if (!points.length || currentTick < points[0].tick || currentTick > points[points.length-1].tick + summary.tickRate * .35) continue;
      let index = 0;
      while (index + 1 < points.length && points[index + 1].tick <= currentTick) index++;
      const before = points[index], after = points[Math.min(index + 1, points.length - 1)];
      const fraction = after.tick > before.tick ? Math.max(0, Math.min(1, (currentTick - before.tick) / (after.tick - before.tick))) : 0;
      const head = {x: before.x + (after.x-before.x)*fraction, y: before.y + (after.y-before.y)*fraction, z: before.z + (after.z-before.z)*fraction};
      if (!onLayer(head)) continue;
      const colors = {smoke: "#c2cbd9", flashbang: "#fff0a0", he: "#ff7787", molotov: "#ffa14e", incendiary: "#ffa14e", decoy: "#8fe4d0"};
      const color = colors[track.kind] || "#c49aff";
      ctx.beginPath();
      let first = true;
      for (let i = Math.max(0, index-96); i <= index; i++) { const p = mapPoint(points[i].x, points[i].y); if (!p) continue; if(first) {ctx.moveTo(p.x,p.y);first=false;} else ctx.lineTo(p.x,p.y); }
      const p = mapPoint(head.x, head.y); if (!p) continue; ctx.lineTo(p.x,p.y);
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      ctx.font="bold 11px Segoe UI";ctx.textAlign="center";ctx.fillText(track.kind.toUpperCase(),p.x,p.y-12);
    }
  }
  function renderEvents() {
    if (!round) return;
    const recent = round.events.filter(e => e.tick <= currentTick && e.tick >= currentTick - summary.tickRate * 10).slice(-6);
    const key = `${round.summary.number}:` + recent.map(e => `${e.tick}:${e.label}`).join("|");
    if (key === lastFeedKey) return;
    lastFeedKey = key;
    ui.events.replaceChildren();
    for (const event of recent) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `demo-event-button ${event.kind}`;
      const time = document.createElement("span");
      time.textContent = formatTime((event.tick - round.summary.startTick) / summary.tickRate);
      button.title = `Jump to ${time.textContent}`;
      const name = (id, fallback) => eventPlayers.get(id)?.name || fallback;
      const playerName = (id, fallback, side) => textElement("b", name(id, fallback), sideClass(side || eventPlayers.get(id)?.side));
      if (event.kind === "kill") {
        const names = event.label.replace(/ · headshot$/, "").split(" eliminated ");
        button.append(playerName(event.actorId, names[0] || "World", event.actorSide));
        if (event.assistId && eventPlayers.has(event.assistId)) button.append(textElement("small", `+ ${name(event.assistId, "")}`));
        button.append(equipmentIcon(event.action || "default", true));
        if (event.label.endsWith(" · headshot")) button.append(equipmentIcon("headshot", true));
        button.append(playerName(event.targetId, names[1] || "Unidentified player", event.targetSide));
      } else if (event.kind === "grenade") {
        const action = String(event.action || "").replace(/^weapon_/, "");
        const verb = {flashbang:"flashed",smokegrenade:"threw smoke",hegrenade:"threw HE",molotov:"threw molotov",incgrenade:"threw incendiary",incendiary:"threw incendiary",decoy:"threw decoy"}[action] || `threw ${action}`;
        button.append(textElement("span", `${name(event.actorId, event.label.split(" · ")[0])} ${verb}`, "feed-utility-text"));
      } else button.append(textElement("span", event.label, "feed-objective"));
      button.addEventListener("click", () => { seekTo(event.tick); });
      ui.events.append(button);
    }
    if (!recent.length) ui.events.append(textElement("small", "No recent events", "feed-empty"));
  }
  function renderRounds() {
    ui.roundList.replaceChildren();
    for (const item of summary.rounds) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `demo-round-button${round?.summary.number === item.number ? " active" : ""}`;
      const title = document.createElement("span");
      title.textContent = String(item.number);
      const winner = document.createElement("span");
      winner.className = `winner ${sideClass(item.winnerSide)}`;
      winner.textContent = item.isKnifeRound ? "Knife" : item.winnerSide === "counter-terrorist" ? "CT" : "T";
      button.append(title, winner);
      button.addEventListener("click", () => loadRound(item.number));
      ui.roundList.append(button);
    }
  }
  async function loadRound(number) {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return;
    const request = ++loadingRound;
    playing = false; previewEnd=null;loopStart=loopEnd=null;loopEnabled=false;updateLoopUi();
    updatePlaybackUi();
    ui.playButton.disabled = ui.timeline.disabled = true;
    setStatus("Loading round...");
    try {
      const result = await invoke("get_cs2_demo_round", { number });
      if (request !== loadingRound) return;
      round = result;
      lastFeedKey = "";
      eventPlayers = new Map(result.frames.flatMap(f => f.players).filter(p => p.name !== "Unknown").map(p => [p.id, p]));
      lastRosterFrame = -1;
      currentTick = result.summary.startTick;
      selectedPlayer = null;
      ui.roundTitle.textContent = result.summary.isKnifeRound ? `Knife round · ${number}` : `Round ${number}`;
      renderRounds(); renderTimelineEvents(); renderEvents(); renderInspectorEvents(); renderEconomy(); renderPlayers(); updatePlaybackUi(); draw();
      window.RoundCoach.setRound(summary, round, tick => {
        seekTo(tick);
        ui.canvas.scrollIntoView({behavior: "smooth", block: "center"});
      }, () => currentSeconds());
      setStatus(result.frames.length ? "" : "This round has no player position samples.");
    } catch (error) { if (request === loadingRound) setStatus(String(error), true); }
    finally { if (request === loadingRound) ui.playButton.disabled = ui.timeline.disabled = false; }
  }
  async function importDemo() {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) { setStatus("Open CS Tracker as a desktop app to import .dem files.", true); return; }
    ui.importButton.disabled = true;
    window.DemoHome.setLoading(true, "Choose a .dem file…");
    playing = false;
    setStatus("Choose a demo. Parsing can take a moment for a full match...");
    try {
      const result = await invoke("import_cs2_demo");
      if (!result) { setStatus(""); return; }
      await showDemo(result);
    } catch (error) { setStatus(String(error), true); }
    finally { window.DemoHome.setLoading(false); window.DemoHome.refresh(); }
  }
  async function showDemo(result) {
      ++loadingRound; playing = false; previousFrameTime = 0;
      summary = result;
      renderBookmarks();
      loadCallouts(summary.mapName);
      zoom = 1; panX = 0; panY = 0;
      round = null;
      await mapDataPromise;
      radar = await imageForMap(summary.mapName);
      lowerRadar = await imageForMap(summary.mapName, true);
      lowerLevel = false;
      ui.layerButton.hidden = !lowerRadar;
      ui.layerButton.textContent = "Show lower level";
      ui.radarMessage.hidden = Boolean(radar && mapData?.[summary.mapName]);
      ui.radarMessage.textContent = `Radar data is unavailable for ${summary.mapName}. The round list and events remain available.`;
      ui.canvas.width = radar?.naturalWidth || 1024;
      ui.canvas.height = radar?.naturalHeight || 1024;
      ui.fileName.textContent = summary.fileName;
      $("demo-map-name").textContent = summary.mapName.replace(/^de_/, "").replaceAll("_", " ");
      ui.meta.textContent = `${summary.rounds.length} rounds · ${Math.round(summary.tickRate)} ticks/s`;
      window.DemoHome.opened();
      ui.workspace.hidden = false;
      await loadRound(summary.rounds[0].number);
  }
  function animate(time) {
    if (playing && round) {
      if (previousFrameTime) currentTick += (time - previousFrameTime) / 1000 * summary.tickRate * Number(ui.speed.value);
      if(loopEnabled)currentTick=window.DemoReview.loopTick(currentTick,loopStart,loopEnd);
      if (previewEnd != null && currentTick >= previewEnd) {currentTick=previewEnd;playing=false;previewEnd=null;}
      if (currentTick >= round.summary.endTick) { currentTick = round.summary.endTick; playing = false; }
      updatePlaybackUi();
      draw();
      const frameTick = findFramePair(currentTick)?.before.tick ?? -1;
      if (frameTick !== lastRosterFrame) {
        lastRosterFrame = frameTick;
        renderPlayers();
      }
    }
    previousFrameTime = time;
    requestAnimationFrame(animate);
  }
  async function loadCallouts(mapName) {
    const token = ++calloutRequest;
    callouts = []; calloutTip.hidden = true;
    if (!/^[a-z0-9_]+$/.test(mapName)) return;
    try {
      const response = await fetch(`assets/demo-radars/${mapName.replace(/_night$/, "")}-places.json`);
      if (!response.ok) return;
      const data = await response.json();
      if (token === calloutRequest && Array.isArray(data)) callouts = data;
    } catch { /* Unsupported custom maps have no hover labels. */ }
  }
  function hoverCallout(event) {
    calloutTip.hidden = true;
    if (dragging || !summary || !mapData?.[summary.mapName]) return;
    const rect = ui.canvas.getBoundingClientRect();
    const p = window.DemoMath.radarPointer(event.clientX, event.clientY, rect, ui.canvas.width, ui.canvas.height, zoom, panX, panY);
    const data = mapData[summary.mapName];
    let name = window.DemoMath.calloutAt(callouts, data.pos_x + p.x * data.scale, data.pos_y - p.y * data.scale, lowerThreshold(), lowerLevel);
    for(const zone of callouts) if(zone.RadarPolygon && window.DemoMath.pointInPolygon(p.x,p.y,zone.RadarPolygon)) { name=zone.Name; break; }
    // Community micro-callout, smaller than Valve's broad Middle volume.
    if (summary.mapName.startsWith("de_ancient") && window.DemoMath.pointInPolygon(p.x,p.y,[[345,615],[447,615],[447,647],[370,647],[370,730],[345,730]])) name = "Elbow";
    if (!name) return;
    calloutTip.textContent = name;
    calloutTip.style.left = `${Math.max(8,Math.min(rect.width-130,event.clientX-rect.left+14))}px`;
    calloutTip.style.top = `${Math.max(8,Math.min(rect.height-36,event.clientY-rect.top+16))}px`;
    calloutTip.hidden = false;
  }
  ui.canvas.addEventListener("pointermove", hoverCallout);
  for (const event of ["pointerleave","pointerdown","wheel","pointercancel"]) ui.canvas.addEventListener(event,()=>{calloutTip.hidden=true;});
  ui.importButton.addEventListener("click", importDemo);
  ui.playButton.addEventListener("click", () => {
    if (!round) return;
    if (!playing && loopEnabled && (currentTick<loopStart || currentTick>=loopEnd)) currentTick=loopStart;
    if (!playing && currentTick >= round.summary.endTick) currentTick = round.summary.startTick;
    previewEnd = null;
    playing = !playing;
    previousFrameTime = 0;
    updatePlaybackUi();
  });
  ui.timeline.addEventListener("input", () => {
    if (!round) return;
    seekTo(round.summary.startTick + Number(ui.timeline.value) / 1000 * (round.summary.endTick - round.summary.startTick));
  });
  ui.layerButton.addEventListener("click", () => {
    lowerLevel = !lowerLevel;
    ui.layerButton.textContent = lowerLevel ? "Show upper level" : "Show lower level";
    draw();
  });
  ui.canvas.addEventListener("click", (event) => {
    if (moved || !round || !mapData?.[summary?.mapName]) return;
    const rect = ui.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * ui.canvas.width / rect.width - ui.canvas.width / 2 - panX) / zoom + ui.canvas.width / 2;
    const y = ((event.clientY - rect.top) * ui.canvas.height / rect.height - ui.canvas.height / 2 - panY) / zoom + ui.canvas.height / 2;
    let nearest = null;
    let distance = 24;
    for (const player of visiblePlayers()) {
      const point = mapPoint(player.x, player.y);
      if (!point) continue;
      const value = Math.hypot(point.x - x, point.y - y);
      if (value < distance) { nearest = player; distance = value; }
    }
    if (nearest) { selectedPlayer = nearest.id; renderPlayers(); draw(); }
  });
  ui.canvas.addEventListener("wheel", event => { event.preventDefault(); zoom = Math.max(1, Math.min(4, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12))); if (zoom === 1) panX = panY = 0; draw(); }, {passive:false});
  ui.canvas.addEventListener("pointerdown", event => { dragging = {x:event.clientX,y:event.clientY}; moved=false; ui.canvas.setPointerCapture(event.pointerId); });
  ui.canvas.addEventListener("pointermove", event => { if (!dragging) return; const rect=ui.canvas.getBoundingClientRect(); const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y; if(Math.abs(dx)+Math.abs(dy)>2)moved=true;panX+=dx*ui.canvas.width/rect.width;panY+=dy*ui.canvas.height/rect.height;dragging={x:event.clientX,y:event.clientY};draw(); });
  ui.canvas.addEventListener("pointerup",()=>{dragging=null;});
  ui.canvas.addEventListener("pointercancel",()=>{dragging=null;});
  $("demo-zoom-reset").addEventListener("click",()=>{zoom=1;panX=panY=0;draw();});
  for (const id of ["demo-utility-toggle","demo-names-toggle"]) $(id).addEventListener("change",draw);
  document.addEventListener("keydown", event => {
    if (!round || ui.workspace.hidden || $("demo-statboard").open || ui.timeline.disabled || event.target.isContentEditable || /INPUT|SELECT|BUTTON|TEXTAREA/.test(event.target.tagName)) return;
    if (event.code === "Space") {event.preventDefault();ui.playButton.click();}
    if (["ArrowLeft","ArrowRight"].includes(event.code)) {event.preventDefault();seekTo(currentTick+(event.code==="ArrowLeft"?-5:5)*summary.tickRate);}
  });
  async function initialize() {
    if (!window.__TAURI__?.core?.invoke) return;
    try {
      await window.__TAURI__.event.listen("demo-import-progress", event => setStatus(event.payload));
      await window.__TAURI__.event.listen("demo-import-complete", event => {
        if (!ui.importButton.disabled) showDemo(event.payload).catch(error => setStatus(String(error), true));
      });
      const existing = await window.__TAURI__.core.invoke("get_cs2_demo_summary");
      // Player HQ explicitly requests an existing cached replay through an event.
      await window.__TAURI__.event.listen('player-hq-open-demo', async event => {
        try {
          await showDemo(await window.__TAURI__.core.invoke('open_past_demo', {id:event.payload.id}));
          if (event.payload.round && summary.rounds.some(r=>r.number===event.payload.round)) await loadRound(event.payload.round);
        } catch(error) { setStatus(String(error),true); }
      });
      if (existing && new URLSearchParams(location.search).get('hq')==='1') {
        await showDemo(existing);
        const requestedRound=Number(new URLSearchParams(location.search).get('round'));
        if(existing.rounds.some(r=>r.number===requestedRound)) await loadRound(requestedRound);
      }
    } catch (error) { setStatus(String(error),true); }
  }
  window.DemoReplay = {show:showDemo, preview(start,end){
    if(!round || !Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>roundDuration()+.05)return false;
    loopEnabled=false;updateLoopUi();
    currentTick=round.summary.startTick+start*summary.tickRate;previewEnd=Math.min(round.summary.endTick,round.summary.startTick+end*summary.tickRate);playing=true;previousFrameTime=0;updatePlaybackUi();return true;
  }, pause(){playing=false;updatePlaybackUi();}};
  initialize();
  requestAnimationFrame(animate);
})();
