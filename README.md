# Blob.io

A tiny agar.io-style `.io` game built with plain HTML/CSS/JS — no dependencies, no build step.

**Play it:** https://xkarma31-blip.github.io/Try/

## Features

- Eat smaller blobs, dodge bigger ones, climb the food chain
- 14 AI bots with threat-avoidance + hunting behaviour
- Smooth camera, minimap, large scrolling world
- **Light / Dark theme toggle** (preference saved to `localStorage`)
- Space to boost (costs mass)
- Mouse-aim movement

## Controls

| Input | Action |
|-------|--------|
| Mouse | Move toward cursor |
| Space | Short speed boost |

## Run locally

```bash
# any static server works
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Pushed to GitHub Pages from the `main` branch root via `.github/workflows/pages.yml`.
