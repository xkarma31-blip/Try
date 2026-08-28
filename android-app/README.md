# Blobz.io — Android App (Local-network / LAN multiplayer)

A native Android app (Kotlin + `WebView`) that plays **Blobz.io** with real
**local-network multiplayer** — like Mini Militia, Special Forces Group 2, or
Soul Knight. **No PC, no terminal, no internet required.** One phone *hosts* the
game (the server runs inside the app); everyone else on the same WiFi joins
automatically via mDNS/Zeroconf discovery.

## How to play (the whole point)

1. Make sure everyone is on the **same WiFi** (or Wi-Fi Direct group).
2. On one phone, open the app and tap **Host LAN Game**.
   - That phone starts an in-app authoritative server and advertises it on the LAN.
3. On every other phone, open the app and tap **Join LAN Game**.
   - The app shows a **room list** of every Blobz game on the network, with live
     player counts, and you tap the one to join. No URLs, no typing.
4. (Optional) **Solo / Offline** runs the single-player + local-2P modes with no
   network at all.

The hosting phone also plays — it connects to its own server on `localhost`.

### No WiFi router? Use Wi-Fi Direct
If there's no access point, use the **Host (Wi-Fi Direct)** / **Join (Wi-Fi Direct)**
buttons instead. The host creates a Wi-Fi Direct group (becoming the Group Owner)
and runs the server on it; the app tells you the network name/password. Joiners
scan for the host peer, connect, and are then dropped into the same room list.
Everything still runs on the devices — no internet, no PC.

> Wi-Fi Direct needs the location / "Nearby devices" permission (requested on
> first launch). Grant it when prompted or the scan won't find peers.

## How it works

- `GameServer.kt` — an authoritative game server written in Kotlin
  (`org.java-websocket`), running **in the host app's process**. It simulates
  the world (players + bots + food) on a ~30 Hz tick and broadcasts snapshots.
- `MainActivity.kt` — full-screen `WebView` that loads the bundled client
  (`assets/index.html`). For Host it starts `GameServer` and points the WebView
  at `ws://127.0.0.1:3000`; for Join it uses Android `NsdManager` to discover
  the `_blobz._tcp.` service and shows a **room list** (with live player counts
  from the advertised TXT record) — you tap a room to join. `Join (Wi-Fi Direct)`
  uses `WifiP2pManager` to find the host peer, form a group, then reuse the same
  NSD room list. The page exposes `window.blobzConnect(url)` so the app can join
  with zero manual input.
- `index.html` / `game.js` / `style.css` — the client. In online mode it sends
  only your movement direction to the server and renders the snapshots it
  receives (with light client-side prediction for your own blob).

## Building / running

Open `android-app/` in **Android Studio** (Hedgehog+) and Run to a device or
emulator. Requirements: `minSdk 21`, internet + WiFi multicast permissions
(already declared). The app embeds everything; nothing to start separately.

## Desktop / cross-play (optional, not required)

For playing from a laptop browser, or to test without a phone, there is also a
Node server (`server/index.js`) that speaks the exact same protocol:

```bash
npm install
npm run server          # serves + simulates on http://localhost:3000 (LAN: http://<lan-ip>:3000)
```

Then open that URL in any browser, or point the app's manual server field at it.
This is purely optional — the Android app is fully self-sufficient.

## Updating the game

The client in `app/src/main/assets/` is a copy. After editing the repo-root
`index.html` / `game.js` / `style.css`, re-copy:

```bash
cp ../index.html ../game.js ../style.css app/src/main/assets/
```
