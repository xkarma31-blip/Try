# 🧙‍♀️ Witches.io

A tiny browser `.io` game in the spirit of **arrow.io** + **magica.io** — but with witches. No build step, no dependencies, plays on phones and desktops.

**Play it:** https://xkarma31-blip.github.io/Try/

## Features

- Top-down witch arena with auto-cast spells at the nearest enemy
- 5 enemy types: zombies 🧟‍♀️, bats 🦇, dark casters 🧙‍♂️, vampires 🧛‍♀️, ghosts 👻
- **Level-ups with random spell upgrades** (damage, fork, pierce, regen, …)
- **Mobile**: dual virtual joysticks — left thumb moves, right thumb aims
- **Desktop**: WASD / Arrows to move, mouse to aim (or just let auto-aim work)
- Light / Dark theme toggle, preference saved
- Particle FX, minimap, HP/XP bars, scrolling decor

## Controls

| Platform | Move | Aim / Cast |
|----------|------|------------|
| Desktop  | `WASD` or arrows | Mouse direction · auto-fire |
| Mobile   | Left half: drag to move | Right half: drag to aim (auto-fire otherwise) |

If you don't aim manually, your witch automatically targets the nearest threat.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Static site — served from the repo root via GitHub Pages.
