Generated from the style guide's logo (`Remix/Logos/primary.png`, the
purple rounded square, 952 px). The artwork's own purple is `#4D2561`
(used as supplied; the guide's primary is `#553199`). The "d" in the
square is a transparent cutout, so it is filled white.

- icon-192.png            192x192, transparent background, the square at 90%, "any"
- icon-512.png            512x512, same
- icon-maskable-512.png   512x512, full-bleed `#4D2561`, the white "d" alone,
                          small enough to survive a circular mask
- apple-touch-icon.png    180x180, full-bleed `#4D2561` with the white "d", no
                          alpha (iOS renders transparency as black; it rounds the
                          corners itself) — referenced from the root layout's
                          metadata.icons.apple, not the manifest

The lockups used in the app are in `public/brand/` (dreda-full,
dreda-full-reversed, dreda-mark, dreda-mark-reversed), made from the same
files. The manifest and layout link the icons with `?v=3`; bump it when the
icons change again.
