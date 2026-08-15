# Pitch deck

`Aegis-Pitch-Deck.pptx` — 13 slides, 16:9, with speaker notes on every slide.

Rebuild after editing `build.js`:

```bash
npm install pptxgenjs sharp
node mark.js     # rasterises the Aegis shield used on the title and closing slides
node build.js
```

Set in Arial throughout, deliberately: Calibri ships with Office only and
substitutes to a serif on machines without it, which is what a judge opening the
file on a bare Mac or in Google Slides would have seen.
