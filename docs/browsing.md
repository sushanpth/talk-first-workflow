# Browsing

The agent picks the lightest tool that can read the page:

- **WebFetch and WebSearch** for plain reading.
- **A bundled Playwright browser** (headless Chromium) for pages that need JavaScript, clicking, screenshots or checking your own app. It keeps its profile in memory and shuts down after 10 idle minutes. See [Install](install.md#browser-download) for the one-time download.
- **Claude in Chrome** for sites where you are signed in, or when you want to watch.

The agent checks RAM and CPU before opening a browser and closes what it opens.
