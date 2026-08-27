# Blobz.io — Android App (Local Multiplayer)

A native Android wrapper (Kotlin + `WebView`) around the Blobz.io browser game,
with a **local 2-player mode** so two people can play on the same phone/tablet.

## What's inside

- `app/src/main/assets/index.html`, `game.js`, `style.css` — the game (copied from the repo root).
- `app/src/main/java/com/blobz/game/MainActivity.kt` — full-screen `WebView` that loads the game and keeps the screen awake / hides system UI for an immersive experience.
- Gradle build files (`build.gradle`, `settings.gradle`, `app/build.gradle`).

## Gameplay

| Mode | Players | Controls |
|------|---------|----------|
| **1 Player** | vs 18 bots | Mouse (desktop) or drag (mobile) to steer |
| **2 Players (Local)** | 2 humans + 10 bots, same device | Each human uses a touch joystick on their half of the screen (left half = P1 gold, right half = P2 pink). Camera auto-frames both players. Last human blob standing wins. |

The world, bots and food are shared; bigger blobs eat smaller ones. Touch joysticks appear at the bottom corners in 2P mode.

## Building / running

You need the **Android SDK** (Android Studio ≥ Hedgehog, or the command-line `gradle`).

### Option A — Android Studio (easiest)
1. Open this `android-app/` folder as a project.
2. Let it sync Gradle.
3. Plug in a device (or start an emulator) and click **Run ▶**.

### Option B — Command line
1. Generate the Gradle wrapper if missing:
   ```bash
   gradle wrapper --gradle-version 8.5
   ```
2. Build the debug APK:
   ```bash
   ./gradlew assembleDebug
   ```
3. Install on a connected device:
   ```bash
   ./gradlew installDebug
   # or: adb install app/build/outputs/apk/debug/app-debug.apk
   ```

## Updating the game

The assets in `app/src/main/assets/` are copies. After changing the game in the
repo root, re-copy them:

```bash
cp ../index.html ../game.js ../style.css app/src/main/assets/
```
