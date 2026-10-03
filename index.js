#!/usr/bin/env node

/**
 * HackerNews Trend Sniffer & RSS Dispatcher
 * Fetches top/new stories from Algolia HN Search API, filters by keywords,
 * calculates viral velocity scores, and generates RSS XML and HTML static index.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading config.json, using defaults:', e.message);
  }
  return {
    keywords: ["AI", "Open Source", "Serverless", "Rust", "Python", "LLM", "Startup"],
    minScore: 5,
    maxStories: 40,
    feedTitle: "HackerNews Trend Sniffer",
    feedDescription: "Curated top Hacker News stories filtered by keyword and viral velocity.",
    siteUrl: "https://github.io/hn-trend-sniffer"
  };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'HNTrendSniffer/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP status ${res.statusCode} for ${url}`));
          }
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function fetchHnStories() {
  // Fetch recent front page / popular hits from Algolia HN Search API
  // We query both top stories and recent popular items
  const nowSec = Math.floor(Date.now() / 1000);
  const oneWeekAgo = nowSec - (7 * 24 * 3600);
  
  const searchUrl = `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i>${oneWeekAgo}&hitsPerPage=100`;
  console.log(`Fetching from Algolia HN API...`);
  const result = await fetchJson(searchUrl);
  return result.hits || [];
}

function calculateVelocity(hit) {
  // hit has points (or points / points), created_at_i, num_comments
  const points = hit.points || hit.vote_count || 1;
  const comments = hit.num_comments || 0;
  const createdAt = hit.created_at_i || Math.floor(Date.now() / 1000);
  const ageHours = Math.max(0.5, (Date.now() / 1000 - createdAt) / 3600);
  
  // Velocity formula: (points + comments * 1.5) / (age_in_hours + 2)^1.6
  const score = (points + (comments * 1.5)) / Math.pow(ageHours + 2, 1.6);
  return {
    ...hit,
    calculatedScore: parseFloat(score.toFixed(2)),
    ageHours: parseFloat(ageHours.toFixed(1))
  };
}

function matchesKeywords(title, keywords) {
  if (!title) return false;
  if (!keywords || keywords.length === 0) return true; // match all if no keywords
  const lowerTitle = title.toLowerCase();
  return keywords.some(kw => {
    const k = kw.toLowerCase();
    // Match whole words or standard substring depending on query
    if (k.length <= 3) {
      // For short words like AI, API, Rust, check word boundary or exact token
      const regex = new RegExp(`\\b${k}\\b`, 'i');
      return regex.test(title);
    }
    return lowerTitle.includes(k);
  });
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateRss(stories, config) {
  const buildDate = new Date().toUTCString();
  let itemsXml = '';

  for (const s of stories) {
    const title = escapeXml(s.title);
    const url = s.url || `https://news.ycombinator.com/item?id=${s.objectID}`;
    const commentsUrl = `https://news.ycombinator.com/item?id=${s.objectID}`;
    const pubDate = s.created_at ? new Date(s.created_at).toUTCString() : buildDate;
    const points = s.points || 0;
    const comments = s.num_comments || 0;
    const velocity = s.calculatedScore || 0;
    
    const description = escapeXml(`[Score: ${points} | Comments: ${comments} | Velocity: ${velocity}] - Discuss: ${commentsUrl}`);

    itemsXml += `
    <item>
      <title>${title}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="false">${s.objectID}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
    </item>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(config.feedTitle)}</title>
    <link>${escapeXml(config.siteUrl)}</link>
    <description>${escapeXml(config.feedDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${escapeXml(config.siteUrl)}/feed.xml" rel="self" type="application/rss+xml" />
    ${itemsXml}
  </channel>
</rss>`;
}

function generateHtml(stories, config) {
  const buildDate = new Date().toUTCString();
  let rowsHtml = '';

  for (const s of stories) {
    const title = escapeXml(s.title);
    const url = s.url || `https://news.ycombinator.com/item?id=${s.objectID}`;
    const commentsUrl = `https://news.ycombinator.com/item?id=${s.objectID}`;
    const points = s.points || 0;
    const comments = s.num_comments || 0;
    const velocity = s.calculatedScore || 0;
    const age = s.ageHours || 0;

    rowsHtml += `
      <tr>
        <td><strong><a href="${escapeXml(url)}" target="_blank">${title}</a></strong><br/><small style="color: #666;">${escapeXml(url)}</small></td>
        <td align="center"><span class="badge points">${points} pts</span></td>
        <td align="center"><a href="${commentsUrl}" target="_blank">${comments} comms</a></td>
        <td align="center"><span class="badge velocity">${velocity}</span></td>
        <td align="center"><small>${age}h ago</small></td>
      </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeXml(config.feedTitle)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 960px; margin: 0 auto; padding: 20px; background: #fdfdfd; }
    h1 { color: #ff6600; border-bottom: 2px solid #ff6600; padding-bottom: 10px; }
    .meta { background: #f1f1f1; padding: 10px 15px; border-radius: 6px; margin-bottom: 20px; font-size: 0.9rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
    table { width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 6px; overflow: hidden; }
    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; color: #444; }
    tr:hover { background: #fffaf5; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; }
    .badge.points { background: #ffe8d6; color: #d9480f; }
    .badge.velocity { background: #e3fafc; color: #0b7285; }
    footer { margin-top: 40px; text-align: center; font-size: 0.85rem; color: #777; border-top: 1px solid #eee; padding-top: 15px; }
  </style>
</head>
<body>
  <h1>🔥 ${escapeXml(config.feedTitle)}</h1>
  <div class="meta">
    <div><strong>Keywords:</strong> ${escapeXml((config.keywords || []).join(', '))}</div>
    <div><strong>RSS Feed:</strong> <a href="./feed.xml">feed.xml</a></div>
    <div><strong>Last Updated:</strong> ${buildDate}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Story</th>
        <th>Points</th>
        <th>Comments</th>
        <th>Velocity</th>
        <th>Age</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <footer>
    Powered by HackerNews Algolia API &bull; Generated by HackerNews Trend Sniffer
  </footer>
</body>
</html>`;
}

async function main() {
  const config = loadConfig();
  console.log(`Starting HackerNews Trend Sniffer...`);
  console.log(`Keywords: ${config.keywords.join(', ')}`);

  let hits;
  try {
    hits = await fetchHnStories();
  } catch (err) {
    console.error('Failed to fetch from HN API:', err.message);
    process.exit(1);
  }

  console.log(`Fetched ${hits.length} total raw stories from Algolia.`);

  // Filter and score
  const processed = hits
    .filter(h => h.title && h.objectID)
    .map(calculateVelocity)
    .filter(h => {
      // Minimum score threshold and keyword match
      if ((h.points || 0) < config.minScore) return false;
      return matchesKeywords(h.title, config.keywords);
    });

  // Sort by calculated velocity descending
  processed.sort((a, b) => b.calculatedScore - a.calculatedScore);

  const topStories = processed.slice(0, config.maxStories);
  console.log(`Filtered down to ${topStories.length} matching trending stories.`);

  // Ensure public dir exists
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  // Generate RSS and HTML
  const rssXml = generateRss(topStories, config);
  const htmlDoc = generateHtml(topStories, config);

  fs.writeFileSync(path.join(PUBLIC_DIR, 'feed.xml'), rssXml, 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), htmlDoc, 'utf8');

  console.log(`Successfully generated public/feed.xml and public/index.html`);
}

main().catch(err => {
  console.error('Unhandled error in Trend Sniffer:', err);
  process.exit(1);
});
