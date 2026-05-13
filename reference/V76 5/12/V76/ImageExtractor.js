function syncBoatListingImageUrlsBatch() {
  const SHEET_NAME = 'UIMT';
  const FIRST_DATA_ROW = 3;

  const WEBSITE_URL_COL = 52;      // AZ
  const IMAGE_START_COL = 53;      // BA
  const IMAGE_COL_COUNT = 50;      // BA:CX
  const MAX_IMAGES_TO_PULL = 50;   // only pull/write first 50 images

  const STATUS_COL = 103;          // CY
  const LAST_SYNC_COL = 104;       // CZ
  const LAST_URL_SYNCED_COL = 105; // DA

  const FETCH_BATCH_SIZE = 20;
  const SLEEP_BETWEEN_BATCHES_MS = 300;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);

  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return;

  const numRows = lastRow - FIRST_DATA_ROW + 1;

  const readRange = sheet.getRange(
    FIRST_DATA_ROW,
    WEBSITE_URL_COL,
    numRows,
    LAST_URL_SYNCED_COL - WEBSITE_URL_COL + 1
  );

  const data = readRange.getValues();

  const WEBSITE_IDX = 0; // AZ relative to read range
  const LAST_URL_SYNCED_IDX = LAST_URL_SYNCED_COL - WEBSITE_URL_COL; // CQ relative

  const imageOutput = Array.from({ length: numRows }, function() {
    return new Array(IMAGE_COL_COUNT).fill('');
  });

  const metaOutput = Array.from({ length: numRows }, function() {
    return ['', '', '']; // CO Status, CP Date Updated, CQ Last URL Synced
  });

  const rowsToFetch = [];

  for (let i = 0; i < data.length; i++) {
    const rowNumber = FIRST_DATA_ROW + i;
    const websiteUrl = String(data[i][WEBSITE_IDX] || '').trim();
    const lastUrlSynced = String(data[i][LAST_URL_SYNCED_IDX] || '').trim();

    if (!websiteUrl) {
      metaOutput[i] = ['NO WEBSITE URL', new Date(), ''];
      continue;
    }

    rowsToFetch.push({
      index: i,
      rowNumber: rowNumber,
      websiteUrl: websiteUrl,
      lastUrlSynced: lastUrlSynced
    });
  }

  for (let start = 0; start < rowsToFetch.length; start += FETCH_BATCH_SIZE) {
    const batch = rowsToFetch.slice(start, start + FETCH_BATCH_SIZE);

    const requests = batch.map(function(item) {
      return {
        url: item.websiteUrl,
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      };
    });

    let responses;

    try {
      responses = UrlFetchApp.fetchAll(requests);
    } catch (err) {
      batch.forEach(function(item) {
        metaOutput[item.index] = ['FETCH BATCH ERROR', new Date(), item.websiteUrl];
        Logger.log('Batch fetch failed near row ' + item.rowNumber + ': ' + err);
      });

      Utilities.sleep(SLEEP_BETWEEN_BATCHES_MS);
      continue;
    }

    responses.forEach(function(response, batchIndex) {
      const item = batch[batchIndex];
      const outputIndex = item.index;

      try {
        const code = response.getResponseCode();
        const html = response.getContentText();

        if (code >= 400) {
          metaOutput[outputIndex] = ['FETCH ERROR ' + code, new Date(), item.websiteUrl];
          Logger.log('Row ' + item.rowNumber + ' HTTP error ' + code + ' for ' + item.websiteUrl);
          return;
        }

        const imageUrls = extractBoatImageUrlsFromStructuredData_(html)
          .slice(0, MAX_IMAGES_TO_PULL);

        const rowImages = new Array(IMAGE_COL_COUNT).fill('');

        imageUrls.forEach(function(url, idx) {
          rowImages[idx] = url;
        });

        imageOutput[outputIndex] = rowImages;

        const urlChanged = item.lastUrlSynced && item.lastUrlSynced !== item.websiteUrl;

        const status = imageUrls.length
          ? (urlChanged ? 'UPDATED - URL CHANGED' : 'UPDATED')
          : 'NO IMAGES FOUND';

        metaOutput[outputIndex] = [status, new Date(), item.websiteUrl];

        Logger.log(JSON.stringify({
          rowNumber: item.rowNumber,
          websiteUrl: item.websiteUrl,
          responseCode: code,
          imageCount: imageUrls.length,
          firstImage: imageUrls[0] || '',
          status: status
        }));

      } catch (err) {
        metaOutput[outputIndex] = ['FETCH ERROR', new Date(), item.websiteUrl];
        Logger.log('Row ' + item.rowNumber + ' failed for ' + item.websiteUrl + ': ' + err);
      }
    });

    Utilities.sleep(SLEEP_BETWEEN_BATCHES_MS);
  }

  // Overwrites image URL cells BA:CN for every row.
  // Only the first 50 images are filled; the remaining image columns are cleared.
  sheet.getRange(FIRST_DATA_ROW, IMAGE_START_COL, numRows, IMAGE_COL_COUNT)
    .setValues(imageOutput);

  // Writes CO:Status, CP:Date Updated, CQ:Last URL Synced.
  sheet.getRange(FIRST_DATA_ROW, STATUS_COL, numRows, 3)
    .setValues(metaOutput);
  
  // Format CZ so it shows both date and time.
  sheet.getRange(FIRST_DATA_ROW, LAST_SYNC_COL, numRows, 1)
    .setNumberFormat('m/d/yyyy h:mm:ss AM/PM');
}


