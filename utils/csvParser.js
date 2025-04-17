// utils/csvParser.js
// Safe and structured CSV parser for autofill

export function parseCSV(csvText, { debug = false } = {}) {
    const log = (...args) => debug && console.log('[CSVParser]', ...args);
  
    if (typeof csvText !== 'string' || !csvText.trim().includes(',')) {
      throw new Error('Invalid CSV data. Must be a non-empty string with at least one comma.');
    }
  
    const lines = csvText
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  
    if (lines.length < 2) {
      throw new Error('CSV must contain a header and at least one row.');
    }
  
    const headers = lines[0].split(',').map(h => h.trim());
    const data = {};
  
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(cell => cell.trim());
      if (row.length !== headers.length) {
        log(`⚠️ Skipping malformed row ${i + 1}:`, row);
        continue;
      }
  
      const entry = {};
      headers.forEach((header, idx) => {
        entry[header] = row[idx] || '';
      });
  
      if (!entry['Child Name']) {
        log(`❌ Row ${i + 1} missing 'Child Name'. Skipped.`);
        continue;
      }
  
      const nameKey = entry['Child Name'].replace(/-/g, '').trim();
      if (!nameKey) {
        log(`❌ Row ${i + 1} has empty name key after cleanup. Skipped.`);
        continue;
      }
  
      if (data[nameKey]) {
        log(`⚠️ Duplicate entry for '${nameKey}' found. Overwriting previous.`);
      }
  
      data[nameKey] = entry;
    }
  
    log(`✅ Parsed ${Object.keys(data).length} valid entries.`);
    return data;
  }
  