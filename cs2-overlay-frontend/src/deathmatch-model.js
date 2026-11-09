(function (root) {
  function modeOf(card) {
    const text = [card.mode, ...(card.lines || [])].join(' ').toLowerCase();
    if (/multi|cfg/.test(text)) return 'cfg';
    if (/pistol/.test(text)) return 'pistol';
    if (/headshot|hsdm|\bhs\b/.test(text)) return 'hs';
    if (/awp/.test(text)) return 'awp';
    if (/aimdm|\baim\b/.test(text)) return 'aim';
    if (/all.weapons|rifle|guns|\bdm\b|deathmatch/.test(text)) return 'guns';
    return 'unknown';
  }
  const api = { modeOf };
  if (typeof module !== 'undefined') module.exports = api;
  else root.DeathmatchModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
