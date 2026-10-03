# HackerNews Trend Sniffer & RSS Dispatcher

A serverless RSS and JSON feed generator that monitors Hacker News top stories and Show HN items using the official Algolia HN Search API. It filters stories matching custom keyword interests (e.g., "AI", "Open Source", "Serverless", "Rust"), calculates viral velocity scores, and publishes a curated daily digest RSS feed and static HTML index.

## Features
- **Zero-noise Curation:** Filters out generic news and surfaces precise matches for your tech interests.
- **Viral Velocity Scoring:** Ranks stories based on point accumulation speed relative to story age (`(points + comments * 1.5) / (age_in_hours + 2)^1.6`).
- **Fully Serverless:** Runs automatically via GitHub Actions on a cron schedule (every 6 hours) with zero server maintenance.
- **Open Standards:** Generates a standard RSS 2.0 XML feed (`feed.xml`) and a clean HTML digest (`index.html`).

## Configuration (`config.json`)
You can customize keywords, minimum point thresholds, and feed metadata in `config.json`:
```json
{
  "keywords": ["AI", "Open Source", "Serverless", "Rust", "Python", "LLM", "Startup"],
  "minScore": 10,
  "maxStories": 50,
  "feedTitle": "HackerNews Trend Sniffer",
  "feedDescription": "Curated, zero-noise tech news feed filtered by keyword and velocity score from Hacker News.",
  "siteUrl": "https://tinyshipyard.github.io/hn-trend-sniffer"
}
```

## Local Testing
To test the generator locally:
```bash
npm install
npm test
```
This will fetch live stories from the Algolia API, filter/score them, and write outputs to `public/feed.xml` and `public/index.html`.

## Subscribe
- RSS feed: https://tinyshipyard.github.io/hn-trend-sniffer/feed.xml
- Web page: https://tinyshipyard.github.io/hn-trend-sniffer/

## Run Your Own
Fork this repository, set **Settings > Pages > Source** to **GitHub Actions**, and edit `config.json` (set `siteUrl` to your own Pages address). The workflow regenerates and deploys the feed every 6 hours.
