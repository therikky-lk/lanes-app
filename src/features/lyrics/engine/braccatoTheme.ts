export const braccatoThemeCss = `
.blyrics-container {
  --blyrics-font-family: "Satoshi", var(--font-inter), system-ui, sans-serif;
  --blyrics-font-size: 2rem;
  --blyrics-font-weight: 600;
  --blyrics-line-height: 1.4;
  --blyrics-padding: 1.25rem;
  --blyrics-glow-color: transparent;
  --blyrics-highlight-color: transparent;
  --blyrics-scale: 1;
  --blyrics-animate-word-wobble: 0;
  --blyrics-wobble-duration: 0s;
  --blyrics-word-wobble-transform-from: none;
  --blyrics-word-wobble-transform-peak: none;
  --blyrics-word-wobble-transform-settle: none;
  --blyrics-word-wobble-transform-to: none;
}

.blyrics-container > div {
  transform: none !important;
}

.blyrics-container > div:hover {
  transform: none !important;
}

.blyrics-background-lyric {
  font-size: 0.9em;
}

.blyrics--word,
.blyrics--word::after,
.blyrics-word-highlight {
  --blyrics-glow-color: transparent;
  --blyrics-highlight-color: transparent;
  transform: none !important;
}

.blyrics--word[data-long-word],
.blyrics--word[data-long-word]::after,
.blyrics--word[data-long-word] > .blyrics-word-highlight {
  --blyrics-glow-color: color(display-p3 1 1 1 / 1);
  --blyrics-highlight-color: color(display-p3 1 1 1 / 1);
  transform: none !important;
}

/* Lane's original letter sweep. Unsplit words keep Braccato's own highlight. */
.blyrics-word-highlight[data-lane-letters] {
  background-image: none !important;
  color: transparent;
  /* The letters own visibility here. The native whole-word animation can
     otherwise hide letters that already lit after a seek or a pause. */
  opacity: 1 !important;
}
.lane-ch {
  display: inline-block;
  white-space: pre;
  transition:
    color var(--lane-ch-dur, 120ms) ease-out,
    transform calc(var(--lane-ch-dur, 120ms) * 2.5) cubic-bezier(0.2, 0.7, 0.3, 1);
}
.blyrics-word-highlight[data-lane-letters] > .lane-ch {
  color: transparent;
}
.blyrics-word-highlight[data-lane-letters] > .lane-ch.lane-ch-lit {
  color: var(--blyrics-lyric-active-color);
}
.blyrics--active .lane-ch.lane-ch-lit {
  transform: translateY(-0.035em);
}
.blyrics-word-highlight[data-lane-letter-glow] > .lane-ch.lane-ch-lit {
  text-shadow: 0 0 var(--lane-lyric-glow-radius, 0.3em) rgb(228 236 255 / var(--lane-lyric-glow-opacity, 58%));
}
`;
