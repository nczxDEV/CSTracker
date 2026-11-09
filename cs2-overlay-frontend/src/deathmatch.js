(() => {
  const $ = id => document.getElementById(id);
  const invoke = (command, args) => window.__TAURI__.core.invoke(command, args);
  const el = (tag, text = '', className = '') => {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  };
  const button = (text, className, handler) => {
    const node = el('button', text, className);
    node.type = 'button';
    node.onclick = handler;
    return node;
  };
  const PROBE_AGE = 90_000;
  const canvas = $('dm-background');
  const store = window.OverlaySettingsStore;
  const effects = { matrix: new window.MatrixRain(canvas), galaxy: new window.GalaxyBackground(canvas),
    cyberpunk: new window.CyberpunkBackground(canvas), teamSpirit: new window.TeamSpiritBackground(canvas) };
  const applyAppearance = settings => {
    store.applyUiTheme(settings.uiTheme);
    document.documentElement.style.setProperty('--dm-opacity', String(settings.panelOpacity ?? .92));
    store.applyBackground(settings, $('dm-backdrop'), canvas, effects);
  };
  applyAppearance(store.loadSettings());
  store.onSettingsUpdated(applyAppearance);
  window.addEventListener('storage', event => {
    if (event.key === 'cs2-overlay-settings') applyAppearance(store.loadSettings());
  });
  let measuring = false, automaticTimer, measurementPromise, quickPending = false;
  let cards = [], loaded = 0, busy = false, joining = false, selected = null;
  let detailToken = 0, providerAvailable = false, providerFilter = '';
  const probes = new Map(), pingNodes = new Map(), visibleServers = new Set();
  const checking = new Set();
  const visibilityObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleServers.add(entry.target.dataset.ip);
      else visibleServers.delete(entry.target.dataset.ip);
    }
    scheduleMeasurement();
  }, {rootMargin:'150px'}) : null;
  function updatePing(card) {
    const node = pingNodes.get(card.ip);
    if (!node) return;
    const result = probe(card), ping = result?.info?.ping;
    node.textContent = ping != null ? ping + ' ms' : result?.error ? 'No response' : checking.has(card.ip) ? 'Checking ping…' : 'Queued';
    node.className = 'ping' + (ping == null ? '' : ping < 30 ? ' good' : ping <= 80 ? ' mid' : ' bad');
    node.title = result?.error ? 'The server did not answer the query. Retrying automatically.' : 'Server query latency from this PC';
  }
  let favorites = new Set();
  try { favorites = new Set(JSON.parse(localStorage.getItem('dm-favorites') || '[]')); } catch {}

  const limit = (id, min, max, fallback) => Math.max(min, Math.min(max, Math.trunc(Number($(id).value) || fallback)));
  const free = () => limit('free', 1, 20, 2);
  const maxPing = () => limit('ping', 10, 500, 80);
  const title = card => (card.lines || []).join(' · ') || card.ip;
  const probe = card => {
    const result = probes.get(card.ip);
    return result && Date.now() - result.at < PROBE_AGE ? result : null;
  };
  const isCyber = card => card.provider === 'cybershoke';
  const providerName = card => isCyber(card) ? 'CYBERSHOKE' : card.provider === 'pracc' ? 'PRACC' : 'WarmupServer';
  const level = value => Number.isInteger(value) && value >= 1 && value <= 10 ? value : null;
  const stat = (value, suffix = '') => value == null || value === '' ? '—' : String(value) + suffix;
  function levelIcon(value) {
    const rank = level(value);
    if (!rank) return el('span', '—');
    const image = el('img', '', 'faceit-icon');
    image.src = 'assets/faceit-levels/level' + rank + '.png';
    image.alt = 'FACEIT level ' + rank;
    image.title = image.alt;
    return image;
  }
  const map = card => probe(card)?.info?.map || card.map || 'Unknown map';

  function population(card) {
    const info = probe(card)?.info;
    if (info && !isCyber(card) && card.provider !== 'pracc') return { humans: Math.max(0, info.players - info.bots), slots: info.slots, source: 'Direct query' };
    const live = card.live || {};
    const age = (live.age_seconds ?? Infinity) + (Date.now() - loaded) / 1000;
    const fresh = live.freshness === 'fresh' && age < 900;
    return {
      humans: fresh ? live.server_current_users : null,
      slots: live.server_total_shown_slots ?? card.slots_configured,
      source: fresh ? 'Provider snapshot' : 'Population unavailable'
    };
  }

  function filtered() {
    const term = $('search').value.trim().toLowerCase();
    return cards.filter(card =>
      (!providerFilter || (card.provider || 'warmup') === providerFilter) &&
      (!$('mode').value || window.DeathmatchModel.modeOf(card) === $('mode').value) &&
      (!$('region').value || String(card.region).toLowerCase().includes($('region').value.toLowerCase())) &&
      (!$('map').value || map(card) === $('map').value) &&
      [map(card), card.mode, title(card)].join(' ').toLowerCase().includes(term) &&
      (!$('favorites').checked || favorites.has(card.ip)));
  }

  function eligible(card) {
    const info = probe(card)?.info;
    return info && info.ping <= maxPing() && info.slots - info.players >= free()
      && info.players > info.bots && snapshotHasRoom(card);
  }

  function snapshotHasRoom(card) {
    if (!isCyber(card)) return true;
    const { humans, slots } = population(card);
    return humans == null || slots == null || slots - humans >= free();
  }

  function byPing(a, b) {
    return (probe(a)?.info?.ping ?? Infinity) - (probe(b)?.info?.ping ?? Infinity);
  }

  function tile(card) {
    const { humans, slots, source } = population(card);
    const result = probe(card);
    const ping = result?.info?.ping;
    const article = el('article', '', isCyber(card) ? 'tile cyber-tile' : 'tile');
    article.dataset.ip = card.ip;
    visibilityObserver?.observe(article);
    const top = el('div', '', 'top');
    const provider = el('span', '', 'prov');
    provider.append(el('i'), document.createTextNode(providerName(card)));
    const pingLabel = el('span', ping == null ? (result?.error ? 'No response' : 'Checking ping…') : ping + ' ms', 'ping');
    if (ping != null) pingLabel.classList.add(ping < 30 ? 'good' : ping <= 80 ? 'mid' : 'bad');
    pingNodes.set(card.ip, pingLabel);
    updatePing(card);
    top.append(provider, pingLabel);

    const main = el('div', '', 'main');
    const badge = el('div', '', 'badge');
    badge.style.setProperty('--p', (humans != null && slots > 0 ? Math.min(100, humans / slots * 100) : 0) + '%');
    badge.append(el('span', humans ?? '—'));
    badge.setAttribute('aria-label', humans == null ? 'Player count unavailable' : humans + ' human players');
    const identity = el('div');
    identity.append(button(title(card), 'name', () => details(card)),
      el('div', [map(card), card.city || card.region].filter(Boolean).join(' · '), 'map'));
    const average = level(card.faceit_avg);
    if (average) {
      const rank = el('div', '', 'faceit-average');
      rank.append(levelIcon(average), el('span', 'FACEIT AVG ' + average));
      identity.append(rank);
    }
    main.append(badge, identity);

    const meter = el('div', '', 'slots');
    meter.setAttribute('aria-hidden', 'true');
    const fill = el('span', '', 'fill');
    fill.style.width = badge.style.getPropertyValue('--p');
    meter.append(fill);

    const footer = el('div', '', 'foot');
    const info = el('span', humans == null ? source : humans + '/' + (slots ?? '—') + ' humans');
    info.title = source;
    const star = button(favorites.has(card.ip) ? '★' : '☆', 'favorite', () => {
      if (favorites.has(card.ip)) favorites.delete(card.ip);
      else favorites.add(card.ip);
      try { localStorage.setItem('dm-favorites', JSON.stringify([...favorites])); } catch {}
      render();
    });
    star.setAttribute('aria-label', 'Favorite ' + title(card));
    star.setAttribute('aria-pressed', String(favorites.has(card.ip)));
    const connect = button('Join', 'join', () => {
      void details(card);
      void join(card);
    });
    connect.disabled = joining;
    footer.append(info, star, connect);
    article.append(top, main, meter, footer);
    return article;
  }

  function render() {
    const rows = filtered();
    const sort = $('sort').value;
    rows.sort((a, b) => {
      if (sort === 'ping') return byPing(a, b);
      const count = (population(b).humans ?? -1) - (population(a).humans ?? -1);
      if (sort === 'players') return count || byPing(a, b);
      return Number(Boolean(eligible(b))) - Number(Boolean(eligible(a))) || byPing(a, b) || count;
    });
    visibilityObserver?.disconnect();
    visibleServers.clear();
    pingNodes.clear();
    $('grid').replaceChildren(...(rows.length ? rows.map(tile) : [
      el('div', busy ? 'Loading servers…' : 'No servers match this selection.', 'empty')
    ]));
    $('find').disabled = busy || joining || quickPending || !rows.length;
    $('refresh').disabled = busy;
  }

  function updateFreshness() {
    const age = Math.max(0, Math.floor((Date.now() - loaded) / 1000));
    $('freshness').dataset.ready = String(providerAvailable && age < 60);
    $('ago').textContent = loaded ? 'List fetched ' + age + 's ago' : 'Waiting for provider';
  }

  async function refresh() {
    if (busy) return false;
    busy = true;
    $('status').textContent = 'Loading the server list…';
    render();
    try {
      const catalog = await invoke('dm_catalog');
      cards = catalog.cards.filter(card => typeof card.ip === 'string');
      const previousMap = $('map').value;
      const maps = [...new Set(cards.map(card => card.map).filter(Boolean))].sort();
      $('map').replaceChildren(new Option('All maps', ''), ...maps.map(name => new Option(name, name)));
      $('map').value = maps.includes(previousMap) ? previousMap : '';
      loaded = Date.now();
      providerAvailable = true;
      const unavailable = [['warmup', 'WarmupServer'], ['cybershoke', 'CYBERSHOKE'], ['pracc', 'PRACC']]
        .filter(([key]) => catalog.errors?.[key]).map(([, name]) => name);
      $('status').textContent = cards.length + ' servers.'
        + (unavailable.length ? ' Unavailable: ' + unavailable.join(', ') + '.' : ' Ping updates automatically.');
      return true;
    } catch (error) {
      providerAvailable = false;
      $('status').textContent = 'Provider unavailable: ' + String(error);
      return false;
    } finally {
      busy = false;
      updateFreshness();
      render();
    }
  }

  function measure(quick = false) {
    if (measurementPromise) return measurementPromise;
    measurementPromise = runMeasurement(quick).finally(() => {
      measurementPromise = null;
      if (!document.hidden && !quickPending && filtered().some(card => !probe(card))) scheduleMeasurement();
    });
    return measurementPromise;
  }

  async function runMeasurement(quick = false) {
    if (busy || measuring) return;
    measuring = true;
    const queue = filtered().filter(card => quick ? snapshotHasRoom(card) : !probe(card))
      .sort((a, b) => quick
        ? (population(b).humans ?? -1) - (population(a).humans ?? -1)
        : Number(visibleServers.has(b.ip)) - Number(visibleServers.has(a.ip)) || (probes.get(a.ip)?.at ?? 0) - (probes.get(b.ip)?.at ?? 0)).slice(0, quick ? 60 : 24);
    const total = queue.length;
    if (quick) busy = true;
    let completed = 0;
    if (!total) { measuring = false; return; }
    $('status').textContent = 'Measuring query ping…';
    if (quick) render();
    try {
      await Promise.all(Array.from({length: 4}, async () => {
        while (queue.length && (quick || !document.hidden)) {
          const card = queue.shift();
          checking.add(card.ip);
          updatePing(card);
          try {
            const info = await invoke('dm_probe', {ip: card.ip});
            probes.set(card.ip, {info, at: Date.now()});
          } catch (error) {
            probes.set(card.ip, {error: String(error), at: Date.now()});
          }
          checking.delete(card.ip);
          updatePing(card);
          $('status').textContent = 'Measured ' + (++completed) + ' of ' + total + ' servers.';
        }
      }));
    } finally {
      measuring = false;
      if (quick) { busy = false; render(); }
    }
  }

  async function details(card) {
    selected = card;
    const token = ++detailToken;
    const cyber = isCyber(card);
    const pracc = card.provider === 'pracc';
    const summary = $('faceit-average');
    const suppliedAverage = level(card.faceit_avg);
    $('detail-provider').textContent = providerName(card);
    $('detail-provider').classList.toggle('cyber-label', cyber);
    $('name').textContent = title(card);
    summary.replaceChildren(el('strong', 'FACEIT AVG'), suppliedAverage ? levelIcon(suppliedAverage) : el('span', 'Unavailable'));
    if (suppliedAverage) summary.append(el('b', String(suppliedAverage)), el('small', 'Provider average'));
    $('player-note').textContent = cyber ? 'Current session statistics from CYBERSHOKE.'
      : pracc ? 'PRACC supplies public nicknames only. FACEIT levels, session stats and some names are unavailable.'
      : 'WarmupServer reports server score and connected time. Some player names are withheld.';
    $('meta').textContent = [map(card), card.city || card.region, card.ip].filter(Boolean).join(' · ');
    $('players').textContent = 'Requesting player list…';
    $('join-status').textContent = '';
    if (!$('details').open) $('details').showModal();
    try {
      const rows = await invoke('dm_players', {ip: card.ip});
      if (token !== detailToken) return;
      const table = el('table');
      const head = table.createTHead().insertRow();
      const columns = cyber ? ['Player', 'FACEIT', 'Kills', 'K/D', 'HS%', 'TTK', 'In game']
        : pracc ? ['Player', 'FACEIT'] : ['Player', 'Server score', 'Time in server'];
      for (const label of columns) head.append(el('th', label));
      const body = table.createTBody();
      const knownLevels = rows.map(player => level(player.faceitLevel)).filter(Boolean);
      if (knownLevels.length) {
        const average = knownLevels.reduce((sum, rank) => sum + rank, 0) / knownLevels.length;
        summary.replaceChildren(el('strong', 'FACEIT AVG'), levelIcon(Math.round(average)),
          el('b', average.toFixed(1)), el('small', knownLevels.length + '/' + rows.length + ' players ranked'));
      }
      for (const player of rows) {
        const row = body.insertRow();
        const name = typeof player.name === 'string' ? player.name.trim() : '';
        const time = Number.isFinite(player.seconds) ? Math.floor(player.seconds / 60) + ' min' : '—';
        row.append(el('td', name || 'Name unavailable'));
        if (cyber) {
          const rank = el('td');
          rank.append(levelIcon(player.faceitLevel));
          const kd = player.kd ?? (player.deaths > 0 && Number.isFinite(player.kills) ? (player.kills / player.deaths).toFixed(2) : null);
          const hs = player.hs ?? (player.kills > 0 && Number.isFinite(player.headshots) ? Math.round(player.headshots / player.kills * 100) + '%' : null);
          row.append(rank, el('td', stat(player.kills)), el('td', stat(kd)),
            el('td', stat(hs)), el('td', stat(player.ttk, ' ms')), el('td', time));
        } else if (pracc) {
          row.append(el('td', 'Unavailable'));
        } else {
          row.append(el('td', name ? stat(player.score) : '—'), el('td', time));
        }
      }
      $('players').replaceChildren(rows.length ? table : el('p', 'No players reported.'));
    } catch (error) {
      if (token === detailToken) $('players').textContent = 'Player list unavailable: ' + String(error);
    }
  }

  async function join(card) {
    if (joining) return;
    joining = true;
    $('join').disabled = true;
    $('join-status').textContent = 'Checking current capacity…';
    render();
    try {
      await invoke('dm_join', {ip: card.ip, minFree: free()});
      $('join-status').textContent = 'Connection request sent to Steam.';
    } catch (error) {
      $('join-status').textContent = String(error);
    } finally {
      joining = false;
      $('join').disabled = false;
      render();
    }
  }

  const providerButtons = document.querySelectorAll('[data-provider]');
  for (const control of providerButtons) control.onclick = () => {
    providerFilter = control.dataset.provider;
    for (const other of providerButtons) other.setAttribute('aria-pressed', String(other === control));
    render();
    scheduleMeasurement();
  };

  $('details').addEventListener('close', () => { detailToken++; selected = null; });
  $('join').onclick = () => selected && join(selected);
  $('refresh').onclick = async () => { await refresh(); scheduleMeasurement(); };
  $('find').onclick = async () => {
    if (busy || joining || quickPending) return;
    quickPending = true;
    render();
    try {
    if (measurementPromise) {
      $('status').textContent = 'Finding your server…';
      await measurementPromise;
    }
    if ((!providerAvailable || Date.now() - loaded > 60_000) && !await refresh()) return;
    await measure(true);
    const best = filtered().filter(eligible).sort(byPing)[0];
    if (!best) {
      $('status').textContent = 'No occupied server meets the ping and free-slot limits.';
      return;
    }
    $('status').textContent = 'Selected ' + title(best) + ' · ' + probe(best).info.ping + ' ms.';
    void details(best);
    await join(best);
    } finally { quickPending = false; render(); }
  };
  function scheduleMeasurement() {
    clearTimeout(automaticTimer);
    automaticTimer = setTimeout(() => { if (!document.hidden) void measure(); }, 500);
  }
  for (const id of ['region', 'map', 'mode', 'search', 'sort', 'ping', 'free', 'favorites']) {
    $(id).addEventListener('input', () => { render(); scheduleMeasurement(); });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { applyAppearance(store.loadSettings()); scheduleMeasurement(); }
    else Object.values(effects).forEach(effect => effect.stop());
  });
  setInterval(() => { if (!document.hidden && !busy && !joining && !quickPending) void measure(); }, 30_000);
  setInterval(async () => {
    if (!document.hidden && !busy && !measuring && !joining && !quickPending) {
      await refresh();
      if (selected && $('details').open) void details(cards.find(card => card.ip === selected.ip) || selected);
    }
  }, 60_000);
  setInterval(updateFreshness, 1000);
  setInterval(() => { if (!document.hidden && !busy && !$('grid').contains(document.activeElement)) render(); }, PROBE_AGE);
  void refresh().then(scheduleMeasurement);
})();
