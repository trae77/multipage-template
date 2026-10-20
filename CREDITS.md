# Credits

Photos, if any, are listed per demo in content/. See client-site-templates/CREDITS.md for the shared Unsplash inventory.

## Fonts and icons (licenses)
Checked 2026-10-19 against the font lists in `tools/design.mjs` / `tools/mockup.mjs` (client-site-templates) and `tools/*.vendor.mjs` / `src/public/*.css` (multipage-template).

**Fonts.** Every font loads from Google Fonts (`fonts.googleapis.com`). Each one is licensed under the **SIL Open Font License 1.1** (https://openfontlicense.org), which allows commercial use, embedding in client websites and self-hosting. The only conditions are not selling the font files on their own and keeping the license with any copies you redistribute. License pages: https://fonts.google.com/specimen/<Font+Name>/license.

| Font | License |
|---|---|
| Anton | OFL 1.1 |
| Barlow Semi Condensed | OFL 1.1 |
| Bebas Neue | OFL 1.1 |
| Cormorant Garamond | OFL 1.1 |
| DM Sans | OFL 1.1 |
| DM Serif Display | OFL 1.1 |
| Fraunces | OFL 1.1 |
| IBM Plex Sans | OFL 1.1 |
| Inter | OFL 1.1 |
| Lato | OFL 1.1 |
| Libre Baskerville | OFL 1.1 |
| Montserrat | OFL 1.1 |
| Nunito / Nunito Sans | OFL 1.1 |
| Oswald | OFL 1.1 |
| Outfit | OFL 1.1 |
| Playfair Display | OFL 1.1 |
| Plus Jakarta Sans | OFL 1.1 |
| Source Sans 3 | OFL 1.1 |
| Work Sans | OFL 1.1 |
| System UI stack (`system-ui, -apple-system, Segoe UI, Roboto, …`) | Visitor's own installed fonts. Nothing is shipped. |

Privacy note: loading fonts from Google's CDN shows Google the visitor's IP address. The generated `privacy.html` says so under "Third-party content". Self-hosting the same OFL files removes this, and is allowed.

**Icons.** No icon font or icon library is used. Number chips (`01`, `02`, …), arrows (`→`, `←`, `×`, `−`, `+`) and stars are plain Unicode text written in this repo. A few small inline shapes (menu bars, gradients) are CSS written for this repo. Nothing needs attribution.

**Maps.** The optional map embeds OpenStreetMap (`openstreetmap.org/export/embed.html`). The data is © OpenStreetMap contributors under the ODbL (https://www.openstreetmap.org/copyright). The required attribution link is printed under every map. Address lookup uses OpenStreetMap Nominatim, only at build time and only when `--map-area` is given.

**Code.** axe-core (MPL-2.0) and Playwright (Apache-2.0) are dev/test tools only. They are never shipped in a site.
