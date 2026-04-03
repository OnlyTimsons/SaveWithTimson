const $ = (sel) => document.querySelector(sel);

let currentTabId = null;
let currentDomain = null;
let isSearching = false;

// --- Init ---

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showNotShopify();
    return;
  }

  currentTabId = tab.id;

  // First, check if there's an active search we should reconnect to
  try {
    const state = await chrome.runtime.sendMessage({ action: 'getSearchState' });
    if (state?.active && state.tabId === tab.id) {
      currentDomain = state.domain;
      showReady({ domain: state.domain, isShopify: true });
      reconnectToSearch(state);
      return;
    }
    // If search just finished, show the result
    if (state?.phase === 'done' && state.tabId === tab.id) {
      currentDomain = state.domain;
      showReady({ domain: state.domain, isShopify: true });
      showResult({
        done: true,
        best: state.bestResult,
        totalTried: state.results?.tried || 0,
        results: state.results,
        hasMoreCodes: state.hasMoreCodes,
        remainingCount: state.remainingCount,
      });
      return;
    }
  } catch {}

  // No active search — detect Shopify checkout
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectShopify' });

    if (response?.isShopify) {
      currentDomain = response.domain;
      showReady(response);
    } else {
      showNotShopify();
    }
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/shopify.js'],
      });
      await new Promise(r => setTimeout(r, 500));
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectShopify' });
      if (response?.isShopify) {
        currentDomain = response.domain;
        showReady(response);
      } else {
        showNotShopify();
      }
    } catch {
      showNotShopify();
    }
  }
}

function reconnectToSearch(state) {
  isSearching = true;
  $('#start-btn').classList.add('hidden');
  $('#continue-btn').classList.add('hidden');
  $('#cancel-btn').classList.remove('hidden');
  $('#progress-section').classList.remove('hidden');
  $('#result-section').classList.add('hidden');
  $('#existing-discount').classList.add('hidden');

  applyProgressUpdate(state);
}

function showReady(info) {
  const dot = $('.store-info .dot');
  dot.classList.remove('detecting');
  dot.classList.add('ready');
  $('#store-name').textContent = info.domain;
  $('#start-btn').disabled = false;

  if (info.hasExistingDiscount && info.appliedCode) {
    $('#existing-discount').classList.remove('hidden');
    $('#existing-code').textContent = info.appliedCode;
  }
}

function showNotShopify() {
  const dot = $('.store-info .dot');
  dot.classList.remove('detecting');
  dot.classList.add('error');
  $('#store-name').textContent = 'Not a Shopify checkout';
  $('#not-shopify').classList.remove('hidden');
}

// --- Search ---

async function startSearch() {
  if (isSearching || !currentTabId || !currentDomain) return;
  isSearching = true;

  $('#start-btn').classList.add('hidden');
  $('#continue-btn').classList.add('hidden');
  $('#cancel-btn').classList.remove('hidden');
  $('#progress-section').classList.remove('hidden');
  $('#result-section').classList.add('hidden');
  $('#existing-discount').classList.add('hidden');
  $('#progress-best').classList.add('hidden');

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'startSearch',
      tabId: currentTabId,
      domain: currentDomain,
    });

    showResult(result);
  } catch (err) {
    showResult({ done: true, best: null, totalTried: 0, error: err.message });
  }

  searchFinished();
}

async function continueSearch() {
  if (isSearching || !currentTabId || !currentDomain) return;
  isSearching = true;

  $('#start-btn').classList.add('hidden');
  $('#continue-btn').classList.add('hidden');
  $('#cancel-btn').classList.remove('hidden');
  $('#progress-section').classList.remove('hidden');
  $('#result-section').classList.add('hidden');

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'continueSearch',
      tabId: currentTabId,
      domain: currentDomain,
    });

    showResult(result);
  } catch (err) {
    showResult({ done: true, best: null, totalTried: 0, error: err.message });
  }

  searchFinished();
}

