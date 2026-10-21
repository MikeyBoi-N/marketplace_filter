# Marketplace Filter

Better filters for Facebook Marketplace: keyword exclusions, real price limits, listing age, draw-on-map search areas, and hiding sellers with brand-new accounts.

## Install (Chrome, Edge, Brave)

1. Download `marketplace-filter-<version>-chrome.zip` from the [Releases](https://github.com/MikeyBoi-N/marketplace_filter/releases) page.
2. Unzip it into a folder you'll keep (the extension runs from that folder).
3. Open `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder.
5. Open Facebook Marketplace. The filter panel replaces the left sidebar.

To update, replace the folder's contents with a newer release and click the reload icon on the extension's card.

## Install (Firefox 128 or newer)

1. Download `marketplace-filter-<version>-firefox.xpi` from the [Releases](https://github.com/MikeyBoi-N/marketplace_filter/releases) page.
2. Drag the file into a Firefox window (or open `about:addons`, click the gear icon, and choose **Install Add-on From File...**).
3. Click **Add** when Firefox asks.
4. Open Facebook Marketplace.

To update, install the newer `.xpi` the same way. It replaces the old version and keeps your settings.

Firefox 128 needs macOS 10.15 (Catalina) or newer. Older Macs stuck on Firefox ESR 115 can't run the extension.

Note: the seller-age and listing-age filters open listing pages in the background with your Facebook login (spaced a couple of seconds apart and cached).

=================
Design notes

Facebook marketplace is riddled with scams, poor filter adherence, and no location searches. The filters, search, and location for facebook marketplace are not strong. Accounts that were made last year are posting listings for 30+ locations, duplicate posts, and low quality images. They then ask for your personal info before even securing a deal. It's a red flag, so I want to work on a browser extension that can filter properly by price, location, account creation date (block all listings from accounts younger than 2 years), and not just use a generic "12 miles away" but I want a "draw on the map" bounding box search tool so I can avoid searching near borders, islands, and other areas.

We need to work on replacing the left fitler sidepanel with our own custom filter option. This one should be much better than what Facebook already has. This filter should contain:

keywords -include, exclude
price, min, max

condition: new, used, like new....

posted within...

on marketplace for N number of days.

location:
draw on map
OR
radius distance

include seller joined before...

obviously this is rusty and just a draft, so text, wording, the wayu the filters work, and the  expectations may shift. 


======================
Why Marketplace is so bad

It’s built for browsing, not finding. Meta makes money from time spent and ad impressions, so the default experience is an endless “suggested” feed. Precise search would mean you find your item in 30 seconds and leave, which is the opposite of what the product is optimized for. That’s why “sort by newest” feels unreliable and unrelated items keep creeping in.

The data underneath is mostly unstructured. A filter can only work on fields that exist. Most listings are a title, a price, a few photos, and free text. Brand, size, condition, and dimensions are optional or absent, so filtering by them catches only the small share of sellers who bothered to fill them in.

Sellers game the system. Keyword stuffing (“not iPhone Samsung Pixel”), placeholder prices ($1, $0, $123456), reposting the same item daily to stay at the top, dealers posing as private sellers, and “ISO/wanted” posts all pollute results, and there’s little defense against any of it.

Location is fuzzy. The radius often isn’t a hard boundary, and shipped items get mixed in with local pickup.

The interface forgets you. Filters reset, the back button loses your scroll position, there’s no way to mark listings as seen, and alerts are weak or nonexistent.


=================
What a better tool should fix

1. Make the data structured. This is the biggest lever. Use models to extract attributes from the title, description, and photos (brand, model, size, color, condition, dimensions) so filters work even when the seller filled in nothing. Make the attributes category-specific: mileage and title status for cars, dimensions and material for furniture, storage and carrier lock for phones.

2. Add real search syntax. Support exact phrases, exclusions (-parts -broken -"for repair"), and OR. Exclusion alone would solve a huge share of frustrations.

3. Make prices trustworthy. Automatically hide or flag placeholder prices. Show price drops and a listing’s age. Add a “what this usually sells for” range based on comparable listings, which also helps people spot scams.

4. Make location honest. Use a hard radius, or better, drive time instead of miles. Keep “local pickup” and “ships to you” clearly separated.

5. Add seller-level controls. Let users filter for private sellers versus dealers, and by account age and rating. Let them hide a seller permanently. Detect reposts and duplicates with image hashing and collapse them into one result.

6. Remember the user’s state. Filters should stick, the back button should restore your position, you should be able to mark listings as seen or hidden, and there should be a “new since your last visit” view.

7. Make sorting honest. “Newest” should be strictly chronological, and any sponsored content should be clearly separated or absent.

8. Make saved searches actually useful. Instant alerts for new matches matter because good deals sell within hours.

9. Remove the noise. Hide ISO/wanted posts, sold or pending items, and listings with likely scam signals (brand-new accounts, prices far below market, “shipping only” for bulky local items).

=================
Development

Stack: WXT (Chrome MV3, Firefox later), React, MUI (dark theme, Facebook blue), MapLibre GL with OpenFreeMap tiles (free, open source, no API key) for the map.

    npm install
    npm run dev        # opens a Chrome profile with the extension loaded and hot reload
    npm run build      # production build in .output/chrome-mv3 (load unpacked via chrome://extensions)
    npm test           # unit tests for parsing, keyword syntax, filter engine, geo and URL building
    npm run compile    # typecheck

Releasing for Firefox: bump `version` in package.json (Mozilla won't sign the same version twice), set `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` to the AMO JWT issuer and secret, then run `npm run sign:firefox`. The signed .xpi lands in .output/signed; rename it to `marketplace-filter-<version>-firefox.xpi` and attach it to the GitHub release.

How it works
- src/entrypoints/interceptor.content.ts runs in the page's JS world and forwards Facebook's GraphQL responses (read only).
- src/lib/extract.ts finds listing objects in those payloads by shape (id + marketplace_listing_title), not by query name.
- src/lib/engine.ts judges each listing: show, hide (with reasons), or pending (needs the item page, the seller's profile, or a geocode).
- src/content/controller.ts applies verdicts to the grid cells, and runs lookups through a single queue spaced 1.5 to 2.5 s apart. Results are cached in extension storage: sellers forever, item pages for 3 days, places forever.
- src/content/Panel.tsx is the sidebar that replaces Facebook's. The map editor (src/entrypoints/map) opens in its own window because Facebook's CSP blocks map tiles inside the page. OpenStreetMap's own tile servers block extension pages (no Referer), so it uses OpenFreeMap.
- Panel > Diagnostics shows how many listings had each field parsed, and "Download capture" saves raw payloads for fixing the parsers when Facebook changes something.
