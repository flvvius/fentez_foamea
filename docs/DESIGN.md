# Design

The site follows the Editorial calm direction from
[flavius-design-taste](https://github.com/flvvius/flavius-design-taste). People come
back to it at lunch and in the evening to scan prices near them, so the page is built
for repeated scanning: type, spacing and hairlines do the work, not boxes.

## The one idea

The price is the figure. Every row starts with a tabular price column (price, struck
original, discount), and the map pins show the same number. Everything else on the row
is supporting text.

## Rules

- Rows sit on the page background, separated by a hairline. No cards.
- Type is Inter. Titles are weight 600, labels 500, body 400. Body is 16px with 1.625
  leading. The page title is 32px (28px on phones).
- Colour roles live as CSS variables at the top of `apps/web/src/styles/app.css`:
  background, foreground, muted, muted-foreground, border, input, ring, primary,
  warning-text, plus one accent, `--deal`, used only for discounts and the selected
  map pin.
- `--border` is for separators. `--input` is for anything you can click or type into,
  and it stays at 3:1 or better against the background.
- Status is text. "nu azi", "mai ai 12 min" and "doar livrare" are words, not pills.
- Controls use 8px radius. Pressed filter toggles fill with graphite and show a check
  mark, so the state survives forced colours.
- Motion is for state changes only and stays under 300ms. Reduced motion turns it off.

## What must keep working

- Filters by kind, distance, order and delivery, with counts per kind.
- Clicking a venue name or a map pin scopes the list to that venue. "Toate ofertele"
  clears it.
- "Arată ce e lângă mine" asks for location and re-sorts by distance.
- Offers that don't run today stay in the list, muted, after the ones that do.
- The page renders server-side with all offers before the map loads.

## Checked

At 1440px in light and dark, at 390px, and with text at 200%: no horizontal overflow,
visible focus ring, and contrast of at least 5.2:1 for text and 3.5:1 for control
borders in both themes.
