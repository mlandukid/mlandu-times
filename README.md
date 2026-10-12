# The Mlandu Times

Auto-updating newspaper. Every morning it pulls fresh headlines WITH images from GNews, rebuilds the front page, and redeploys to GitHub Pages.

## Setup (5 minutes)
1. Get a free key at https://gnews.io (100 requests/day, a build uses about 12).
2. Create a GitHub repo, push this folder.
3. Repo Settings > Secrets and variables > Actions > New secret: `GNEWS_API_KEY`.
4. Settings > Pages > Source: GitHub Actions.
5. Actions tab > "Daily edition" > Run workflow. After that it runs daily at 06:00 SAST.

Local test: `GNEWS_API_KEY=yourkey node build.mjs` then open `dist/index.html`.

## Notes
- Images are hotlinked from the publishers via the API, with credit and a link to the original article. The free GNews tier is for development; check their terms before going commercial.
- The top story is the first world headline GNews ranks. Edit `build.mjs` if you want to hand-pick a lead.
- Add more crosswords in `template.html` (the `WORDS` array holds a 5x5 word square).
