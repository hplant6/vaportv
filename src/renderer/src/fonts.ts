// Marvin Visions Big Bold (Atelier Triay; licensed to Henry for vaporTV, not in the public
// repo: see scripts/private-assets.mjs) for headings, tabs and the clock, when the build
// has it. It's loaded here rather than in CSS so a build without it just keeps the free
// fonts (tokens.css lists them after it). <html> gets "licensed-display" once it's in.

const face = new FontFace('Marvin Visions', `url("${new URL('private/display.woff2', document.baseURI)}") format("woff2")`, {
  // One file for every weight asked for, so the browser never fakes a bolder one.
  weight: '100 900',
  display: 'swap'
})

face.load().then(
  (loaded) => {
    document.fonts.add(loaded)
    document.documentElement.classList.add('licensed-display')
  },
  () => {}
)
