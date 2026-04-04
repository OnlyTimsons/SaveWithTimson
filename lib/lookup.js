// Layer 1: Online code lookup — Reddit + coupon aggregator sites
// No API keys needed — all public endpoints

// Regex to match discount-code-like strings (all caps, alphanumeric, 4-20 chars)
const CODE_REGEX = /\b[A-Z][A-Z0-9]{2,19}\b/g;

// Common words that match CODE_REGEX but are NOT discount codes
const FALSE_POSITIVES = new Set([
  'EDIT', 'UPDATE', 'PSA', 'FYI', 'IMO', 'IMHO', 'TIL', 'LPT',
  'TLDR', 'AMA', 'URL', 'HTTP', 'HTTPS', 'HTML', 'CSS', 'API', 'JSON',
  'AND', 'THE', 'FOR', 'NOT', 'BUT', 'ALL', 'WITH', 'THIS', 'THAT',
  'FROM', 'HAVE', 'BEEN', 'JUST', 'LIKE', 'WILL', 'THEY', 'WHAT',
  'WHEN', 'YOUR', 'DOES', 'ONLY', 'SOME', 'VERY', 'ALSO', 'EACH',
  'THAN', 'THEN', 'INTO', 'THEM', 'THESE', 'THOSE', 'MUCH', 'MORE',
  'HERE', 'THERE', 'WHERE', 'WHICH', 'THEIR', 'WOULD', 'COULD',
  'SHOULD', 'ABOUT', 'AFTER', 'BEFORE', 'OTHER', 'EVERY', 'STILL',
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF',
  'USA', 'UK', 'EU', 'IOS', 'USB', 'LED', 'LCD', 'RAM', 'SSD', 'HDD',
  'REDDIT', 'POST', 'COMMENT', 'SUBREDDIT', 'DELETED', 'REMOVED',
  'SHOP', 'STORE', 'PRICE', 'ORDER', 'TOTAL', 'CART', 'ITEM',
  'CODE', 'PROMO', 'COUPON', 'DEAL', 'SALE', 'OFFER', 'FREE',
  'LINK', 'SITE', 'PAGE', 'HELP', 'INFO', 'NOTE', 'WORK', 'WORKED',
  'TRIED', 'USING', 'CHECK', 'FOUND', 'ANYONE', 'KNOW', 'THINK',
]);

function extractCodes(text) {
  const matches = text.toUpperCase().match(CODE_REGEX) || [];
  return [...new Set(matches)].filter(m =>
    m.length >= 4 &&
    m.length <= 20 &&
    !FALSE_POSITIVES.has(m) &&
    // Require at least one digit OR length >= 6 (pure-letter codes tend to be words)
    (/\d/.test(m) || m.length >= 6)
  );
}

function deduplicateCodes(codeObjects) {
  const seen = new Set();
  return codeObjects.filter(c => {
    if (seen.has(c.code)) return false;
    seen.add(c.code);
    return true;
  });
}

// --- Reddit Scraper ---
// Uses old.reddit.com/search.json — no auth needed
export async function searchReddit(storeName) {
  const queries = [
    `"${storeName}" discount code OR promo code OR coupon`,
    `${storeName} coupon OR voucher OR promo`,
  ];
  const allCodes = [];

  for (const q of queries) {
    try {
      const url = `https://old.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&t=year&limit=15`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'SaveWithTimson/1.0 (Chrome Extension)' }
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const posts = data?.data?.children || [];

      for (const post of posts) {
        const title = post.data?.title || '';
        const selftext = post.data?.selftext || '';
        const combined = title + ' ' + selftext;
        const codes = extractCodes(combined);
        allCodes.push(...codes.map(code => ({
          code,
          source: 'reddit',
          context: title.slice(0, 100),
        })));
      }
    } catch (e) {
      console.warn('[SaveWithTimson] Reddit search failed:', e.message);
    }
  }

  return deduplicateCodes(allCodes);
}

// --- Coupon Site Scraper ---
// Scrape coupon aggregator HTML pages and extract code-like strings
export async function searchCouponSites(domain) {
  const storeName = domain.replace(/^www\./, '').replace(/\.\w+$/, '');
  const urls = [
    `https://www.retailmenot.com/view/${domain}`,
    `https://www.coupons.com/coupon-codes/${storeName}`,
  ];
  const allCodes = [];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!resp.ok) continue;
      const html = await resp.text();

      // Also look for codes in structured data patterns like "code":"XXXXX"
      const jsonCodeMatches = html.match(/"code"\s*:\s*"([A-Z0-9]{4,20})"/gi) || [];
      for (const match of jsonCodeMatches) {
        const code = match.match(/"([A-Z0-9]{4,20})"/i)?.[1]?.toUpperCase();
        if (code && !FALSE_POSITIVES.has(code)) {
          allCodes.push({ code, source: url, context: 'coupon site (structured)' });
        }
      }

      // General extraction from page text
      const codes = extractCodes(html);
      allCodes.push(...codes.map(code => ({
        code,
        source: url,
        context: 'coupon site',
      })));
    } catch (e) {
      console.warn('[SaveWithTimson] Coupon site fetch failed:', e.message);
    }
  }

  return deduplicateCodes(allCodes);
}
