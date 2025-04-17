// === content.js — Smart Autofill Extension with Full Panel, Banner, Auto Mode, and Error Logging ===

console.log('[Autofill] ✅ content.js loaded');

let autofillErrors = [];

// === Inject Panel UI with Buttons + Banner ===
injectAutofillPanel();

// === Message Listener for popup trigger ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startFillingWithCSV') {
    console.log('[Content] 🔥 startFillingWithCSV triggered');
    startFillingProcess().then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error('[Content] ❌ Autofill error:', err);
        sendResponse({ success: false });
      });
    return true;
  }
});

function injectAutofillPanel() {
  const existing = document.getElementById('autofill-controls');
  if (existing) return;

  const interval = setInterval(() => {
    const saveBtn = document.querySelector('input.btn-success[value="Save"]');
    if (!saveBtn) return;
    clearInterval(interval);

    const wrapper = document.createElement('div');
    wrapper.id = 'autofill-controls';
    wrapper.style.margin = '12px 0';

    wrapper.innerHTML = `
      <div style="border: 1px solid #ccc; padding: 10px; border-radius: 8px; background: #f9fafb">
        <div id="autofill-banner" style="background:#2563eb;color:white;padding:6px 12px;font-weight:bold;border-radius:6px;margin-bottom:10px;">📋 Ready to autofill</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button id="fillBtn" type="button">🔁 Fill Page</button>
          <button id="saveBtn" type="button">💾 Save</button>
          <button id="nextBtn" type="button">➡️ Next Page</button>
          <button id="loadCsvBtn" type="button">📥 Load CSV</button>
          <button id="autoModeBtn" type="button">🧠 Auto Mode</button>
        </div>
        <input type="file" id="hiddenCsvInput" accept=".csv" style="display:none;" />
        <div id="autofill-errors" style="display:none"></div>
      </div>
    `;

    const form = saveBtn.closest('form');
    form?.parentNode.insertBefore(wrapper, form);

    const $ = (id) => wrapper.querySelector(id);

    $('#fillBtn').onclick = () => startFillingProcess();
    $('#saveBtn').onclick = () => document.querySelector('input.btn-success[value="Save"]')?.click();
    $('#nextBtn').onclick = () => document.querySelector('a[aria-label="Next page"]')?.click();
    $('#loadCsvBtn').onclick = () => $('#hiddenCsvInput').click();
    $('#hiddenCsvInput').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file?.name.endsWith('.csv')) return alert('❌ Please select a valid CSV');
      const reader = new FileReader();
      reader.onload = async (e) => {
        await chrome.storage.local.set({ autofillCSV: e.target.result });
        alert('✅ CSV loaded. Starting autofill...');
        startFillingProcess();
      };
      reader.readAsText(file);
    };

    $('#autoModeBtn').onclick = () => {
      chrome.storage.local.get(['autoMode'], (current) => {
        const newVal = !current.autoMode;
        chrome.storage.local.set({ autoMode: newVal }, () => {
          alert(`🧠 Auto Mode ${newVal ? 'Enabled' : 'Disabled'}`);
          if (newVal) startFillingProcess();
        });
      });
    };

    console.log('[Autofill] ✅ Control panel injected');
  }, 500);
}

function showBanner(message, color = '#2563eb') {
  let banner = document.getElementById('autofill-banner');
  if (banner) banner.style.background = color;
  if (banner) banner.textContent = message;
}

function logError(name, field, expectedValue) {
  autofillErrors.push({ name, field, value: expectedValue });
  updateErrorLogUI();
}

function updateErrorLogUI() {
  let box = document.getElementById('autofill-errors');
  if (!box) return;
  box.style.display = 'block';
  const grouped = autofillErrors.reduce((acc, { name, field, value }) => {
    if (!acc[name]) acc[name] = [];
    acc[name].push(`↳ ${field}: "${value}" not found`);
    return acc;
  }, {});
  const output = Object.entries(grouped).map(([name, issues]) => `❌ ${name}\n  ${issues.join('\n  ')}`).join('\n\n');
  box.innerHTML = `<pre style="white-space: pre-wrap">${output}</pre><button id="copyErrors" style="margin-top: 6px; padding: 4px 8px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">📋 Copy Errors</button>`;
  document.getElementById('copyErrors').onclick = () => {
    navigator.clipboard.writeText(output).then(() => alert('✅ Errors copied to clipboard'));
  };
}