function extractBoatImageUrlsFromStructuredData_(html) {
  const results = [];
  const seen = new Set();

  // Pulls structured-data image URLs:
  // "url":"https://www.site.com/wp-content/uploads/...jpg"
  const regex = /"url":"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    let url = String(match[1] || '').replace(/\\\//g, '/').trim();
    const lower = url.toLowerCase();

    // Keep "not-local" and "sell-your-boat" images.
    // Only exclude obvious non-content assets.
    if (
      lower.includes('logo') ||
      lower.includes('favicon') ||
      lower.includes('placeholder') ||
      lower.includes('/themes/') ||
      lower.includes('/plugins/') ||
      lower.includes('/elementor/') ||
      lower.includes('/icons/')
    ) {
      continue;
    }

    if (!seen.has(url)) {
      seen.add(url);
      results.push(url);
    }
  }

  return results;
}


function createImageSyncTrigger() {
  deleteImageSyncTriggers();

  ScriptApp.newTrigger('syncBoatListingImageUrlsBatch')
    .timeBased()
    .everyHours(4)
    .create();
}


function deleteImageSyncTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncBoatListingImageUrlsBatch') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}


function clearImageSyncStatuses() {
  const SHEET_NAME = 'UIMT';
  const FIRST_DATA_ROW = 3;
  const STATUS_COL = 103;          // CY
  const LAST_SYNC_COL = 104;       // CZ
  const LAST_URL_SYNCED_COL = 105; // DA

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);

  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return;

  const numRows = lastRow - FIRST_DATA_ROW + 1;

  sheet.getRange(FIRST_DATA_ROW, STATUS_COL, numRows, 3).clearContent();
}


function clearImageUrlsAndStatuses() {
  const SHEET_NAME = 'UIMT';
  const FIRST_DATA_ROW = 3;

  const IMAGE_START_COL = 53;      // BA
  const IMAGE_COL_COUNT = 50;      // BA:CX
  const STATUS_COL = 103;          // CY
  const LAST_SYNC_COL = 104;       // CZ
  const LAST_URL_SYNCED_COL = 105; // DA

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);

  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return;

  const numRows = lastRow - FIRST_DATA_ROW + 1;

  sheet.getRange(FIRST_DATA_ROW, IMAGE_START_COL, numRows, IMAGE_COL_COUNT).clearContent();
  sheet.getRange(FIRST_DATA_ROW, STATUS_COL, numRows, 3).clearContent();
}


