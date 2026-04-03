import { getSeasonalKeywords } from './seasons.js';

// Generate likely discount codes from the store's domain and current season/holidays
export function generateCodes(domain) {
  // Extract brand keywords from domain
  // e.g., "ternsetups.com" → ["tern", "setups", "ternsetups"]
  const hostname = domain
    .replace(/^www\./, '')
    .replace(/\.com$|\.co\.\w+$|\.net$|\.org$|\.shop$|\.store$|\.io$|\.de$|\.fr$|\.uk$/, '');

  const parts = hostname.split(/[-_.]/).filter(p => p.length >= 3);
  const joined = hostname.replace(/[-_.]/g, '');
  // Only use brand names that are reasonable length (4-12 chars)
  const brandNames = [...new Set([...parts, joined])].filter(b => b.length >= 4 && b.length <= 12);

  const percentSuffixes = ['5', '10', '15', '20', '25'];
  const codes = [];

  // Brand + percent suffix: TERN10, TERN15, TERN20
  for (const brand of brandNames) {
    codes.push(brand.toUpperCase()); // Just the brand name alone
    for (const suffix of percentSuffixes) {
      codes.push((brand + suffix).toUpperCase());
    }
  }

  // Seasonal keywords — only use actual holiday/season names, not year numbers
  const seasonal = getSeasonalKeywords();
  const seasonalWords = seasonal.filter(k => k.length >= 3 && !/^\d+$/.test(k)); // exclude pure numbers

  for (const keyword of seasonalWords) {
    codes.push(keyword.toUpperCase()); // EASTER, SPRING
    // Only add common percent suffixes (10, 15, 20) — skip obscure ones like 5, 25
    for (const suffix of ['10', '15', '20']) {
      codes.push((keyword + suffix).toUpperCase());
    }
  }

  // Brand + season combos — only short brand + short keyword
  for (const brand of brandNames) {
    if (brand.length > 8) continue; // skip long brand names for combos
    for (const keyword of seasonalWords) {
      if (keyword.length > 8) continue; // skip long keywords
      const combo = (brand + keyword).toUpperCase();
      if (combo.length <= 16) codes.push(combo); // TERNSPRING, TERNEASTER
    }
  }

  return [...new Set(codes)];
}
