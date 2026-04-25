function syncBoatListingImageUrlsBatch() {
  const SHEET_NAME = 'UIMT';
  const FIRST_DATA_ROW = 3;

  const WEBSITE_URL_COL = 52;   // AZ
  const IMAGE_START_COL = 53;   // BA
  const IMAGE_COL_COUNT = 66;   // BA:CN
  const STATUS_COL = 119;       // CO
  const LAST_SYNC_COL = 120;    // CP

  const MAX_ROWS_PER_RUN = 110;
  const SLEEP_MS = 200;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);

  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return;

  const numRows = lastRow - FIRST_DATA_ROW + 1;

  const data = sheet.getRange(
    FIRST_DATA_ROW,
    WEBSITE_URL_COL,
    numRows,
    LAST_SYNC_COL - WEBSITE_URL_COL + 1
  ).getValues();

  const WEBSITE_IDX = 0; // AZ relative to fetched range
  const STATUS_IDX = STATUS_COL - WEBSITE_URL_COL; // CO relative

  let processed = 0;

  for (let i = 0; i < data.length; i++) {
    if (processed >= MAX_ROWS_PER_RUN) break;

    const rowNumber = FIRST_DATA_ROW + i;
    const websiteUrl = String(data[i][WEBSITE_IDX] || '').trim();
    const status = String(data[i][STATUS_IDX] || '').trim();

    if (!websiteUrl) continue;
    if (status === 'DONE') continue;

    try {
      const response = UrlFetchApp.fetch(websiteUrl, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const code = response.getResponseCode();
      const html = response.getContentText();

      if (code >= 400) {
        writeImageSyncResult_(sheet, rowNumber, IMAGE_START_COL, IMAGE_COL_COUNT, [], 'FETCH ERROR ' + code, STATUS_COL, LAST_SYNC_COL);
        Logger.log('Row ' + rowNumber + ' page fetch error ' + code + ' for ' + websiteUrl);
        processed++;
        Utilities.sleep(SLEEP_MS);
        continue;
      }

      const imageUrls = extractBoatImageUrlsFromStructuredData_(html).slice(0, IMAGE_COL_COUNT);

      writeImageSyncResult_(
        sheet,
        rowNumber,
        IMAGE_START_COL,
        IMAGE_COL_COUNT,
        imageUrls,
        imageUrls.length ? 'DONE' : 'NO IMAGES FOUND',
        STATUS_COL,
        LAST_SYNC_COL
      );

      Logger.log(JSON.stringify({
        rowNumber: rowNumber,
        websiteUrl: websiteUrl,
        responseCode: code,
        htmlLength: html.length,
        imageCount: imageUrls.length,
        firstImage: imageUrls[0] || ''
      }));

      processed++;
      Utilities.sleep(SLEEP_MS);

    } catch (err) {
      writeImageSyncResult_(sheet, rowNumber, IMAGE_START_COL, IMAGE_COL_COUNT, [], 'FETCH ERROR', STATUS_COL, LAST_SYNC_COL);
      Logger.log('Row ' + rowNumber + ' failed for ' + websiteUrl + ': ' + err);
      processed++;
      Utilities.sleep(SLEEP_MS);
    }
  }
}


function extractBoatImageUrlsFromStructuredData_(html) {
  const results = [];
  const seen = new Set();

  const regex = /"url":"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    let url = String(match[1] || '').replace(/\\\//g, '/').trim();
    const lower = url.toLowerCase();

    if (
      lower.includes('not-local-premier') ||
      lower.includes('sell-your-boat-premier') ||
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


function writeImageSyncResult_(sheet, rowNumber, imageStartCol, imageColCount, imageUrls, status, statusCol, lastSyncCol) {
  const outputRow = new Array(imageColCount).fill('');
  imageUrls.slice(0, imageColCount).forEach(function(url, idx) {
    outputRow[idx] = url;
  });

  sheet.getRange(rowNumber, imageStartCol, 1, imageColCount).setValues([outputRow]);
  sheet.getRange(rowNumber, statusCol).setValue(status);
  sheet.getRange(rowNumber, lastSyncCol).setValue(new Date());
}


function createImageSyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncBoatListingImageUrlsBatch') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('syncBoatListingImageUrlsBatch')
    .timeBased()
    .everyHours(1)
    .create();
}


function clearImageSyncStatuses() {
  const SHEET_NAME = 'UIMT';
  const FIRST_DATA_ROW = 3;
  const STATUS_COL = 119;     // CO
  const LAST_SYNC_COL = 120;  // CP

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);

  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return;

  const numRows = lastRow - FIRST_DATA_ROW + 1;
  sheet.getRange(FIRST_DATA_ROW, STATUS_COL, numRows, 2).clearContent();
}


function clearImageUrlsAndStatuses() {
  const SHEET_NAME = 'UIMT';
  const FIRST_DATA_ROW = 3;
  const IMAGE_START_COL = 53; // BA
  const IMAGE_COL_COUNT = 66; // BA:CN
  const STATUS_COL = 119;     // CO
  const LAST_SYNC_COL = 120;  // CP

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);

  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return;

  const numRows = lastRow - FIRST_DATA_ROW + 1;
  sheet.getRange(FIRST_DATA_ROW, IMAGE_START_COL, numRows, IMAGE_COL_COUNT).clearContent();
  sheet.getRange(FIRST_DATA_ROW, STATUS_COL, numRows, 2).clearContent();
}