async function startFillingProcess() {
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const getStorage = (keys) => new Promise((res) => chrome.storage.local.get(keys, res));

  const { autofillCSV, logDebug, fillDelay = 250, autoMode = false } = await getStorage([
    'autofillCSV', 'logDebug', 'fillDelay', 'autoMode'
  ]);

  autofillErrors = [];
  showBanner('🔄 Autofill in progress...', '#2563eb');

  const log = (...args) => logDebug && console.log('[Autofill]', ...args);
  if (!autofillCSV) return alert('⚠️ No CSV loaded');

  const parseCSV = (csvText) => {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data = {};
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(cell => cell.trim());
      const entry = {};
      headers.forEach((h, j) => entry[h] = row[j]);
      const nameKey = entry['Child Name']?.replace(/-/g, '').trim();
      if (nameKey) data[nameKey] = entry;
    }
    return data;
  };

  const mechanicalClick = (el) => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };

  const fillDropdown = async (select, value, retries = 5, delay = fillDelay) => {
    const normalize = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const target = normalize(value);
    for (let i = 0; i < retries; i++) {
      const match = [...select.options].find(opt => normalize(opt.textContent) === target);
      if (match) {
        select.value = match.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        mechanicalClick(select);
        mechanicalClick(match);
        return true;
      }
      await sleep(delay);
    }
    return false;
  };

  const fillSelect2 = (wrapper, text) => new Promise((resolve) => {
    if (!wrapper || !text || text === '0') return resolve(false);
    const input = wrapper.querySelector('.select2-search__field');
    if (!input) return resolve(false);

    const observer = new MutationObserver(() => {
      const result = [...document.querySelectorAll('.select2-results__option')]
        .find(opt => opt.textContent.trim() === text);
      if (result) {
        mechanicalClick(result);
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const data = parseCSV(autofillCSV);
  const rows = document.querySelectorAll('table tbody tr');
  const form = document.querySelector('form');

  let formBlocked = true;
  const blockSubmit = (e) => formBlocked && (e.preventDefault(), e.stopPropagation());
  form?.addEventListener('submit', blockSubmit, true);

  for (const row of rows) {
    const nameCell = row.querySelector('td:nth-child(2)');
    const key = nameCell?.textContent?.replace(/-/g, '').trim();
    const record = data[key];
    if (!record) continue;

    const typeFilled = await fillDropdown(row.querySelector('.child-type'), record['Child Type']);
    if (!typeFilled) logError(key, 'Child Type', record['Child Type']);
    await sleep(fillDelay);

    const groupFilled = await fillDropdown(row.querySelector('.child-pricing-group'), record['Pricing Group']);
    if (!groupFilled) logError(key, 'Pricing Group', record['Pricing Group']);
    await sleep(fillDelay);

    const optionFilled = await fillDropdown(row.querySelector('.child-pricing-options'), record['Pricing Option']);
    if (!optionFilled) logError(key, 'Pricing Option', record['Pricing Option']);
    await sleep(fillDelay);

    if (record['Discounts'] && record['Discounts'] !== '0') {
      const discountFilled = await fillSelect2(row.querySelector('td:nth-child(4) .select2-container'), record['Discounts']);
      if (!discountFilled) logError(key, 'Discounts', record['Discounts']);
      await sleep(fillDelay);
    }
  }

  formBlocked = false;
  document.querySelector('input.btn-success[value="Save"]')?.click();
  showBanner(`✅ Autofill done! Errors: ${autofillErrors.length}`, autofillErrors.length ? '#b91c1c' : '#22c55e');

  if (autoMode) {
    await sleep(2000);
    const nextLink = document.querySelector('a[aria-label="Next page"]');
    if (nextLink) {
      console.log('[Autofill] ➡️ Auto Mode: going to next page');
      nextLink.click();
    } else {
      chrome.storage.local.set({ autoMode: false });
      alert('✅ All pages processed. Auto Mode complete.');
    }
  }
}
