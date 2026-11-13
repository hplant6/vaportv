import type { MeshStandardMaterial } from 'three'

// Consoles with their own backdrop on their tab: the console itself in neon, the camera
// swinging round it like a product shot (product/scene.ts). The models aren't in the public
// repo: scripts/private-assets.mjs copies them in when they're there, and without one the
// tab shows the usual backdrop.

export interface Product {
  /** The model (glTF binary, encrypted as .vtm by scripts/private-assets.mjs), exported from Blender with the console lying as it should on the floor. */
  model: string
  /** How much nearer the camera comes than for the PS3 (1): a thin console looks smaller at the same width, its front edge further off. */
  zoom?: number
  /** How far above the console the camera looks down at the front of its swing (degrees; default 30): lower shows more of its face. */
  elevation?: number
  /** Moves it this much of the screen's width to the right (negative: left), keeping its perspective. */
  shiftRight?: number
  /** Moves it this much of the screen's height further down (negative: up), keeping its perspective. */
  shiftDown?: number
  /** How bright its white lights are, against the PS3's first look (1). */
  white?: number
  /** Overall brightness, all lights included (1): for a light-coloured console that outshines the black ones. */
  exposure?: number
  /** False to leave out the glow round its brightest light (on by default at High and Medium quality). */
  bloom?: boolean
  /** A handheld: in the left bar's turning view (spin.ts), stood up this many degrees so its screen faces the camera, not the ceiling. */
  spinTilt?: number
  /** Fixes for what glTF couldn't carry over from Blender, by material. */
  fix?: (material: MeshStandardMaterial) => void
}

const GENESIS: Product = {
  model: 'private/genesis.vtm',
  zoom: 0.85,
  // The shell's fine plastic grain was scaled down in Blender, which glTF drops: at full size it reads as dents.
  fix: (material) => {
    if (material.name === 'Shell.001') material.normalMap = null
  }
}

export const PRODUCTS: Partial<Record<string, Product>> = {
  apps: {
    // A pile of VHS tapes: it sits low, so in closer and lifted a little. Bloom blurs the sleeves' bright art.
    model: 'private/apps.vtm',
    zoom: 1.12,
    shiftDown: -0.04,
    bloom: false
  },
  steam: {
    model: 'private/steamdeck.vtm',
    // A Steam Deck: long and thin, so it looks small at the others' distance, and flat, so it sits high.
    zoom: 1.1,
    shiftDown: 0.05,
    spinTilt: 45
  },
  ps3: {
    model: 'private/ps3-slim.vtm',
    white: 0.9,
    // The PS logo's colour ran through a ColorRamp.
    fix: (material) => {
      if (material.name === 'ps_icon') material.color.setScalar(0.8)
    }
  },
  switch: {
    model: 'private/switch.vtm',
    zoom: 1.25,
    white: 0.6,
    spinTilt: 45,
    // The button labels' bump came out as a normal map, which shades them wrong.
    fix: (material) => {
      if (material.name.startsWith('ns_alpha_')) material.normalMap = null
    }
  },
  wiiu: {
    model: 'private/wiiu.vtm',
    zoom: 0.88,
    elevation: 15,
    shiftRight: 0.05,
    // Its top panel's normal map is a coarse pattern its mirror finish turns into blocks.
    fix: (material) => {
      if (material.name === 'Material.015' || material.name === 'Material.002') material.normalMap = null
    }
  },
  wii: {
    model: 'private/wii.vtm',
    zoom: 0.88,
    elevation: 15,
    shiftRight: 0.05,
    // White plastic, dimmed to match the PlayStation.
    white: 0.35,
    exposure: 0.55
  },
  snes: {
    model: 'private/snes.vtm',
    zoom: 0.88,
    shiftRight: -0.02,
    // Grey plastic, lit like the PlayStation.
    white: 0.35,
    exposure: 1.05
  },
  nes: {
    model: 'private/nes.vtm',
    zoom: 0.78,
    // Lighter plastic than the SNES's, so a little less exposure.
    white: 0.35,
    exposure: 0.75
  },
  genesis: GENESIS,
  // No 32X model: it sat on top of a Genesis anyway.
  sega32x: GENESIS,
  arcade: {
    // An 8BitDo arcade stick. White plastic, dimmed like the Wii.
    model: 'private/arcade.vtm',
    zoom: 0.92,
    white: 0.35,
    exposure: 0.7
  },
  neogeo: {
    // The Neo Geo AES: black, with its gold logo.
    model: 'private/neogeo.vtm'
  },
  n64: {
    model: 'private/n64.vtm'
  },
  xbox: {
    model: 'private/xbox.vtm',
    zoom: 0.85,
    // The X on top took its colour from an image texture with no image (black in Blender), which glTF makes white.
    // The power and eject buttons and trim are pure-white mirror metal, which the floor's reflection blows out to
    // white blobs: darker, and nothing quite a mirror. The front's right-hand panel (Material.013) had a bump map,
    // which glTF exported as an all-black normal map: its normals all tilted, catching the cyan rim as a cyan stripe.
    fix: (material) => {
      if (material.name === 'Alpha.028') material.color.setScalar(0.009)
      if (material.name === 'Material.013') material.normalMap = null
      if (material.name.startsWith('Silver')) material.color.setScalar(0.15)
      material.roughness = Math.max(material.roughness, 0.3)
    }
  },
  xbox360: {
    model: 'private/xbox360.vtm',
    zoom: 0.82,
    elevation: 15
  },
  gamecube: {
    model: 'private/gamecube.vtm',
    zoom: 0.62,
    elevation: 22,
    white: 0.7
  },
  psp: {
    model: 'private/psp.vtm',
    spinTilt: 45,
    // Its roughness maps are fingerprints and smudges, which read as haze on the screen and blotches on the
    // shell: one even gloss instead (the body keeps its metalness map, which glTF packs in the same texture).
    fix: (material) => {
      if (material.name !== 'Screen' && material.name !== 'Body') return
      material.roughnessMap = null
      material.roughness = material.name === 'Screen' ? 0.05 : 0.3
    }
  },
  saturn: {
    model: 'private/saturn.vtm',
    zoom: 0.85,
    white: 0.525
  },
  ps2: {
    model: 'private/ps2.vtm',
    zoom: 0.95
  },
  psx: {
    model: 'private/psx.vtm',
    zoom: 0.93,
    white: 0.35,
    exposure: 1.05
  },
  dreamcast: {
    model: 'private/dreamcast.vtm',
    zoom: 0.72,
    // White plastic: the white lights at full strength wash it out.
    white: 0.45
  }
}
