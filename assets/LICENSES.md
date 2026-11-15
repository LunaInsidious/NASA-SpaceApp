# Asset Sources and Licenses

## NASA photos (public/nasa/)

Photos from the NASA Image and Video Library (https://images.nasa.gov), resized versions (`~small.jpg`). NASA images are generally not subject to copyright in the United States (NASA Images and Media Usage Guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/ ). No photo shows the NASA insignia or logotype.

- `iss047e057658~small.jpg` — "Universal Battery Charger (UBC) Install" — NASA (JSC) — https://images.nasa.gov/details/iss047e057658
- `PIA25136~small.jpg` — "A New Antenna for NASA's Deep Space Network" — NASA/JPL-Caltech — https://images.nasa.gov/details/PIA25136
- `KSC-20180307-PH_CSH01_0015~small.jpg` — "PONDS Watering System for Veggie" — NASA (KSC) — https://images.nasa.gov/details/KSC-20180307-PH_CSH01_0015
- `KSC-08pd3209~small.jpg` — "KSC-08pd3209" (Water Recovery System rack 2) — NASA (KSC) — https://images.nasa.gov/details/KSC-08pd3209
- `KSC-20231102-PH-FMX01_0020~small.jpg` — "MSOLO PRIME-1 Simulation" — NASA (KSC) — https://images.nasa.gov/details/KSC-20231102-PH-FMX01_0020
- `iss053e238888~small.jpg` — "Personal Radiation Shielding Garment" — NASA (JSC) — https://images.nasa.gov/details/iss053e238888
- `PIA00001~small.jpg` — "South Pole Region of the Moon as Seen by Clementine" — NASA/JPL — https://images.nasa.gov/details/PIA00001
- `PIA24161~small.jpg` — "Lunar Trailblazer to Support NASA's Artemis Program" — NASA/JPL-Caltech — https://images.nasa.gov/details/PIA24161
- `GSFC_20171208_Archive_e001209~small.jpg` — "NASA's SDO Shows Images of Significant Solar Flare" — NASA/SDO (GSFC) — https://images.nasa.gov/details/GSFC_20171208_Archive_e001209

## Lunar terrain (public/terrain/site01/)

Derived from `Site01_final_adj_5mpp_surf.tif` (Site01 Connecting ridge, 5 m/pixel) of "High-Resolution LOLA Topography for Lunar South Pole Sites", NASA Goddard Space Flight Center Planetary Geodynamics Data Archive (PGDA) — https://pgda.gsfc.nasa.gov/products/78 . Cropped and scaled down with `tools/make-terrain.ts` (`pnpm terrain`). NASA data are generally not subject to copyright in the United States.

Citation: Barker, M.K. et al. (2021) Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions. Planetary and Space Science 203, 105119. doi:10.1016/j.pss.2020.105119

- `height.bin` — Heights of the walkable area: a 1500 m square around X −11470 m, Y −13070 m (polar stereographic), sampled at 301×301 points and scaled down to 1/5
- `outer.bin` — Heights of the surrounding area (view only): a 6000 m square around the same center, sampled at 241×241 points, same scale
- `illumination.png` — Average sunlight fraction computed with the game's lighting model (top is toward Earth)
- `site.json` — Source, extent, scale, latitude, lander position and ice locations (permanently shadowed regions)

## Earth image (public/textures/)

- `earth-bluemarble-2048.jpg` — "Blue Marble: Next Generation" with topography and bathymetry, resized to 2048×1024 — NASA Earth Observatory (NASA images by Reto Stöckli) — https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ . NASA images are generally not subject to copyright in the United States.

## Audio

Sound effects are synthesized at runtime with the Web Audio API (`src/ui/fx.ts`) and are original to this repository.

Background music (public/audio/):

- `calm-track-loop.m4a` — "Calm Track" (loop version, `calm_track-loop.ogg`) — pmiller — CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/ ) — https://opengameart.org/content/calm-track . Converted from Ogg Vorbis to AAC; the music itself is unchanged.

## Favicon (public/favicon.\*, public/apple-touch-icon.png)

Original to this repository, created with the help of AI (Claude). A lunar horizon, a base dome and the Sun just above the horizon, drawn as SVG; the PNG and ICO files are exported from that SVG. No NASA logos or design elements are used.
