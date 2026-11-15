# NASA Space Apps Challenge 2026 — Project Submission

Text for each field of the Space Apps project submission form. Fill in the two links marked **TODO** before submitting.

---

## Project Name

**Artemis Kids**

## Challenge

Build a Junior Astronaut Mission Trainer

## Final Project (link)

https://nasa-spaceapp.pages.dev — free, no login, works on desktop and phone. **TODO: confirm this is the latest deployed version.**

## Project Demo (link)

**TODO: link to the 30-second demo video** (record it with the current build: real terrain, data window with sources, particle-storm alert).

---

## High-Level Project Summary

Artemis Kids is a free browser game that lets children aged 7–12 run a base at the Moon's south pole — on NASA's real lunar terrain, under real solar storms from NASA's space-weather records. After a three-minute training led by "Professor Luna", players build solar panels, batteries, an antenna, habitats and greenhouses on a 1.5 km stretch of the real Connecting Ridge (NASA PGDA, LOLA 5 m/pixel). The Sun never rises more than about 1.5° here, so long ridge shadows stop solar panels. Oxygen, water and food run down every day. Earth regularly sinks below the horizon and cuts off communication, and particle storms recorded by NASA's DONKI make you choose between staying outside to finish a task or taking shelter. Every choice costs something; there is no safe option that is free. Each night, Mission Control sends a short report that explains what happened and what to try next. Every number that drives the game is shown in an in-game "Data" window with its real source (NASA BVAD, NASA-STD-3001, ISS hardware, NOAA, PGDA, DONKI). Numbers set purely for gameplay are listed separately with the reason, so children learn not only how a lunar base works but also where real knowledge comes from.

## Project Details

### What it does

Artemis Kids turns the five decisions named in the challenge into things a child does with their hands:

| Challenge requirement | What the player does in the game |
| --- | --- |
| Power allocation | Places solar panels where the real terrain keeps them in sunlight, watches them stop when a ridge shadow arrives, and adds batteries for the dark hours. |
| Life support | Keeps oxygen, water and food above zero ("days we can live"). Builds life support and carries ice from a permanently shadowed crater, whose location was computed from the real terrain, before the suit's oxygen runs out. |
| Radiation shielding | When a real particle storm (SEP) arrives, decides whether to shelter inside or keep working. Shields habitats with regolith or water walls. Radiation dose has a real limit (NASA-STD-3001). |
| Food production | Builds greenhouses and assigns crew members to farm, trading crew time against research and repairs. |
| Communication delay and blackout | Builds an antenna where Earth is visible. Earth sinks below the horizon on its real ~27-day cycle (nodal month) and cuts off contact and supply orders until it returns, unless the player launches a relay satellite. |

The game loop:

1. **Day (outside):** time runs only while you are outside, so children are never rushed while reading. Walk, build and do tasks (carry ice, repair, cover the habitat with regolith) as short tap-or-trace mini-games.
2. **Night (inside the habitat):** time stops. A Mission Control room shows "today's actions", stocks, power and the supply rocket. Mission Control sends a short report: what went well, what is about to run out and how many days remain, and one suggestion for tomorrow. From here you can order supplies from Earth (limited by rocket capacity and earned by completing tasks) and assign crew jobs.
3. **Events:** real space-weather records, supply rockets that kick up landing dust and damage nearby equipment (as Apollo-era experiments measured), and Earth setting below the horizon.

Learning support built into play:

- **Training (about 3 minutes)** with Professor Luna. Each step says *what to do* and *why*. During training only the item the professor asks for can be built or ordered, so a child cannot get stuck.
- **Word dictionary.** Terms such as *regolith*, *SEP* and *permanent shadow* are added the moment the game first uses them.
- **27 fact cards** to collect. Each card shows the real data value behind it, with a link to the source.
- **"?" buttons** on every gauge explain what it means right now and what to do about it.
- **Japanese and English.** Every kanji has furigana (reading aids) for young readers.
- **Desktop and phone layouts**, tested at iPhone, iPad and small-laptop sizes.

### How it works

- **Real terrain:**
  - Our converter (`tools/make-terrain.ts`) reads the PGDA LOLA GeoTIFF for Site01 (Connecting Ridge).
  - It crops a 1.5 km square around the ridge summit and a shadowed crater, and shrinks height and width by the same factor (1/5). Slopes and shadow shapes therefore stay true, and on-screen distances are converted back to real meters.
  - It also exports a wider 6 km surrounding area, which is visible but not walkable. At the edge, the game explains that your oxygen tank cannot get you farther and back.
- **Sunlight, ice and Earth visibility:**
  - The same code the game uses traces the low polar Sun across the terrain for 72 directions.
  - Cells that never see the Sun become permanently shadowed regions, and that is where the ice is.
  - The landing site is chosen where the surroundings are sunlit in every direction.
  - Earth visibility uses the same line-of-sight test.
- **Simulation:** a deterministic TypeScript model, tested with Vitest, covers power balance, consumables, wear and repair, crew jobs, launches, radiation dose and space weather. It is separate from the 3D layer (Babylon.js), so the rules can be checked without a browser.
- **Honest numbers:**
  - All gameplay numbers live in one file, `data/values.json`. Each has either a real source with a URL, or the label "game tuning value: reason".
  - Where the game deliberately differs from reality, the label says what the real value is.
  - A test fails the build if any number lacks a source.
- **Safety and privacy:** no accounts, no free-text input from children, and no personal data or device information is collected. It is a fan-made project, not an official NASA product, and uses no NASA logos.

### Benefits and intended impact