// Optional: use this only if humans sometimes manually edit Website URL in AZ.
// This will NOT reliably fire when a third-party report integration refreshes the data.
function onEdit(e) {
  try {
    const SHEET_NAME = 'UIMT';
    const FIRST_DATA_ROW = 3;
    const WEBSITE_URL_COL = 52; // AZ

    if (!e || !e.range) return;

    const range = e.range;
    const sheet = range.getSheet();

    if (sheet.getName() !== SHEET_NAME) return;

    const editedFirstRow = range.getRow();
    const editedLastRow = editedFirstRow + range.getNumRows() - 1;
    const editedFirstCol = range.getColumn();
    const editedLastCol = editedFirstCol + range.getNumColumns() - 1;

    const touchesWebsiteUrlCol =
      editedFirstCol <= WEBSITE_URL_COL && editedLastCol >= WEBSITE_URL_COL;

    if (!touchesWebsiteUrlCol) return;
    if (editedLastRow < FIRST_DATA_ROW) return;

    // Simple safe move: run the full refresh.
    // For your typical 100-120 rows, this is acceptable.
    syncBoatListingImageUrlsBatch();

  } catch (err) {
    Logger.log('onEdit image sync failed: ' + err);
  }
}

function syncBoatListingImageUrlsChangedOnly() {
  const SHEET_NAME = 'UIMT';
  const FIRST_DATA_ROW = 3;

  const WEBSITE_URL_COL = 52;      // AZ
  const IMAGE_START_COL = 53;      // BA
  const IMAGE_COL_COUNT = 50;      // BA:CX
  const MAX_IMAGES_TO_PULL = 50;

  const STATUS_COL = 103;          // CY
  const LAST_SYNC_COL = 104;       // CZ
  const LAST_URL_SYNCED_COL = 105; // DA

  const FETCH_BATCH_SIZE = 20;
  const SLEEP_BETWEEN_BATCHES_MS = 300;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);

  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return;

  const numRows = lastRow - FIRST_DATA_ROW + 1;

  const data = sheet.getRange(
    FIRST_DATA_ROW,
    WEBSITE_URL_COL,
    numRows,
    LAST_URL_SYNCED_COL - WEBSITE_URL_COL + 1
  ).getValues();

  const WEBSITE_IDX = 0;
  const LAST_URL_SYNCED_IDX = LAST_URL_SYNCED_COL - WEBSITE_URL_COL;

  const rowsToFetch = [];

  for (let i = 0; i < data.length; i++) {
    const rowNumber = FIRST_DATA_ROW + i;
    const websiteUrl = String(data[i][WEBSITE_IDX] || '').trim();
    const lastUrlSynced = String(data[i][LAST_URL_SYNCED_IDX] || '').trim();

    if (!websiteUrl) {
      continue;
    }

    if (websiteUrl !== lastUrlSynced) {
      rowsToFetch.push({
        rowNumber: rowNumber,
        websiteUrl: websiteUrl,
        lastUrlSynced: lastUrlSynced
      });
    }
  }

  if (!rowsToFetch.length) {
    Logger.log('No changed website URLs found. AZ matches DA for all rows.');
    return;
  }

  Logger.log('Changed website URL rows found: ' + rowsToFetch.length);

  for (let start = 0; start < rowsToFetch.length; start += FETCH_BATCH_SIZE) {
    const batch = rowsToFetch.slice(start, start + FETCH_BATCH_SIZE);

    const requests = batch.map(function(item) {
      return {
        url: item.websiteUrl,
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      };
    });

    let responses;

    try {
      responses = UrlFetchApp.fetchAll(requests);
    } catch (err) {
      batch.forEach(function(item) {
        const now = new Date();

        sheet.getRange(item.rowNumber, STATUS_COL, 1, 3)
          .setValues([['FETCH BATCH ERROR', now, item.websiteUrl]]);

        Logger.log('Batch fetch failed near row ' + item.rowNumber + ': ' + err);
      });

      Utilities.sleep(SLEEP_BETWEEN_BATCHES_MS);
      continue;
    }

    responses.forEach(function(response, batchIndex) {
      const item = batch[batchIndex];
      const now = new Date();

      try {
        const code = response.getResponseCode();
        const html = response.getContentText();

        if (code >= 400) {
          sheet.getRange(item.rowNumber, STATUS_COL, 1, 3)
            .setValues([['FETCH ERROR ' + code, now, item.websiteUrl]]);

          Logger.log('Row ' + item.rowNumber + ' HTTP error ' + code + ' for ' + item.websiteUrl);
          return;
        }

        const imageUrls = extractBoatImageUrlsFromStructuredData_(html)
          .slice(0, MAX_IMAGES_TO_PULL);

        const rowImages = new Array(IMAGE_COL_COUNT).fill('');

        imageUrls.forEach(function(url, idx) {
          rowImages[idx] = url;
        });

        const urlChanged = item.lastUrlSynced && item.lastUrlSynced !== item.websiteUrl;

        const status = imageUrls.length
          ? (urlChanged ? 'UPDATED - URL CHANGED' : 'UPDATED')
          : 'NO IMAGES FOUND';

        sheet.getRange(item.rowNumber, IMAGE_START_COL, 1, IMAGE_COL_COUNT)
          .setValues([rowImages]);

        sheet.getRange(item.rowNumber, STATUS_COL, 1, 3)
          .setValues([[status, now, item.websiteUrl]]);

        Logger.log(JSON.stringify({
          rowNumber: item.rowNumber,
          websiteUrl: item.websiteUrl,
          responseCode: code,
          imageCount: imageUrls.length,
          status: status
        }));

      } catch (err) {
        sheet.getRange(item.rowNumber, STATUS_COL, 1, 3)
          .setValues([['FETCH ERROR', now, item.websiteUrl]]);

        Logger.log('Row ' + item.rowNumber + ' failed for ' + item.websiteUrl + ': ' + err);
      }
    });

    Utilities.sleep(SLEEP_BETWEEN_BATCHES_MS);
  }

  sheet.getRange(FIRST_DATA_ROW, LAST_SYNC_COL, numRows, 1)
    .setNumberFormat('m/d/yyyy h:mm:ss AM/PM');
}

