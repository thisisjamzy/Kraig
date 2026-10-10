Generated from `public/logos/black_logomark.png` (87x87, the only source;
no vector exists, so it is upscaled with Lanczos and a light unsharp mask).
The mark's "d" is a transparent cutout, so every icon puts a white disc
(inset 4%) behind the mark to make the "d" white instead of see-through.

- icon-192.png            192x192, transparent background, mark at 85%,
                          "any" purpose
- icon-512.png            512x512, same
- icon-maskable-512.png   512x512, full-bleed black background (#111826,
                          sampled from the logomark itself), mark at 60% so
                          the "d" survives an aggressive circular mask
- apple-touch-icon.png    180x180, same full-bleed black, no alpha (iOS
                          renders transparency as black) — referenced from
                          the root layout's metadata.icons.apple, not the
                          manifest, since iOS ignores the manifest's icons

The manifest and layout link them with `?v=2` so installed apps and
browsers fetch the new files; bump it when the icons change again.