- Lets children *feel* trade-offs that are usually only words in a textbook: shadows stop power, air and water run out, storms are dangerous, and Earth can go silent.
- Shows where scientific numbers come from, and that some numbers in a game are choices rather than facts. This builds early data literacy.
- Free, no installation, and runs on a phone, so it can be used at home, in classrooms and in science centers, in Japanese or English.

### Tools and technologies

TypeScript, Babylon.js (3D), Vite, Vitest, Biome, pnpm, Cloudflare Pages. A custom converter turns the GeoTIFF into game terrain, and a headless-Chrome screenshot tool tests phone, tablet and desktop layouts.

---

## Use of NASA Data

- **PGDA — High-Resolution LOLA Topography for Lunar South Pole Sites (Barker et al. 2021), Site01 "Connecting Ridge", 5 m/pixel GeoTIFF.** This is the entire walkable terrain and the visible surroundings. Sunlight, permanent shadow (ice), the landing site and Earth visibility are all computed from it.
- **DONKI (Space Weather Database of Notifications, Knowledge, Information).** Real solar flares (M5.9 on 2024-05-10 and X8.7 on 2024-05-14) and solar energetic particle events measured by GOES (2024-05-10, -11 and -13) trigger the in-game alerts. In the game, as in reality, the flare's light adds no dose on the Moon; the particle storm is what is dangerous.
- **NASA Life Support Baseline Values and Assumptions Document (BVAD, 2022).** Daily oxygen (0.84 kg), water (2.5 kg) and food (1.83 kg) per person, and crop productivity for the greenhouse.
- **NASA-STD-3001 Vol. 1 Rev C.** Career radiation limit (600 mSv) and per-event limit (250 mSv), used for the radiation gauge and for when an astronaut collapses.
- **ISS hardware results (NASA):**
  - Water recovery (93%) and oxygen generation (1.125 kg of water per kg of oxygen).
  - ISS Li-ion battery specific energy (about 77 Wh/kg), used for battery capacity.
  - Oxygen tank mass (2.45 kg per kg of oxygen) and packaging mass for supplies (NASA Langley logistics study, ASCEND 2023).
- **NASA GRC lunar surface power studies.** Solar array specific power and habitat power demand.
- **NASA studies of lunar dust.** Apollo-era experiments lost about 16% of solar power to dust kicked up by vehicles; this drives the landing-dust damage.
- **NASA SVS and the NASA eclipse website.** The Sun's path at the lunar pole (~1.5° tilt) and the nodal month (27.21 days) for Earth rising and setting.
- **NASA Moon Fact Sheet.** Gravity (1.62 m/s²), synodic day and communication delay (1.28 s).
- **NASA Image and Video Library.** Real photos of the hardware each facility is based on, shown when it is built and on fact cards (credits shown on each photo).

## Use of Space Agency Partner Data

We did not use partner-agency datasets directly. Lunar surface radiation (1.369 mSv/day) comes from the Chang'e-4 (CNSA) Lunar Lander Neutrons and Dosimetry measurement, as published in the peer-reviewed paper by Zhang et al. (2020) listed under References.

## References

- Barker, M.K. et al. (2021). Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions. *Planetary and Space Science* 203, 105119. https://pgda.gsfc.nasa.gov/products/78
- NASA DONKI: https://kauai.ccmc.gsfc.nasa.gov/DONKI/ (accessed via https://api.nasa.gov/)
- NASA (2022). Life Support Baseline Values and Assumptions Document, NASA/TP-2015-218570/REV2. https://ntrs.nasa.gov/citations/20210024855
- NASA-STD-3001 Vol. 1 Rev C (2023). https://standards.nasa.gov/
- Zhang, S. et al. (2020). First measurements of the radiation dose on the lunar surface. *Science Advances* 6, eaaz1334.
- NASA (2023). NASA Achieves Water Recovery Milestone on International Space Station.
- Takada, K. et al. Advanced Oxygen Generation Assembly status (ICES 2024, 2025), NASA MSFC.
- Dalton, P. et al. (2016). International Space Station Lithium-Ion Battery, NASA Battery Workshop.
- Lynch, C. & Goodliff, K. (2023). Logistics Rates and Assumptions for Future Human Spaceflight Missions Beyond LEO, ASCEND 2023.
- Csank, J. (2023). NASA Lunar Surface Operations & Power Grid, NASA GRC.
- Kerslake, T. et al. (2016). Structural design considerations for a 50 kW-class solar array, NASA GRC.
- Campos, R. et al. (2023). The Dust Problem: Mitigation Methods for Flexible Solar Arrays under Lunar Conditions, Space Power Workshop.
- NOAA SWPC: Solar Flares (Radio Blackouts); Solar Radiation Storm.
- NASA Scientific Visualization Studio: The Sun's Path at Different Lunar Latitudes (5038); Libration in Latitude (5199).
- NASA Moon Fact Sheet: https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html
- NASA Image and Video Library: https://images.nasa.gov

The in-game "Data" window lists every value with its exact source link.

## Use of Artificial Intelligence

We used AI tools in development, and say so openly:

- **Code:** written with AI coding agents (Claude Code by Anthropic), following a human-written specification. Every change was reviewed by a human and checked by automated tests, type checks and screenshots at phone, tablet and desktop sizes.
- **Research:** AI agents helped find and verify sources for gameplay numbers. Every cited value was checked against the source page, and values that could not be verified are labeled as game tuning values instead of being given a source.
- **Text:** in-game text (Japanese and English) was drafted with AI and reviewed by the team.
- **Original artwork:** the favicon and the professor character are original and were made with AI assistance. All photos are real NASA images with credits.

The game contains no AI at runtime: it does not call any AI model and collects no data from players.
