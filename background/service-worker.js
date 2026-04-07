import { searchReddit, searchCouponSites } from '../lib/lookup.js';
import { generateCodes } from '../lib/generator.js';
import { COMMON_CODES } from '../lib/codes.js';

// Minimum delay between code attempts (ms)
const CODE_ATTEMPT_DELAY = 250;
const BATCH_SIZE = 60;

// Search generation counter — increments on each new search
let currentSearchId = 0;

// Full code list for current domain (persists across batches)
let allCodesForDomain = [];
let codesTestedSoFar = 0;

// Persistent search state — survives popup close/reopen
let searchState = {
  searchId: 0,
  active: false,
  cancelled: false,
  tabId: null,
  domain: null,
  phase: null,
  current: 0,
  total: 0,
  code: null,
  bestResult: null,
  results: { tried: 0, valid: 0, invalid: 0, errors: 0 },
  sources: null,
  message: null,
  hasMoreCodes: false,   // true if there are remaining codes after this batch
  totalAvailable: 0,     // total codes found (before batching)
};

function updateState(searchId, updates) {
  if (searchId !== currentSearchId) return;
  Object.assign(searchState, updates);
  chrome.runtime.sendMessage({ action: 'progress', ...searchState }).catch(() => {});
}

// Gather all codes for a domain (only runs once per domain, reused for continue)
async function gatherCodes(domain) {
  const storeName = domain.replace(/^www\./, '').replace(/\.\w+$/, '');

  const [redditCodes, couponCodes, generated] = await Promise.all([
    searchReddit(storeName).catch(err => {
      console.warn('[SaveWithTimson] Reddit lookup failed:', err);
      return [];
    }),
    searchCouponSites(domain).catch(err => {
      console.warn('[SaveWithTimson] Coupon site lookup failed:', err);
      return [];
    }),
    Promise.resolve(generateCodes(domain)),
  ]);

  const allCodes = [];
  const seen = new Set();

  const addCodes = (codes, limit) => {
    let added = 0;
    for (const item of codes) {
      if (limit && added >= limit) return;
      const code = typeof item === 'string' ? item : item.code;
      if (!seen.has(code)) {
        seen.add(code);
        allCodes.push(code);
        added++;
      }
    }
  };

  // Priority order: scraped codes first, then smart-generated, then generic common
  addCodes(redditCodes, 15);
  addCodes(couponCodes, 15);
  addCodes(generated);
  addCodes(COMMON_CODES);

  // Move previously successful code for this domain to the front
  const stored = await chrome.storage.local.get('successfulCodes');
  const previousCodes = stored?.successfulCodes || {};
  if (previousCodes[domain]) {
    const prevCode = previousCodes[domain].code;
    const idx = allCodes.indexOf(prevCode);
    if (idx > 0) allCodes.splice(idx, 1);
    if (idx !== 0) allCodes.unshift(prevCode);
  }

  const sources = {
    reddit: redditCodes.length,
    couponSites: couponCodes.length,
    generated: generated.length,
    common: COMMON_CODES.length,
  };

  return { allCodes, sources };
}

