# Shortly

Shortly is a lightweight, responsive URL shortener made with plain HTML, CSS, and vanilla JavaScript. It stores links and click activity in the current browser, so no account or server is needed.

## Features

- Create short links with generated codes or custom aliases.
- Validate HTTP and HTTPS destinations and alias characters.
- Copy and open short links, search and filter your link list, and delete links with confirmation.
- View totals and per-link click analytics with 7, 30, and 90 day chart ranges.
- Use light or dark theme, remembered in browser storage.
- Resolve `/#/code` links, record a click, and redirect to the saved destination. Unknown codes show a custom not found page.
- Responsive desktop and mobile layouts.

## Files

- `index.html` — semantic page structure and accessible controls.
- `style.css` — visual system, landing page, dashboard, and responsive rules.
- `analytics.css` — per-link analytics screen styles.
- `script.js` — validation, local storage, link management, analytics, and hash routing.

## Run locally

Open `index.html` in a browser, or serve the folder with any basic static server. For example, with Python installed:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`. Font files load from Google Fonts when an internet connection is available; the page has system sans-serif fallbacks.

## Storage and redirects

Links are saved under `shortly.links.v1` in `localStorage`; the theme is saved under `shortly.theme`. Each record includes its destination, code/alias, creation date, active state, total clicks, and click timestamps. Click counts and analytics represent this browser’s stored data only. Clearing browser storage removes it, and data is not shared with other visitors or devices.

Short links use a hash route, such as `https://your-domain.example/#/summer_sale`. The page reads the code after `#/`, looks it up in local storage, records the visit, and redirects to the destination. Hash routes work on static hosts without server rewrite rules. A link can resolve only in a browser profile where that link record exists.

## Static deployment

Publish this folder as a static site on GitHub Pages, Netlify, or Vercel. Set the publish directory to the project folder and leave the build command empty. Since the short code is in the URL hash, the host does not need route rewrites. Use HTTPS in production for secure clipboard access.
