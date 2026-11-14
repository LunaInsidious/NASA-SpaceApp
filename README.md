# NASA-SpaceApp

Space Mission Design Game https://www.spaceappschallenge.org/

A browser-based 3D game about running an outpost at the lunar south pole, built for the NASA Space Apps Challenge 2026 challenge "Build a Junior Astronaut Mission Trainer". The spec and task plan (in Japanese) are in [docs/SPEC.md](docs/SPEC.md).

## How to play

Keep your crew alive at the lunar south pole and grow the base. The base is complete when **Development** reaches 60.

| Action                                                                    | Keyboard                               | Phone              |
| ------------------------------------------------------------------------- | -------------------------------------- | ------------------ |
| Walk / jump                                                               | WASD or arrow keys / Space             | Virtual pad / Jump |
| Turn the camera                                                           | Drag the mouse                         | Drag the screen    |
| Do the action shown at the bottom right (go inside, collect ice, repair…) | E                                      | Action button      |
| Build                                                                     | B, then Enter to place / Esc to cancel | Build              |
| Order a launch from Earth                                                 | L                                      | Launch             |
| Assign crew                                                               | C                                      | Crew               |

Things to try: put a solar panel in a shadow and see it stop; build a battery for the dark hours; carry ice from a dark crater before your suit oxygen runs out; when a solar flare warning (a real past event from NASA's DONKI) arrives, decide whether to go inside.

## Use of AI

The code in this repository is written with the help of AI coding agents (Claude Code by Anthropic), following the spec in [docs/SPEC.md](docs/SPEC.md).

## Development

Requires Node.js 22 and pnpm 11.

```sh
pnpm install
pnpm dev          # dev server
pnpm test         # Vitest
pnpm lint         # Biome (format + lint); `pnpm format` applies fixes
pnpm build        # type check + production build into dist/
pnpm worker:dev   # run the Cloudflare Worker (worker/) locally
```
