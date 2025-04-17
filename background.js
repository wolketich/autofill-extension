// background.js — Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
    console.log('[Autofill Extension] ✅ Installed and ready.');
  });
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const logPrefix = '[Background]';
  
    if (request.action === 'broadcastCSV') {
      if (!request.csvText || typeof request.csvText !== 'string') {
        console.warn(`${logPrefix} ❌ Invalid CSV data received.`);
        sendResponse({ success: false });
        return;
      }
    
      chrome.storage.local.set({ autofillCSV: request.csvText }, () => {
        console.log(`${logPrefix} 📦 CSV stored in local storage.`);
    
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          if (!tab?.id) {
            console.warn(`${logPrefix} ❌ No active tab found.`);
            sendResponse({ success: false });
            return;
          }
    
          chrome.tabs.sendMessage(tab.id, { action: 'startFillingWithCSV' }, () => {
            console.log(`${logPrefix} 🚀 Triggered autofill in tab ${tab.id}`);
            sendResponse({ success: true });
          });
        });
      });
    
      return true; // keep sendResponse channel open
    }
    
  
    if (request.action === 'clearStorage') {
      chrome.storage.local.clear(() => {
        console.log(`${logPrefix} 🧹 Cleared all local storage data.`);
        sendResponse({ success: true });
      });
      return true;
    }
  
    if (request.action === 'ping') {
      sendResponse({ message: 'pong', time: new Date().toISOString() });
    }
  });
  