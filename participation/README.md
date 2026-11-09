# RAT & CITY — Participatory Mapping prototype

An independent, embeddable front-end prototype of the **Your Voice** section.

## Connected cloud version

This package is configured for the live **rat-city** Supabase project in
**Bai Le's Org**. Open `index.html` or publish the full directory to your
existing GitHub Pages site. Live starts automatically and reads shared data;
There is no data-mode selector or local-only submission path. Every form submission must be confirmed by the server.

Project dashboard: https://supabase.com/dashboard/project/kdumywidhbmimzdigcgo

See [CLOUD_SETUP_CN.md](CLOUD_SETUP_CN.md) for usage and maintenance. Submission
goes through the deployed `rat-city-submit` server endpoint; the browser cannot
directly call the database writer, edit or delete public responses. No server
process needs to run on your laptop.

Real cloud verification passed: two independent API clients, server submission,
Realtime delivery, second-client reads, idempotent retry, rate limiting and
denied direct writes. This verifies the backend integration; a final check from
your published group website and a physical phone is still recommended.

## Run locally

You can now **double-click `index.html`** to open it in Chrome or Edge: the map is a self-contained SVG and does not need a map server, WebGL, network request, or token.

Alternatively, use VS Code **Live Server**, or start a web server in this directory:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

Map geometry requires no map token. Displaying and submitting shared responses requires an internet connection and the included Supabase configuration.

## What is real and what is synthetic?

