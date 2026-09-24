// Hand-drawn line icons (24×24, stroke = currentColor). Returned as SVG strings.
const svg = (body, size = 24, extra = '') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

const GAME = {
  // two fanned cards with a spade
  holdem: '<rect x="3.5" y="5" width="10" height="14" rx="1.8" transform="rotate(-10 8.5 12)"/><rect x="10" y="4" width="10" height="14" rx="1.8" transform="rotate(8 15 11)"/><path d="M15.2 8.2c-1.4 1.3-2.6 2.2-2.6 3.3a1.3 1.3 0 0 0 2.2 1l.4-.4.4.4a1.3 1.3 0 0 0 2.2-1c0-1.1-1.2-2-2.6-3.3z" fill="currentColor" stroke="none" transform="rotate(8 15 11)"/><path d="M15.2 12.6v1.8" transform="rotate(8 15 11)"/>',
  // a die in front of a cup
  liarsdice: '<path d="M4 4.5h9l-1.2 9.5H5.2z"/><path d="M3.5 4.5h10"/><rect x="11.5" y="11.5" width="9" height="9" rx="2"/><circle cx="14" cy="14" r=".9" fill="currentColor" stroke="none"/><circle cx="18" cy="18" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r=".9" fill="currentColor" stroke="none"/>',
  // three flags on a ridge line
  blotto: '<path d="M2.5 19.5c3-4 5-5.5 9.5-5.5s6.5 1.5 9.5 5.5"/><path d="M6 17V8.5l3 1.2-3 1.3"/><path d="M12 14V4.5l3.2 1.3L12 7.1"/><path d="M18 17V9.5l3 1.2-3 1.3"/>',
  // 2×2 payoff matrix with one highlighted cell
  pd: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M12 3.5v17M3.5 12h17"/><rect x="5.5" y="5.5" width="4.5" height="4.5" rx="1" fill="currentColor" stroke="none" opacity=".85"/>',
  // cyclic dominance: three nodes with arrows
  rps: '<circle cx="12" cy="4.8" r="2.3"/><circle cx="4.8" cy="17.8" r="2.3"/><circle cx="19.2" cy="17.8" r="2.3"/><path d="M13.3 7l4.4 8.3M16.9 19.1H7.1M3.9 15.5 10.6 6.9"/><path d="m16.2 14.4 1.5.9.2-1.8M9 18l-1.9 1.1L9 20.1M9.4 7.4l1.2-.5.4 1.4"/>',
  // balance scale
  ultimatum: '<path d="M12 3.5v16M7.5 20h9"/><path d="M5 7.5h14"/><path d="M5 7.5 2.5 13a2.6 2.6 0 0 0 5 0z"/><path d="M19 7.5 16.5 13a2.6 2.6 0 0 0 5 0z"/><circle cx="12" cy="4" r=".8" fill="currentColor" stroke="none"/>',
};

export const gameIcon = (id, size = 24) => svg(GAME[id] || GAME.pd, size);

export const icons = {
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 18),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', 18),
  auto: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>', 18),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>', 16),
  github: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>',
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 16),
  back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>', 16),
  shield: svg('<path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>', 16),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>', 18),
};
