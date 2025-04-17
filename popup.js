// popup.js — Final version with direct tab messaging

const fileInput = document.getElementById('csvFile');
const saveBtn = document.getElementById('saveCsvBtn');
const clearBtn = document.getElementById('clearBtn');
const delayInput = document.getElementById('fillDelay');
const logDebugCheckbox = document.getElementById('logDebug');
const statusMessage = document.getElementById('statusMessage');

// === Utility ===
function setStatus(msg, timeout = 3000) {
  statusMessage.textContent = msg;
  if (timeout > 0) {
    setTimeout(() => {
      statusMessage.textContent = '';
    }, timeout);
  }
}

// === Save and Fill Logic ===
saveBtn.addEventListener('click', () => {
  const file = fileInput.files[0];
  if (!file || !file.name.endsWith('.csv')) {
    setStatus('❌ Please select a valid .csv file');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const csvText = e.target.result;
    const delay = parseInt(delayInput.value || '250', 10);
    const logDebug = logDebugCheckbox.checked;

    if (!csvText || !csvText.includes(',')) {
      setStatus('⚠️ Invalid CSV format');
      return;
    }

    // Save to local storage
    chrome.storage.local.set({
      autofillCSV: csvText,
      fillDelay: delay,
      logDebug: logDebug
    }, () => {
      console.log('[Popup] ✅ CSV saved. Now triggering autofill...');

      // Send message to current active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { action: 'startFillingWithCSV' }, () => {
            if (chrome.runtime.lastError) {
              console.error('[Popup] ❌ Error sending message to tab:', chrome.runtime.lastError.message);
              setStatus('❌ Could not reach tab. Make sure the page is open and refreshed.');
            } else {
              console.log('[Popup] 🚀 Autofill triggered in tab:', tab.id);
              setStatus('✅ Autofill triggered!');
            }
          });
        } else {
          setStatus('❌ No active tab found.');
        }
      });
    });
  };

  reader.onerror = () => {
    setStatus('❌ Error reading file');
  };

  reader.readAsText(file);
});

// === Clear Button Logic ===
clearBtn.addEventListener('click', () => {
  chrome.storage.local.clear(() => {
    console.log('[Popup] 🧹 Storage cleared');
    setStatus('🧹 Cleared saved CSV/settings');
    fileInput.value = '';
  });
});

// === Restore Settings on Load ===
window.addEventListener('DOMContentLoaded', async () => {
  chrome.storage.local.get(['fillDelay', 'logDebug'], (res) => {
    if (res.fillDelay) delayInput.value = res.fillDelay;
    if (res.logDebug !== undefined) logDebugCheckbox.checked = res.logDebug;
  });
});
