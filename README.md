# Artemis Kids

A browser 3D game for kids aged 7–12: run a base at the Moon's south pole, on NASA's real lunar terrain and under real solar storms from NASA's space-weather records. Built for the NASA Space Apps Challenge 2026 challenge "Build a Junior Astronaut Mission Trainer".

> This is a fan-made game inspired by NASA's Artemis program. It is not an official NASA product.

- Play: https://nasa-spaceapp.pages.dev (free, no login, desktop and phone, English / 日本語)
- Submission text: [docs/SUBMISSION.md](docs/SUBMISSION.md)
- Spec and task plan (in Japanese): [docs/SPEC.md](docs/SPEC.md)

## How to play

Keep your crew alive at the lunar south pole and grow the base. The base is complete when **Development** reaches 60. A three-minute training with Professor Luna comes first.

- **Outside (day):** time runs only while you are outside. Walk, build, and do tasks (carry ice from a dark crater, repair, cover the habitat with regolith) before your suit's oxygen runs out.
- **Inside the habitat (night):** time stops. The Mission Control room shows today's actions, supplies, power and the supply rocket. Read the report from Mission Control, then reply to order supplies or open the monitor to assign crew jobs. Press "Next morning" to end the day.

| Action                                                                         | Keyboard                                                  | Phone / tablet                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------- |
| Walk                                                                           | WASD or arrow keys                                        | Virtual pad (bottom left)                   |
| Turn and zoom the camera                                                       | Drag / mouse wheel                                        | Drag / pinch                                |
| Do the action shown at the bottom right (go inside, collect ice, repair…)      | E                                                         | Action button                               |
| Build                                                                          | B, then click where to place it (or Enter), Esc to cancel | Build, then tap the ground and "Place here" |
| Details (stocks, power, breakdown)                                             | I                                                         | Details                                     |
| Order supplies / assign crew (inside the habitat)                              | L / C                                                     | Reply / Monitor in the control room         |
| Menu (pause, word dictionary, fact cards, save, data sources, sound, language) | Menu button (Esc closes any window)                       | Menu                                        |

Each gauge at the top left (suit oxygen, life support days, power, radiation) has a "?" that explains what it means right now.

Things to try:

- Put a solar panel where a ridge shadow will reach it, and watch it stop.
- Build a battery for the dark hours.
- Carry ice from a permanently shadowed crater before your oxygen runs out.
- When a real particle-storm alert (from NASA's DONKI) arrives, decide whether to shelter inside.
- Build away from the lander: supply rockets kick up dust when they land.

## Real data

- **Terrain:** NASA PGDA, LOLA 5 m/pixel, Site01 "Connecting Ridge" (Barker et al. 2021). A 1.5 km square is shrunk to 1/5 in both height and width, so slopes and shadows stay true, and a wider 6 km area is shown around it. Sunlight, permanent shadow (ice) and Earth visibility are computed from the terrain. Craters and rocks smaller than the data resolution are added for looks only.
- **Space weather:** real flares and solar energetic particle events from NASA's DONKI (May 2024).
- **Numbers:** every gameplay number is in `data/values.json`, each with a real source (NASA BVAD, NASA-STD-3001, ISS hardware, NOAA, and others) or labeled as a game tuning value with the reason. All of them are shown in the in-game **Data** window.

## Use of AI

The code in this repository is written with the help of AI coding agents (Claude Code by Anthropic), following the spec in [docs/SPEC.md](docs/SPEC.md) and reviewed by people. AI agents also helped find and verify data sources. The game itself uses no AI at runtime and collects no personal data.

## Development

Requires Node.js 22 and pnpm 11.

```sh
pnpm install
pnpm dev          # dev server
pnpm test         # Vitest
pnpm lint         # Biome (format + lint); `pnpm format` applies fixes
pnpm build        # type check + production build into dist/
pnpm screens <dev URL> [step]   # screenshots at iPhone / iPad / small-laptop sizes into .scratch/screens/
pnpm terrain      # rebuild public/terrain/site01/ from the PGDA GeoTIFF in .scratch/terrain/
pnpm worker:dev   # run the Cloudflare Worker (worker/) locally
```

Assets and their licenses: [assets/LICENSES.md](assets/LICENSES.md).
