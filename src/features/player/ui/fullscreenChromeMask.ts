// A single mask makes the entire header one frosted surface: overlapping
// translucent blocks would darken their joins and show visible seams.
export function fullscreenChromeMask(width: number, toolbarLeft: number, toolbarWidth: number) {
  const w = Math.max(1, Math.round(width));
  const left = Math.max(52, Math.round(toolbarLeft));
  const right = Math.min(w - 116, Math.round(toolbarLeft + toolbarWidth));
  const middle = right > left ? `<path d="M${left - 12} 6 Q${left} 6 ${left} 18 V20 Q${left} 36 ${left + 16} 36 H${right - 16} Q${right} 36 ${right} 20 V18 Q${right} 6 ${right + 12} 6 Z"/>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="36" viewBox="0 0 ${w} 36"><g fill="white"><path d="M0 0 H${w} V6 H0 Z"/><path d="M0 0 H52 V6 Q40 6 40 18 V20 Q40 36 24 36 H0 Z"/>${middle}<path d="M${w} 0 H${w - 116} V6 Q${w - 104} 6 ${w - 104} 18 V20 Q${w - 104} 36 ${w - 88} 36 H${w} Z"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
