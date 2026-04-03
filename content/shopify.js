// Content script for Shopify checkout pages
// Handles DOM interaction: applying codes, detecting results, removing codes
// Supports multi-language Shopify checkouts (EN, DE, FR, ES, IT, NL, PT, etc.)
// Version: 1.2.0

// --- SELECTORS ---

function getDiscountInput() {
  return document.querySelector('input[id^="ReductionsInput"]')
    || document.querySelector('#checkout_reduction_code')
    || document.querySelector('input[name="reductions"]');
}

function getApplyButton() {
  const input = getDiscountInput();
  if (!input) return null;

  // The Apply button is the closest button SIBLING to the input field.
  // NOT the "Add discount" button which is further up in the container.
  // Walk up from the input to find its immediate wrapper, then find a button there.
  let el = input.parentElement;
  for (let i = 0; i < 5 && el; i++) {
    const btn = el.querySelector('button');
    if (btn) {
      // Verify this is the Apply button, not "Add discount" —
      // The Apply button is always near the input (same form group).
      // Check: the button should be a sibling or close relative of the input,
      // not a separate section header button.
      const inputRect = input.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      // Apply button is on the same horizontal line as the input (within 50px vertically)
      if (Math.abs(inputRect.top - btnRect.top) < 50) {
        return btn;
      }
    }
    el = el.parentElement;
  }

  // Fallback: find button with discount-related "apply" text in any language
  const applyKeywords = [
    'apply discount', 'apply code',                      // EN
    'rabattcode nutzen', 'code nutzen', 'anwenden',      // DE
    'appliquer', 'utiliser le code',                     // FR
    'aplicar código', 'aplicar descuento',               // ES
    'usar código',                                       // PT
    'applica codice', 'utilizza codice',                 // IT
    'code toepassen',                                    // NL
  ];
  const buttons = Array.from(document.querySelectorAll('button'));
  return buttons.find(b => {
    const text = b.textContent.trim().toLowerCase();
    return applyKeywords.some(kw => text.includes(kw));
  });
}

function getRemoveButton(code) {
  const buttons = Array.from(document.querySelectorAll('button'));
  return buttons.find(b => {
    const text = b.textContent.trim();
    return text.includes(code) && text.length < code.length + 30;
  });
}

function getTotalPrice() {
  const tables = document.querySelectorAll('[role="table"]');
  for (const table of tables) {
    const rows = table.querySelectorAll('[role="row"]');
    if (rows.length < 2) continue;
    const lastRow = rows[rows.length - 1];
    const cell = lastRow.querySelector('[role="cell"]');
    if (cell) {
      const match = cell.textContent.match(/([\d]+[.,][\d]{2})/);
      if (match) return parseFloat(match[1].replace(/,/g, '.'));
    }
  }
  return null;
}

function getDiscountAmount() {
  const cells = document.querySelectorAll('[role="cell"]');
  for (const cell of cells) {
    const text = cell.textContent;
    const match = text.match(/[−\-]\s*(?:[A-Z]{0,3}\s*)?[€$£]?\s*([\d]+[.,][\d]{2})/);
    if (match) return parseFloat(match[1].replace(/,/g, '.'));
  }
  return null;
}

function isCodeApplied() {
  // Strategy 1: Check for remove button
  const buttons = Array.from(document.querySelectorAll('button'));
  const hasRemoveBtn = buttons.some(b => {
    const text = b.textContent.trim().toLowerCase();
    return (text.includes('remove') || text.includes('entfernen') || text.includes('supprimer')
      || text.includes('eliminar') || text.includes('rimuovi') || text.includes('verwijder'))
      && text.length < 50;
  });
  if (hasRemoveBtn) return true;

  // Strategy 2: Discount amount cell
  if (getDiscountAmount()) return true;

  // Strategy 3: Discount-related rowheaders
  const keywords = [
    'order discount', 'total savings',
    'bestellrabatt', 'gesamte ersparnis',
    'remise', 'réduction',
    'descuento', 'ahorro total',
    'sconto', 'risparmio totale',
    'orderkorting', 'totale besparing',
  ];
  const headers = document.querySelectorAll('[role="rowheader"]');
  return Array.from(headers).some(h => {
    const text = h.textContent.toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });
}

function getAppliedCodeName() {
  const buttons = Array.from(document.querySelectorAll('button'));
  const removeWords = ['remove', 'entfernen', 'supprimer', 'eliminar', 'rimuovi', 'verwijder'];
  for (const b of buttons) {
    const text = b.textContent.trim();
    const lower = text.toLowerCase();
    for (const word of removeWords) {
      if (lower.includes(word)) {
        const codeName = text.replace(new RegExp(word, 'gi'), '').trim();
        if (codeName.length >= 3 && codeName.length <= 30) return codeName;
      }
    }
  }
  return null;
}

function getErrorState() {
  const input = getDiscountInput();
  if (!input) return null;

  const descId = input.getAttribute('aria-describedby');
  if (descId) {
    const ids = descId.split(/\s+/);
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.textContent.trim().length > 0) {
        const text = el.textContent.toLowerCase();
        const errorKeywords = [
          'valid discount', 'enter a valid', 'not found', 'unable to find',
          'gültigen', 'ungültig',
          'valide', 'invalide', 'introuvable',
          'válido', 'inválido', 'no encontrado',
          'valido', 'non valido', 'non trovato',
          'geldig', 'ongeldig',
        ];
        const expiredKeywords = ['expired', 'abgelaufen', 'expiré', 'expirado', 'scaduto', 'verlopen'];
        const minimumKeywords = ['minimum', 'mindest', 'minimo', 'mínimo'];

        if (expiredKeywords.some(kw => text.includes(kw))) return 'expired';
        if (minimumKeywords.some(kw => text.includes(kw))) return 'minimum_not_met';
        if (errorKeywords.some(kw => text.includes(kw))) return 'invalid';
        if (text.length > 5) return 'invalid';
      }
    }
  }

  const parent = input.closest('div[class*="field"], fieldset, section') || input.parentElement?.parentElement;
  if (parent) {
    const errorEl = parent.querySelector('[role="alert"], [class*="error"], [id*="error"]');
    if (errorEl && errorEl.textContent.trim()) return 'invalid';
  }

  return null;
}

