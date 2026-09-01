Generated from `public/logomark_primary.png` (see the git history of this
directory for the script). Regenerate the same way if the logo ever changes:

- icon-192.png            192x192, transparent background, "any" purpose
- icon-512.png            512x512, transparent background, "any" purpose
- icon-maskable-512.png   512x512, full-bleed brand-green background (#0DBD80,
                          sampled from the logomark itself), the "k" glyph
                          alone scaled to 60% so it survives an aggressive
                          circular mask
- apple-touch-icon.png    180x180, same full-bleed green, no alpha (iOS
                          renders transparency as black) — referenced from
                          the root layout's metadata.icons.apple, not the
                          manifest, since iOS ignores the manifest's icons
