// === Autofill content script ===

console.log('[Autofill] ✅ content.js loaded');

injectPageButton();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Content] 📩 Message received:', request);
  if (request.action === 'startFillingWithCSV') {
    console.log('[Content] 🔥 startFillingWithCSV triggered');
    startFillingProcess().then(() => {
      sendResponse({ success: true });
    }).catch((err) => {
      console.error('[Content] ❌ Autofill error:', err);
      sendResponse({ success: false });
    });
    return true; // keep channel open
  }
});

function injectPageButton() {
  if (document.getElementById('autofill-controls')) return;

  const interval = setInterval(() => {
    const saveBtn = document.querySelector('input.btn-success[value="Save"]');
    if (!saveBtn) return;

    clearInterval(interval);

    const wrapper = document.createElement('div');
    wrapper.id = 'autofill-controls';
    wrapper.style.margin = '10px 0';

    wrapper.innerHTML = `
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button id="fillBtn" type="button" style="
          background-color: #2563eb;
          color: white;
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;">🔁 Fill Page</button>

        <button id="saveBtn" type="button" style="
          background-color: #22c55e;
          color: white;
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;">💾 Save</button>

        <button id="nextBtn" type="button" style="
          background-color: #f97316;
          color: white;
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;">➡️ Next Page</button>
      </div>
    `;

    // === Add actions
    wrapper.querySelector('#fillBtn').addEventListener('click', () => {
      console.log('[Autofill] 🔁 Fill button clicked');
      startFillingProcess();
    });

    wrapper.querySelector('#saveBtn').addEventListener('click', () => {
      const realSave = document.querySelector('input.btn-success[value="Save"]');
      if (realSave) {
        console.log('[Autofill] 💾 Clicking Save button');
        realSave.click();
      } else {
        console.warn('[Autofill] ❌ Save button not found');
      }
    });

    wrapper.querySelector('#nextBtn').addEventListener('click', () => {
      const nextLink = document.querySelector('a[aria-label="Next page"]');
      if (nextLink) {
        console.log('[Autofill] ➡️ Clicking Next Page');
        nextLink.click();
      } else {
        console.warn('[Autofill] ❌ Next page link not found');
      }
    });

    // Insert above the form
    const form = saveBtn.closest('form');
    form?.parentNode.insertBefore(wrapper, form);

    console.log('[Autofill] ✅ Control panel injected');
  }, 500);
}


async function startFillingProcess() {
  console.log('[Autofill] 🚀 Starting autofill');

  const getStorage = (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, resolve));

  const { autofillCSV, logDebug, fillDelay } = await getStorage([
    'autofillCSV',
    'logDebug',
    'fillDelay'
  ]);

  const delay = parseInt(fillDelay ?? 250);
  const enableLog = logDebug ?? true;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const log = (...args) => enableLog && console.log('[Autofill]', ...args);

  const parseCSV = (csvText) => {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data = {};
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(cell => cell.trim());
      if (row.length !== headers.length) continue;

      const entry = {};
      headers.forEach((h, j) => entry[h] = row[j]);
      const nameKey = entry['Child Name']?.replace(/-/g, '').trim();
      if (nameKey) data[nameKey] = entry;
    }
    return data;
  };

  const mechanicalClick = (element) => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  async function fillDropdown(selectElement, targetText, log = console.log, maxRetries = 5, delay = 200) {
    if (!selectElement || !targetText) return false;
  
    const normalize = (str) => str.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizedTarget = normalize(targetText);
  
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const options = [...selectElement.options];
      const match = options.find(
        (opt) => normalize(opt.textContent) === normalizedTarget
      );
  
      if (match) {
        selectElement.value = match.value;
        selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        mechanicalClick(selectElement);
        mechanicalClick(match);
        log(`✅ Dropdown filled with "${targetText}" on attempt ${attempt}`);
        return true;
      }
  
      log(`⏳ Attempt ${attempt}: "${targetText}" not found in dropdown`);
      await sleep(delay);
    }
  
    log(`❌ Failed to fill "${targetText}" after ${maxRetries} attempts`);
    return false;
  }
  
  function fillSelect2(wrapper, valueText) {
    return new Promise((resolve) => {
      if (!wrapper || !valueText || valueText === '0') return resolve(false);

      const input = wrapper.querySelector('.select2-search__field');
      if (!input) return resolve(false);

      const observer = new MutationObserver(() => {
        const result = [...document.querySelectorAll('.select2-results__option')]
          .find(opt => opt.textContent.trim() === valueText);
        if (result) {
          mechanicalClick(result);
          observer.disconnect();
          resolve(true);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      input.focus();
      input.value = valueText;
      input.dispatchEvent(new Event('input', { bubbles: true }));

      log(`🔍 Searching Select2 for: ${valueText}`);
    });
  }

  const data = parseCSV(autofillCSV);
  log(`📊 Parsed ${Object.keys(data).length} valid entries.`);

  const rows = document.querySelectorAll('table tbody tr');
  const form = document.querySelector('form');
  let formBlocked = false;
  let somethingFilled = false;

  if (form) {
    const preventSubmit = (e) => {
      if (formBlocked) {
        e.preventDefault();
        e.stopPropagation();
        log('⛔ Prevented premature form submission');
      }
    };
    form.addEventListener('submit', preventSubmit, true);
    formBlocked = true;
  }

  for (const row of rows) {
    const nameCell = row.querySelector('td:nth-child(2)');
    if (!nameCell) continue;

    const nameKey = nameCell.textContent?.replace(/-/g, '').trim();
    const record = data[nameKey];
    if (!record) continue;

    // === Fill Child Type
    const typeSelect = row.querySelector('.child-type');
    if (await fillDropdown(typeSelect, record['Child Type'])) {
      log(`✅ Set Child Type: ${record['Child Type']} for ${nameKey}`);
      somethingFilled = true;
    }

    await sleep(delay);

    // === Fill Pricing Group
    const groupSelect = row.querySelector('.child-pricing-group');
    if (await fillDropdown(groupSelect, record['Pricing Group'])) {
      log(`✅ Set Pricing Group: ${record['Pricing Group']} for ${nameKey}`);
      somethingFilled = true;
    }

    await sleep(delay);

    // === Fill Pricing Option
    const optionSelect = row.querySelector('.child-pricing-options');
    if (await fillDropdown(optionSelect, record['Pricing Option'])) {
      log(`✅ Set Pricing Option: ${record['Pricing Option']} for ${nameKey}`);
      somethingFilled = true;
    }

    await sleep(delay);

    // === Fill Discounts (Select2)
    const discountWrapper = row.querySelector('td:nth-child(4) .select2-container');
    if (record['Discounts'] && record['Discounts'] !== '0') {
      const filled = await fillSelect2(discountWrapper, record['Discounts']);
      if (filled) {
        log(`🔵 Set Discount: ${record['Discounts']} for ${nameKey}`);
        somethingFilled = true;
      }
      await sleep(delay);
    }
  }

  formBlocked = false;

  if (form && somethingFilled) {
    await sleep(300);
    log('💾 Submitting form...');
    const realSave = document.querySelector('input.btn-success[value="Save"]');
    realSave.click();
    log('✅ Form submitted');
  } else {
    log('⚠️ Nothing filled. Skipping submission.');
  }
}