// --- WAITING ---

function getCostSummaryTable() {
  const tables = document.querySelectorAll('[role="table"]');
  for (const table of tables) {
    if (table.querySelector('[role="rowheader"]')) return table;
  }
  return tables[0] || null;
}

// Wait for Shopify to respond after clicking Apply.
// Simple approach: wait a minimum time for Shopify AJAX, then poll for result.
// No MutationObserver — avoids race conditions with our own DOM changes.
function waitForResponse(prevErrorText, timeout = 3000) {
  return new Promise(resolve => {
    // Wait at least 400ms for Shopify to process the AJAX request
    // before we start checking for results
    const MIN_WAIT = 400;
    const POLL_INTERVAL = 80;

    const startTime = Date.now();

    const poll = setInterval(() => {
      const elapsed = Date.now() - startTime;

      // Don't check until minimum wait has passed
      if (elapsed < MIN_WAIT) return;

      // Check if error text changed from before we clicked
      const currentErrorText = getErrorText();
      if (currentErrorText !== prevErrorText) {
        clearInterval(poll);
        clearTimeout(fallback);
        resolve();
        return;
      }

      // Check if a discount was applied
      if (isCodeApplied()) {
        clearInterval(poll);
        clearTimeout(fallback);
        resolve();
        return;
      }
    }, POLL_INTERVAL);

    const fallback = setTimeout(() => {
      clearInterval(poll);
      resolve();
    }, timeout);
  });
}

// Get the raw error/description text from the discount input's aria-describedby
function getErrorText() {
  const input = getDiscountInput();
  if (!input) return '';
  const descId = input.getAttribute('aria-describedby');
  if (!descId) return '';
  return descId.split(/\s+/).map(id => {
    const el = document.getElementById(id);
    return el ? el.textContent.trim() : '';
  }).join('|');
}

function waitForRemoval(timeout = 2000) {
  return new Promise(resolve => {
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; clearInterval(poll); clearTimeout(fb); resolve(); } };
    const poll = setInterval(() => { if (!isCodeApplied()) done(); }, 50);
    const fb = setTimeout(done, timeout);
  });
}

// --- CORE ACTIONS ---

async function applyCode(code) {
  const input = getDiscountInput();
  const button = getApplyButton();
  if (!input || !button) {
    return { success: false, error: 'dom_not_found' };
  }

  const totalBefore = getTotalPrice();

  // Set the code value
  input.focus();
  input.value = code;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // Wait for button to enable
  await new Promise(r => setTimeout(r, 150));

  // Snapshot the error text RIGHT BEFORE clicking — after React has processed our input change
  const prevErrorText = getErrorText();

  // Click Apply
  button.disabled = false;
  button.click();

  // Wait for Shopify to respond: min 400ms wait, then poll for changed error text or applied discount
  await waitForResponse(prevErrorText, 3000);

  // Give React a moment to finish rendering all updates (discount row, remove button, etc.)
  // Then check multiple times — success DOM updates can lag behind the error text change
  for (let check = 0; check < 5; check++) {
    await new Promise(r => setTimeout(r, 150));

    if (isCodeApplied()) {
      const discount = getDiscountAmount();
      const totalAfter = getTotalPrice();
      return {
        success: true,
        code,
        discount: discount || (totalBefore && totalAfter ? totalBefore - totalAfter : 0),
        total: totalAfter,
        totalBefore,
      };
    }

    // If there's a clear error, no point waiting more
    if (getErrorState()) break;
  }

  const error = getErrorState();
  return { success: false, error: error || 'unknown', code };
}

async function removeCurrentCode(code) {
  const appliedCode = code || getAppliedCodeName();
  if (!appliedCode) return false;

  const removeBtn = getRemoveButton(appliedCode);
  if (!removeBtn) return false;

  removeBtn.click();
  await waitForRemoval(2000);

  return !isCodeApplied();
}

// --- MESSAGE HANDLER ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'detectShopify') {
    const input = getDiscountInput();
    sendResponse({
      isShopify: !!input,
      domain: window.location.hostname,
      currentTotal: getTotalPrice(),
      hasExistingDiscount: isCodeApplied(),
      appliedCode: getAppliedCodeName(),
    });
    return true;
  }

  if (msg.action === 'applyCode') {
    applyCode(msg.code).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (msg.action === 'removeCode') {
    removeCurrentCode(msg.code).then(result => {
      sendResponse(result);
    }).catch(() => {
      sendResponse(false);
    });
    return true;
  }

  if (msg.action === 'getState') {
    sendResponse({
      total: getTotalPrice(),
      discount: getDiscountAmount(),
      isApplied: isCodeApplied(),
      appliedCode: getAppliedCodeName(),
    });
    return true;
  }
});

chrome.runtime.sendMessage({
  action: 'contentScriptReady',
  url: window.location.href,
  domain: window.location.hostname,
}).catch(() => {});
