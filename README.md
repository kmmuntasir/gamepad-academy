# Gamepad Academy

A collection of zero-dependency, zero-stress HTML5 mini-games that help kids build gamepad muscle memory and dual-stick coordination — no fail states, no timers, just playful learning.

## Run

Open `index.html` in a modern browser (Chrome, Edge, or Firefox). Because the code uses ES module `import`s, `file://` may be blocked by CORS — if so, serve the repo over HTTP:

```bash
python -m http.server
# then open the printed URL (e.g. http://localhost:8000/)
```

A gamepad must be connected (and a button pressed once to wake it) for full functionality. A keyboard fallback (WASD/Arrow keys) is included for testing without a controller.

## Tests

Open `tests/index.html` in a browser — serve over HTTP (module CORS blocks `file://`):

```bash
python -m http.server
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