function createImageSyncChangeTrigger() {
  deleteImageSyncChangeTriggers();

  ScriptApp.newTrigger('handleImageSyncChange')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();
}

function handleImageSyncChange(e) {
  syncBoatListingImageUrlsChangedOnly();
}

function deleteImageSyncChangeTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {
    if (
      trigger.getHandlerFunction() === 'handleImageSyncChange' ||
      trigger.getHandlerFunction() === 'syncBoatListingImageUrlsChangedOnly'
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function createImageSyncEditTrigger() {
  deleteImageSyncEditTriggers();

  ScriptApp.newTrigger('handleImageSyncEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
}

function handleImageSyncEdit(e) {
  const SHEET_NAME = 'UIMT';
  const FIRST_DATA_ROW = 3;
  const WEBSITE_URL_COL = 52; // AZ

  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== SHEET_NAME) return;

  const editedFirstRow = range.getRow();
  const editedLastRow = editedFirstRow + range.getNumRows() - 1;
  const editedFirstCol = range.getColumn();
  const editedLastCol = editedFirstCol + range.getNumColumns() - 1;

  const touchesWebsiteUrlCol =
    editedFirstCol <= WEBSITE_URL_COL && editedLastCol >= WEBSITE_URL_COL;

  if (!touchesWebsiteUrlCol) return;
  if (editedLastRow < FIRST_DATA_ROW) return;

  syncBoatListingImageUrlsChangedOnly();
}

function deleteImageSyncEditTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'handleImageSyncEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}