# Gamepad Academy

A collection of zero-dependency, zero-stress HTML5 mini-games that help kids build gamepad muscle memory and dual-stick coordination — no fail states, no timers, just playful learning.

## Run

**Don't open `index.html` directly (double-click).** The game code uses ES module `import`s, which browsers block on the `file://` origin — opening the file directly means inputs (gamepad **and** keyboard) silently do nothing. Serve it over HTTP instead:

```bash
node serve.js
# → open http://localhost:8000/   (custom port: `node serve.js 5173`)
```

`serve.js` is a tiny zero-dependency Node script (no `package.json`, nothing to install). No Node handy? Fall back to Python:

```bash
python -m http.server   # then open the printed URL
```

A gamepad must be connected (press any button once to wake it — the browser only exposes the controller after that first press) for full functionality. A keyboard fallback (WASD = face buttons, Arrows = D-Pad, Q/E = bumpers, Shift/Space = triggers, C/V = stick clicks) is included for testing without a controller.

## Tests

Serve over HTTP (module CORS blocks `file://`), then open the test page:

```bash
node serve.js
# open http://localhost:8000/tests/index.html
```

You'll see a green/red in-browser report. No npm, no runner install — the hand-rolled harness in `tests/harness.js` drives the suite, which covers the pure game logic (mapping, sequences, lanes, collision, scoring).

## Structure

```
index.html                # Homepage with cards linking to each game
games/                    # 11 self-contained mini-games (one folder each)
  animal-spawner/  bumper-lane-runner/  butterfly-catcher/
  city-pop-dj/     claw-machine/         color-match-feeder/
  hot-air-balloon/ simon-says/           stargazer/
  submarine-sonar/ wildlife-photographer/
shared/                   # GamepadManager, button-mapping, glyph, utils, styles
assets/                   # Sounds and images
tests/                    # In-browser harness + *.test.js for every game's logic
```

## Deploy

Hosted on **GitHub Pages** via `.github/workflows/deploy.yml` — there is no build step (the repo root is the static site). On push to `main`, the workflow uploads the whole repo as the Pages artifact. Relative paths throughout mean the site also works correctly under a project subpath (`/<repo-name>/`).

## License

See [LICENSE](LICENSE).