function searchFinished() {
  isSearching = false;
  $('#cancel-btn').classList.add('hidden');
  $('#start-btn').classList.remove('hidden');
  $('#start-btn').textContent = 'Start Over';
  $('#start-btn').disabled = false;
}

function cancelSearch() {
  chrome.runtime.sendMessage({ action: 'cancelSearch' });
}

function showResult(result) {
  $('#progress-section').classList.add('hidden');
  $('#result-section').classList.remove('hidden');

  if (result?.best) {
    $('#result-success').classList.remove('hidden');
    $('#result-none').classList.add('hidden');

    const currency = detectCurrency();
    $('#result-amount').textContent = currency + formatNumber(result.best.discount);
    $('#result-code').textContent = result.best.code;
    $('#result-detail').textContent = `Tested ${result.totalTried} codes`;
  } else {
    $('#result-none').classList.remove('hidden');
    $('#result-success').classList.add('hidden');
    $('#result-tried').textContent = result?.totalTried
      ? `Tried ${result.totalTried} codes — none worked`
      : 'Could not test codes';
  }

  // Show "Keep Going" button if there are more codes
  if (result?.hasMoreCodes && result.remainingCount > 0) {
    $('#continue-btn').classList.remove('hidden');
    $('#remaining-count').textContent = result.remainingCount;
  } else {
    $('#continue-btn').classList.add('hidden');
  }
}

function detectCurrency() {
  return '\u20AC'; // €
}

function formatNumber(n) {
  if (!n) return '0';
  return n.toFixed(2);
}

// --- Progress Updates ---

function applyProgressUpdate(msg) {
  if (msg.phase === 'searching') {
    $('#progress-phase').textContent = 'Searching...';
    $('#progress-count').textContent = '';
    $('#progress-code').textContent = msg.message || 'Searching for codes online...';
    $('#progress-fill').style.width = '0%';
  }

  if (msg.phase === 'searching_done') {
    $('#progress-code').textContent = msg.message;

    if (msg.sources) {
      $('#sources-info').classList.remove('hidden');
      const list = $('#sources-list');
      list.innerHTML = '';
      if (msg.sources.reddit > 0)
        list.innerHTML += `<span class="source-tag">Reddit: ${msg.sources.reddit}</span>`;
      if (msg.sources.couponSites > 0)
        list.innerHTML += `<span class="source-tag">Coupon sites: ${msg.sources.couponSites}</span>`;
      list.innerHTML += `<span class="source-tag">Generated: ${msg.sources.generated}</span>`;
      list.innerHTML += `<span class="source-tag">Common: ${msg.sources.common}</span>`;
    }
  }

  if (msg.phase === 'trying') {
    const pct = msg.total > 0 ? Math.round((msg.current / msg.total) * 100) : 0;
    $('#progress-fill').style.width = pct + '%';
    $('#progress-phase').textContent = 'Testing codes...';
    $('#progress-count').textContent = `${msg.current} / ${msg.total}`;
    $('#progress-code').textContent = `Trying ${msg.code}...`;

    if (msg.bestResult || msg.bestSoFar) {
      const best = msg.bestResult || msg.bestSoFar;
      $('#progress-best').classList.remove('hidden');
      $('#best-code').textContent = best.code;
      $('#best-amount').textContent = '\u20AC' + formatNumber(best.discount);
    }
  }

  if (msg.phase === 'done' || msg.phase === 'cancelled') {
    showResult({
      done: true,
      best: msg.bestResult || msg.best,
      totalTried: msg.results?.tried || msg.totalTried || 0,
      results: msg.results,
      hasMoreCodes: msg.hasMoreCodes,
      remainingCount: msg.remainingCount,
    });
    searchFinished();
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action !== 'progress') return;
  applyProgressUpdate(msg);
});

// --- Event Listeners ---

$('#start-btn').addEventListener('click', startSearch);
$('#cancel-btn').addEventListener('click', cancelSearch);
$('#continue-btn').addEventListener('click', continueSearch);

// Init on popup open
init();
