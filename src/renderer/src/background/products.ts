import type { MeshStandardMaterial } from 'three'

// Consoles with their own backdrop on their tab: the console itself in neon, the camera
// swinging round it like a product shot (product/scene.ts). The models aren't in the public
// repo: scripts/private-assets.mjs copies them in when they're there, and without one the
// tab shows the usual backdrop.

export interface Product {
  /** The model (glTF binary), exported from Blender with the console lying as it should on the floor. */
  model: string
  /** How much nearer the camera comes than for the PS3 (1): a thin console looks smaller at the same width, its front edge further off. */
  zoom?: number
  /** How far above the console the camera looks down at the front of its swing (degrees; default 30): lower shows more of its face. */
  elevation?: number
  /** Moves it this much of the screen's width to the right (negative: left), keeping its perspective. */
  shiftRight?: number
  /** How bright its white lights are, against the PS3's first look (1). */
  white?: number
  /** Overall brightness, all lights included (1): for a light-coloured console that outshines the black ones. */
  exposure?: number
  /** Fixes for what glTF couldn't carry over from Blender, by material. */
  fix?: (material: MeshStandardMaterial) => void
}

export const PRODUCTS: Partial<Record<string, Product>> = {
  ps3: {
    model: 'private/ps3-slim.glb',
    white: 0.9,
    // The PS logo's colour ran through a ColorRamp.
    fix: (material) => {
      if (material.name === 'ps_icon') material.color.setScalar(0.8)
    }
  },
  switch: {
    model: 'private/switch.glb',
    zoom: 1.25,
    white: 0.6,
    // The button labels' bump came out as a normal map, which shades them wrong.
    fix: (material) => {
      if (material.name.startsWith('ns_alpha_')) material.normalMap = null
    }
  },
  wiiu: {
    model: 'private/wiiu.glb',
    zoom: 0.88,
    elevation: 15,
    shiftRight: 0.05,
    // Its top panel's normal map is a coarse pattern its mirror finish turns into blocks.
    fix: (material) => {
      if (material.name === 'Material.015' || material.name === 'Material.002') material.normalMap = null
    }
  },
  n64: {
    model: 'private/n64.glb'
  },
  xbox360: {
    model: 'private/xbox360.glb',
    zoom: 0.82,
    elevation: 15
  },
  gamecube: {
    model: 'private/gamecube.glb',
    zoom: 0.62,
    elevation: 22,
    white: 0.7
  },
  psp: {
    model: 'private/psp.glb',
    // Its roughness maps are fingerprints and smudges, which read as haze on the screen and blotches on the
    // shell: one even gloss instead (the body keeps its metalness map, which glTF packs in the same texture).
    fix: (material) => {
      if (material.name !== 'Screen' && material.name !== 'Body') return
      material.roughnessMap = null
      material.roughness = material.name === 'Screen' ? 0.05 : 0.3
    }
  },
  saturn: {
    model: 'private/saturn.glb',
    zoom: 0.85,
    white: 0.525
  },
  ps2: {
    model: 'private/ps2.glb'
  },
  psx: {
    model: 'private/psx.glb',
    white: 0.35,
    exposure: 0.55
  },
  dreamcast: {
    model: 'private/dreamcast.glb',
    zoom: 0.72,
    // White plastic: the white lights at full strength wash it out.
    white: 0.45
  }
}