async function findAndTryCodes(tabId, domain, isContinue = false) {
  currentSearchId++;
  const mySearchId = currentSearchId;
  startKeepAlive();

  // If not continuing, reset everything and gather fresh codes
  if (!isContinue) {
    codesTestedSoFar = 0;

    searchState = {
      searchId: mySearchId,
      active: true,
      cancelled: false,
      tabId,
      domain,
      phase: 'searching',
      current: 0,
      total: 0,
      code: null,
      bestResult: null,
      results: { tried: 0, valid: 0, invalid: 0, errors: 0 },
      sources: null,
      message: 'Searching for codes online...',
      hasMoreCodes: false,
      totalAvailable: 0,
    };
    updateState(mySearchId, {});

    const gathered = await gatherCodes(domain);
    if (mySearchId !== currentSearchId) return { done: true, cancelled: true };

    allCodesForDomain = gathered.allCodes;

    updateState(mySearchId, {
      phase: 'searching_done',
      message: `Found ${allCodesForDomain.length} codes to try`,
      sources: gathered.sources,
      totalAvailable: allCodesForDomain.length,
    });
  } else {
    // Continuing — keep bestResult and results from previous batch
    searchState.searchId = mySearchId;
    searchState.active = true;
    searchState.cancelled = false;
    searchState.phase = 'trying';
    updateState(mySearchId, {});
  }

  // Determine this batch's slice
  const batchStart = codesTestedSoFar;
  const batchEnd = Math.min(batchStart + BATCH_SIZE, allCodesForDomain.length);
  const batchCodes = allCodesForDomain.slice(batchStart, batchEnd);
  const batchTotal = batchCodes.length;

  let bestResult = searchState.bestResult;
  const results = searchState.results ? { ...searchState.results } : { tried: 0, valid: 0, invalid: 0, errors: 0 };

  updateState(mySearchId, {
    total: batchTotal,
    current: 0,
  });

  // Remove any pre-existing discount before starting (so we don't misattribute it)
  if (!isContinue) {
    try {
      const state = await chrome.tabs.sendMessage(tabId, { action: 'getState' });
      if (state.isApplied && state.appliedCode) {
        await chrome.tabs.sendMessage(tabId, { action: 'removeCode', code: state.appliedCode });
      }
    } catch {}
  }

  // Try codes sequentially
  for (let i = 0; i < batchTotal; i++) {
    if (mySearchId !== currentSearchId || searchState.cancelled) {
      updateState(mySearchId, { phase: 'cancelled', active: false });
      return { done: true, cancelled: true, best: bestResult, totalTried: results.tried };
    }

    const code = batchCodes[i];
    results.tried++;
    codesTestedSoFar++;

    updateState(mySearchId, {
      phase: 'trying',
      current: i + 1,
      code,
      bestResult,
      results: { ...results },
    });

    try {
      if (bestResult) {
        await chrome.tabs.sendMessage(tabId, { action: 'removeCode', code: bestResult.code });
      }

      if (mySearchId !== currentSearchId) return { done: true, cancelled: true };

      const result = await chrome.tabs.sendMessage(tabId, {
        action: 'applyCode',
        code,
      });

      if (result.success) {
        results.valid++;
        if (!bestResult || result.discount > bestResult.discount) {
          bestResult = {
            code,
            discount: result.discount,
            total: result.total,
            totalBefore: result.totalBefore,
          };
        } else {
          await chrome.tabs.sendMessage(tabId, { action: 'removeCode', code });
        }
      } else {
        results.invalid++;
      }
    } catch (err) {
      results.errors++;
      console.warn(`[SaveWithTimson] Error trying code ${code}:`, err);
    }

    await new Promise(r => setTimeout(r, CODE_ATTEMPT_DELAY));
  }

  if (mySearchId !== currentSearchId) return { done: true, cancelled: true };

  // Ensure best code is applied
  if (bestResult) {
    try {
      const state = await chrome.tabs.sendMessage(tabId, { action: 'getState' });
      if (!state.isApplied || state.appliedCode !== bestResult.code) {
        await chrome.tabs.sendMessage(tabId, { action: 'applyCode', code: bestResult.code });
      }
    } catch {}

    const existing = await chrome.storage.local.get('successfulCodes');
    const codes = existing?.successfulCodes || {};
    codes[domain] = {
      code: bestResult.code,
      discount: bestResult.discount,
      date: Date.now(),
    };
    await chrome.storage.local.set({ successfulCodes: codes });
  }

  const hasMoreCodes = codesTestedSoFar < allCodesForDomain.length;
  const remainingCount = allCodesForDomain.length - codesTestedSoFar;

  searchState.bestResult = bestResult;
  searchState.results = { ...results };

  const finalResult = {
    done: true,
    cancelled: false,
    best: bestResult,
    totalTried: results.tried,
    results: { ...results },
    hasMoreCodes,
    remainingCount,
  };

  stopKeepAlive();

  updateState(mySearchId, {
    phase: 'done',
    active: false,
    bestResult,
    results: { ...results },
    hasMoreCodes,
    remainingCount,
  });

  return finalResult;
}

// --- Keep-alive ---
// Chrome kills MV3 service workers after ~30s of "inactivity".
// Use chrome.alarms to periodically wake the service worker during an active search.
const KEEPALIVE_ALARM = 'savwithtimson-keepalive';

function startKeepAlive() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 }); // every ~24 seconds
}

function stopKeepAlive() {
  chrome.alarms.clear(KEEPALIVE_ALARM);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // Just waking up is enough — if search is no longer active, stop the alarm
    if (!searchState.active) {
      stopKeepAlive();
    }
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  if (msg.action === 'startSearch') {
    findAndTryCodes(msg.tabId, msg.domain, false).then(sendResponse);
    return true;
  }

  if (msg.action === 'continueSearch') {
    findAndTryCodes(msg.tabId, msg.domain, true).then(sendResponse);
    return true;
  }

  if (msg.action === 'cancelSearch') {
    searchState.cancelled = true;
    sendResponse({ cancelled: true });
    return true;
  }

  if (msg.action === 'getSearchState') {
    sendResponse({ ...searchState, bestResult: searchState.bestResult, results: { ...searchState.results } });
    return true;
  }

  if (msg.action === 'getStoredCodes') {
    chrome.storage.local.get('successfulCodes').then(result => {
      sendResponse(result?.successfulCodes || {});
    });
    return true;
  }
});