- **Real geography:** Five borough polygons from [NYC Open Data Borough Boundaries](https://data.cityofnewyork.us/City-Government/Borough-Boundaries/gthc-hcne), and 2020 ZIP Code Tabulation Area polygons from [NYC Open Data ZIP Code Tabulation Areas](https://data.cityofnewyork.us/City-Government/ZIP-Code-Tabulation-Areas/35j5-n34v). The original fetched geometry is simplified only by filtering to 191 ZCTAs with representative points inside a NYC borough and land area above 30,000 m². This rule is for prototype coverage, not a definitive ZIP inventory.
- **Metropolitan context:** Nearby non-NYC land and major roads use [Natural Earth 1:10m](https://www.naturalearthdata.com/) public-domain geographic data. Chelsea's more detailed mini-map roads come from [NYC Open Data Street Centerline](https://data.cityofnewyork.us/City-Government/Centerline/inkn-q76z). Background regions are contextual only, with no simulated NYC feedback placed outside the eligible ZCTAs.
- **Feedback:** Only shared cloud submissions are displayed and counted. The map starts with zero responses until it reads the server. Archived synthetic fixtures are not loaded into the visible map.
- **Randomized dot positions:** Dots are generated inside real ZCTA polygons using deterministic pseudorandom placement. A dot is a statistical symbol and never represents an actual home or rat encounter.
- **Neighborhood search:** Uses all 306 label points in [NYC DCP Neighborhood Names](https://www.arcgis.com/home/item.html?id=a0eaeedf7e574d2cbf42919e142e7ced), retrieved 2026-11-03, plus common aliases and direct lookup of all 191 bundled ZIP/ZCTA areas. Neighborhood label points do not define official neighborhood boundaries. The build script finds the closest ZIP and up to three other nearby ZIPs in the same borough; these are candidates for the visitor to confirm, not an authoritative neighborhood-to-ZIP crosswalk. Same-name neighborhoods in different boroughs appear as separate results. This catalogue is broader than the original demo but is not a promise to recognize every local nickname or every USPS-only ZIP.
- **ZIP confirmation mini-map:** Uses real ZCTA polygon boundaries. The visitor clicks an approximate familiar area; the application uses the clicked polygon's ZIP ID and does **not** retain the clicked coordinates or request GPS permission. Chelsea has an additional local street-centerline overlay. Street detail for other neighborhoods is limited to the available major-road context in this prototype.

## Map behavior

### Search, selection and filters (2026-11-03)

- Search is local and works offline. It ignores case, common punctuation and spaces, and supports a curated set of English abbreviations and Chinese aliases. It is not an address search or an online geocoder.
- Choose a search result, then confirm the ZIP in the mini-map or with a ZIP button. The main map flies to that exact polygon, adds a dark blue border with a white halo above the dots, and displays a ZIP badge. Selecting another area replaces the highlight; View All NYC clears it.
- The **Show dots** selector is in the top map toolbar, directly beside **NYC Overview**, so it is visible without scrolling to the bottom of the map. Its options use colored circle icons instead of color-name text: all three circles for All, or a single circle next to the disruption category. The default shows all responses. On narrow screens the toolbar wraps near the top. Locations stay stable when switching filters.
- The selector next to **Residents' Comments** defaults to **All comments** for a newly opened ZIP, and filters comments by disruption rating. Pagination operates on matching comments and shows an empty-state message when needed.
- The two selectors are independent. Neither changes the ZIP's overall feedback counts, percentage bar or summary metrics.
- Street and ZIP badges in the mini-map avoid label collisions. Detailed local streets remain limited to Manhattan's Chelsea in the bundled source data.

### Confirmation map update (2026-11-03)

The mini-map now fits the candidate ZIP boundaries to its visible panel using
a screen-pixel SVG viewBox. Road strokes, ZIP badges and street labels stay
readable instead of enlarging with geographic coordinates. Surrounding land
and nearby ZCTA outlines provide context. Street labels are deduplicated and
collision-filtered, with a maximum of five. A ResizeObserver redraws the map
after panel/viewport size changes. Candidate polygons support click, Enter
and Space; the ZIP buttons below the map remain available.

Include `mini-map.css`, `map-controls.css`, `data/neighborhood-search.js` and
the updated `index.html`, `app.js` and `svg-map.js` when integrating this version.
Keep cloud.js, cloud-config.js, cloud.css and vendor/ when integrating the page.
Detailed local street data remains available for Chelsea only; other areas
use the existing major-road context.

- Click a borough or its label for a centered zoom.
- At closer zoom, click a ZCTA polygon for ZIP statistics and comments in a right-side panel.
- Pan/zoom freely; use **View All NYC** to reset.
- Dot unit changes with zoom: `1 dot = 20 / 5 / 1 responses`.
- Search a neighborhood, choose a ZIP on the independent left mini-map, select a rating, and submit. The server saves the submission and other visitors receive the update. A failed request preserves the form without adding a local-only response.

## Source structure

- `index.html`, `styles.css`: isolated page shell and shared-header visual reference.
- `app.js`: local search, form, ZIP detail panel, and independent filter state.
- `mini-map.css`, `map-controls.css`: confirmation map and new control styles.
- `svg-map.js`: actual geographic SVG map, polygon interaction, dot-density rendering, zoom and pan.
- `data/boroughs.geojson`, `data/zctas.geojson`: reference geometry.
- `data/synthetic-responses.json`: count-level simulated data.
- `data/map-data.js`: self-contained browser bundle of geography + simulated counts.
- `data/neighborhood-names.geojson`: 306 source label points from NYC DCP.
- `data/neighborhood-search.js`: local search catalogue and derived ZIP candidates.
- `scripts/build-search.cjs`: rebuilds the search catalogue from bundled source data with `node scripts/build-search.cjs`.
- `data/metro-context.geojson`, `data/chelsea-streets.geojson`: local background land/major roads and Chelsea street reference.
- `scripts/build-data.js`: reproducible data preparation script; needs the two official downloads in `/tmp/nyc_boroughs.geojson` and `/tmp/nyc_zcta.geojson` if rerun.
- `scripts/build-context.js`: prepares Natural Earth context and Chelsea streets from temporary downloaded GeoJSON files.

## Integration notes

The top navigation is visual only in this module; in the final group website, replace it with the shared Header component. All page-specific CSS should eventually be namespaced to avoid global collisions. The map is independent from the group’s other maps and requires no Mapbox token.

The current prototype is designed for a 1440 × 1024 px desktop reference layout. Final mobile QA and accessibility testing are still needed.
