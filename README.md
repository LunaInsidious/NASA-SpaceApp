# NASA-SpaceApp

Space Mission Design Game https://www.spaceappschallenge.org/

A browser-based 3D game about running an outpost at the lunar south pole, built for the NASA Space Apps Challenge 2026 challenge "Build a Junior Astronaut Mission Trainer". The spec and task plan (in Japanese) are in [docs/SPEC.md](docs/SPEC.md).

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
