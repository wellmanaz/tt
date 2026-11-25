# Tendie Town

A four-player couch economic strategy game for the browser, played with game controllers. The apes made it to the moon; now somebody has to run the place.

## Play

- Game: https://wellmanaz.github.io/tt/
- Controller test: https://wellmanaz.github.io/tt/pad
- AI-only demo: https://wellmanaz.github.io/tt/?demo
- Shorter game: add `?rounds=6`
- Character walk test: https://wellmanaz.github.io/tt/walk (every character pacing its own lane; `?walk` on the game page does the same)

Press A to join, Menu to start. Empty seats are played by Hedgies (AI). Y (or M on a keyboard) toggles the music, which is an original loop synthesised in the browser (`js/music.js`).

By default the game streams the M.U.L.E. main theme from the site that hosts it (no copy is stored in this repository) and falls back to its own synthesised loop (`js/music.js`) if that fails to load. `?music=synth` forces the built-in loop; `?music=<url>` plays any other audio file. Music is turned down (not off) during auctions so the bidding is audible.

## A round

1. **Land grab** — a scanner sweeps the plots; press A to claim the one it's on. One free plot each per round.
2. **Turns** (poorest player first) — you start in The Exchange. Buy a bot at the Bot Lot, fit a tool at one of the four shops, walk out an exit to your plot and press A on its pad to install it. Miss the pad, or run out of time with a bot in tow, and it bolts. Press X on a plot of yours that has a bot to pick that bot back up: put it down on another of your pads, walk it into a shop for a different tool, or sell it to the Bot Lot, which pays half of what a new one with that tool would cost today. The Assay Office checks a plot for hidden diamonds. The YOLO Bar ends your turn for cash (more the sooner you quit). A Bitcoin sometimes blinks into view near you; run over it before it vanishes for a bounty. Your turn is shorter if you are short on tendies, and standing still burns the clock twice as fast.
3. **Production** — each bot produces by terrain: the Dip (the river valley) grows tendies, the Solar Flats pump fuel, Silicon Ridge mines chips, and diamonds are hidden in a vein that could be anywhere but the Dip; only an assay reveals them. Bots next to a same-tool bot of yours make +1; every three of the same tool make +1. Every non-fuel bot burns 1 fuel first or sits idle. A random event may hit the colony.
4. **Trading floor** — tendies, fuel, chips, then diamonds. Declare buyer or seller (stick up/down), then buyers push up and sellers push down until they meet. The Exchange's own prices are the edges of the floor: it sells at the top and buys at the bottom, so the two sides can meet each other first. It only buys up to what the colony needs for the next two rounds, and once it has that its buy line goes, so there is no floor under a glut. Its prices come from how much of that it is holding: an empty warehouse asks half again the fair price, a warehouse at its target asks the fair price, and twice its target asks a fifth less. The fair price itself drifts 8% a round toward whichever way the shortage goes, so chips get dearer while the colony is burning them and cheaper once the warehouse fills up again. Diamonds only go offworld, at a price that climbs about 8% a round (with a wobble) and dips when a lot are dumped at once; there is no cap on it.
5. **Standings** — half your spare tendies and fuel spoil. The colony burns a chip a round for every 8 worked plots, out of the Exchange's stock, before the Exchange builds bots from what is left (2 chips each). If the colony goes short, no bots get built, and an emptied warehouse makes chips dear on its own. Bot prices rise with the chip price.

After 12 rounds the richest ape wins, and the colony as a whole needs $60,000 to count as a success.

## Characters

Six to pick from, each with a trade-off shown on the character card: Ape, Autist, Degen, Smooth-Brain, Regard (nothing of theirs spoils, but starts poorer and pays more in shops) and Full-Regard (starts with $1,800, pays 30% more in shops, shorter turns).

Each character is one file in `js/chars/` holding everything about it: stats, the card text, its cell on the art sheet and how it moves. `js/chars/index.js` lists the fields and the lobby order; copy a file and add it to the list to make a new character. The art for all but Smooth-Brain is cut at load time from `assets/chars/sheet.jpg`; the flat grey background is removed in the browser, so a replacement sheet only needs the same six-cell layout. Smooth-Brain (and the Hedgie AI) have no cell and are drawn in code in their files. A character can instead bring its own animation sheet, a grid of walk frames such as a Ludo export, named as `sheet` in its file and played with the `frames` gait; the purple key colour and any watermark on it are stripped at load time. How a cut-out moves is its `gait`, a `walk({ ... })` or `roll({ ... })` from `js/chars/gaits.js` whose knobs (stride, arm swing, bob, lean, castor chatter and so on) are set per character.

## Your own images

A tendies plot shows a fast-food sign instead of a robot. The signs are parodies drawn in code; to use pictures of your own, put PNG files in `assets/food/` named `1.png`, `2.png`, … (up to 8) and they are used instead. No such images are included in this repository.

## Contents

- `index.html`, `js/main.js` — browser side: input, lobby, drawing
- `js/core.js` — game rules and state, no browser code
- `js/chars/` — one file per character (stats, card text, art cell, gait, fallback drawing); `gaits.js` has the walk and roll animations
- `js/ai.js` — rule-based AI that produces controller-style input
- `pad/index.html` — shows every connected controller and its button presses
- `walk/index.html` — all characters walking back and forth, for tuning their files
- `test/sim.js` — plays AI-only games headless and reports balance statistics
- `test/rules.js` — checks the rules that are hard to see in a playtest (land stays owned, bots come back, the Exchange stops buying, prices follow its stock)
- `serve.py` — local server with browser caching disabled

## Run locally

```sh
python3 serve.py              # then open http://localhost:8000/ (serves with caching off, so edits show on reload)
node test/sim.js 100          # AI-only test games
node test/rules.js            # rule checks
```
