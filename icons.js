const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  discover: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>',
  artist: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  heart:
    '<path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 6l-1-1.2a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 2 4-1 1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-2z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  music:
    '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',
  play: '<path d="m7 4 14 8-14 8z"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  next: '<path d="m4 5 11 7-11 7zM19 5v14"/>',
  prev: '<path d="m20 5-11 7 11 7zM5 5v14"/>',
  shuffle:
    '<path d="M3 6h3l12 12h3M3 18h3l4-4m4-4 4-4h3m-4-4 4 4-4 4m0 6 4 4-4 4"/>',
  repeat:
    '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
  queue: '<path d="M3 5h18M3 11h13M3 17h10m5-3 5 3-5 3z"/>',
  moon: '<path d="M20 14A9 9 0 0 1 10 4a9 9 0 1 0 10 10z"/>',
  volume:
    '<path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  "cloud-off":
    '<path d="m3 3 18 18M7 7a5 5 0 0 0-3 10h10M9 4a7 7 0 0 1 10 6 4 4 0 0 1 2 6"/>',
  folder: '<path d="M3 5h7l2 3h9v12H3z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  shield:
    '<path d="m12 3 8 3v7c0 4-8 8-8 8s-8-4-8-8V6z"/><path d="m8 12 3 3 5-6"/>',
};
export function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.music}</svg>`;
}
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
    el.removeAttribute("data-icon");
  });
}
