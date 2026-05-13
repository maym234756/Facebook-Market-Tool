const REGION_MAP = {
  "OMG": "13g1AXFomQ6rLbdfWogEmeIHwjzdjTjA9fuZML0P4Tcw",
  "Texas (North)": "1SA1835QUbsvFzNwQchc-7a0fyPXTlfjJgPGBvff7Z8c",
  "Texas (South)": "1qGXTgfjH3AUPE73nyPJmZTsC-FS5kRAsxnQHbWNFN7c"
};

const HELPER_SHEET_MAP = {
  "OMG": "HelperOMG",
  "Texas (North)": "HelperTXN",
  "Texas (South)": "HelperTXS"
};
const SALESPEOPLE_SHEET_NAME = "Salespeople";
const ANALYTICS_SHEET_NAME = "Analytics";
const FIRST_DATA_ROW = 3;
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5-mini";
const OPENAI_MAX_ATTEMPTS = 2;
const MANAGER_VIEW_CONFIG = {
  region: "OMG",
  sheetName: "Manager View",
  startColumn: 2,
  numCols: 34
};
const LISTING_ROW_START_COLUMN = 2;
const LISTING_ROW_WIDTH = 7;
const EXECUTION_CACHE = {
  spreadsheetsByRegion: {},
  sheetsByKey: {},
  salespersonConfigByRegion: {}
};
const SALESFORCE_EMBED_MODE = "salesforce";
const SALESFORCE_WRITE_MODE = "salesforce-write";
const SALESFORCE_EMBED_SECRET_PROPERTY = "SALESFORCE_EMBED_SECRET";

// Columns on helper sheets
const COL = {
  boatInfo: 37,          // AK
  salePrice: 39,         // AM
  stockNum: 40,          // AN
  websiteDesc: 41,       // AO
  websiteOptions: 42,    // AP
  hours: 43,             // AQ
  primaryClass: 44,      // AR
  secondaryClasses: 45,  // AS
  usedOptions: 47,       // AU
  motorInfo: 48,         // AV
  daysListed: 49,        // AW
  store: 51,             // AY
  status: 46             // AT
};

const NON_SALESPERSON_TABS = [
  "Listing Generator",
  "Analytics",
  "UIMT",
  "Manager View",
  "ManagerView",
  "AI Listings",
  "HelperOMG",
  "HelperTXN",
  "HelperTXS"
];

function doGet(e) {
  const page = normalizePage_((e && e.parameter && e.parameter.page) ? e.parameter.page : "index");

  if (isSalesforceEmbedRequest_(e)) {
    validateSalesforceEmbedRequest_(e, page);
  }

  const templateName =
    page === "listings" ? "Listings" :
    page === "analytics" ? "Analytics" :
    page === "manager" ? "Manager" :
    "Index";

  const template = HtmlService.createTemplateFromFile(templateName);
  template.appUrl = ScriptApp.getService().getUrl();
  const p_ = (e && e.parameter) ? e.parameter : {};
  template.embedParam   = p_.embed   ? String(p_.embed)   : '';
  template.expiresParam = p_.expires ? String(p_.expires) : '';
  template.sigParam     = p_.sig     ? String(p_.sig)     : '';

  const output = template.evaluate().setTitle("PBC/OMG Facebook Listings App");

  if (isSalesforceEmbedRequest_(e)) {
    return allowIframeEmbedding_(output);
  }

  return output;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---------------------------------------------------------------------------
// Salesforce write-back endpoint (doPost)
// ---------------------------------------------------------------------------
// All Salesforce → Sheets calls POST JSON to this endpoint.
// The body must include { action, expires, sig, ...data }.
// Signature payload: "salesforce-write:<action>:<expires>"
// ---------------------------------------------------------------------------

function doPost(e) {
  try {
    const body = parseJsonResponse_(
      e && e.postData && e.postData.contents ? e.postData.contents : "{}",
      "Invalid request body."
    );

    const action  = String(body.action  || "").trim();
    const expires = Number(body.expires || 0);
    const sig     = String(body.sig     || "").trim().toLowerCase();

    if (!action || !expires || !sig) {
      return jsonError_("Missing required fields: action, expires, sig.");
    }

    // Validate token
    if (!isFinite(expires)) {
      return jsonError_("Invalid expires value.");
    }
    if (Date.now() > expires) {
      return jsonError_("Expired token.");
    }

    const secret = getSalesforceEmbedSecret_();
    const expectedSig = createSalesforceWriteSignature_(action, expires, secret);
    if (!constantTimeEquals_(sig, expectedSig)) {
      return jsonError_("Invalid token.");
    }

    // Route action
    if (action === "saveListing") {
      const region = String(body.region || "").trim();
      saveListing(region, body);
      return jsonSuccess_({ saved: true });
    }

    if (action === "generateListing") {
      const region = String(body.region || "").trim();
      const text = generateListing(region, body);
      return jsonSuccess_({ listing: text });
    }

    if (action === "getBoatsByClass") {
      const region    = String(body.region    || "").trim();
      const className = String(body.className || "").trim();
      const boats = getBoatsByClass(region, className);
      return jsonSuccess_({ boats: boats });
    }

    if (action === "getBoatDetails") {
      const region   = String(body.region   || "").trim();
      const stockNum = String(body.stockNum || "").trim();
      const details = getBoatDetails(region, stockNum);
      return jsonSuccess_({ details: details });
    }

    if (action === "getFormData") {
      const region = String(body.region || "").trim();
      const data = {
        regions:     getRegions(),
        salespeople: region ? getSalespeople_(region) : [],
        classes:     region ? getClasses_(region) : []
      };
      return jsonSuccess_(data);
    }

    return jsonError_("Unknown action: " + action);

  } catch (err) {
    return jsonError_(String((err && err.message) ? err.message : err));
  }
}

function createSalesforceWriteSignature_(action, expiresAt, secret) {
  const payload = [SALESFORCE_WRITE_MODE, String(action), String(expiresAt)].join(":");
  const signatureBytes = Utilities.computeHmacSha256Signature(payload, secret);
  return bytesToHex_(signatureBytes);
}

function jsonSuccess_(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError_(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizePage_(page) {
  const normalizedPage = String(page || "").trim().toLowerCase();

  return normalizedPage === "listings" || normalizedPage === "analytics" || normalizedPage === "manager"
    ? normalizedPage
    : "index";
}

function isSalesforceEmbedRequest_(e) {
  const embed = e && e.parameter && e.parameter.embed ? e.parameter.embed : "";
  return String(embed).trim().toLowerCase() === SALESFORCE_EMBED_MODE;
}

function validateSalesforceEmbedRequest_(e, page) {
  const parameters = e && e.parameter ? e.parameter : {};
  const expiresRaw = String(parameters.expires || "").trim();
  const signature = String(parameters.sig || "").trim().toLowerCase();

  if (!expiresRaw || !signature) {
    throw new Error("Missing Salesforce embed token.");
  }

  const expiresAt = Number(expiresRaw);
  if (!isFinite(expiresAt)) {
    throw new Error("Invalid Salesforce embed expiration.");
  }

  if (Date.now() > expiresAt) {
    throw new Error("Expired Salesforce embed token.");
  }

  const expectedSignature = createSalesforceEmbedSignature_(page, expiresAt, getSalesforceEmbedSecret_());
  if (!constantTimeEquals_(signature, expectedSignature)) {
    throw new Error("Invalid Salesforce embed token.");
  }
}

function getSalesforceEmbedSecret_() {
  const properties = PropertiesService.getScriptProperties();
  const secret = properties && typeof properties.getProperty === "function"
    ? properties.getProperty(SALESFORCE_EMBED_SECRET_PROPERTY)
    : "";

  if (!String(secret || "").trim()) {
    throw new Error("Missing SALESFORCE_EMBED_SECRET in Script Properties.");
  }

  return String(secret).trim();
}

function createSalesforceEmbedSignature_(page, expiresAt, secret) {
  const payload = buildSalesforceEmbedPayload_(page, expiresAt);
  const signatureBytes = Utilities.computeHmacSha256Signature(payload, secret);

  return bytesToHex_(signatureBytes);
}

function buildSalesforceEmbedPayload_(page, expiresAt) {
  return [SALESFORCE_EMBED_MODE, normalizePage_(page), String(expiresAt)].join(":");
}

function bytesToHex_(bytes) {
  return (bytes || [])
    .map(function(byte) {
      const normalizedByte = byte < 0 ? byte + 256 : byte;
      return ("0" + normalizedByte.toString(16)).slice(-2);
    })
    .join("");
}

function constantTimeEquals_(left, right) {
  const leftValue = String(left || "");
  const rightValue = String(right || "");

  if (leftValue.length !== rightValue.length) {
    return false;
  }

  let mismatch = 0;

  for (let i = 0; i < leftValue.length; i++) {
    mismatch |= leftValue.charCodeAt(i) ^ rightValue.charCodeAt(i);
  }

  return mismatch === 0;
}

function allowIframeEmbedding_(htmlOutput) {
  if (
    htmlOutput &&
    typeof htmlOutput.setXFrameOptionsMode === "function" &&
    HtmlService &&
    HtmlService.XFrameOptionsMode &&
    HtmlService.XFrameOptionsMode.ALLOWALL
  ) {
    return htmlOutput.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return htmlOutput;
}

function getRegions() {
  return Object.keys(REGION_MAP);
}

function getInitialData(region) {
  return {
    regions: getRegions(),
    salespeople: region ? getSalespeople_(region) : [],
    classes: region ? getClasses_(region) : []
  };
}

function getRegionSalespeople(region) {
  return region ? getSalespeople_(region) : [];
}

function getRegionClasses(region) {
  return region ? getClasses_(region) : [];
}

function getRegionSpreadsheet_(region) {
  if (!region) {
    throw new Error("No region selected.");
  }

  const id = REGION_MAP[region];
  if (!id) {
    throw new Error("Invalid region: " + region);
  }

  if (!EXECUTION_CACHE.spreadsheetsByRegion[region]) {
    EXECUTION_CACHE.spreadsheetsByRegion[region] = SpreadsheetApp.openById(id);
  }

  return EXECUTION_CACHE.spreadsheetsByRegion[region];
}

function getHelperSheetName_(region) {
  const helperName = HELPER_SHEET_MAP[region];
  if (!helperName) {
    throw new Error("No helper sheet configured for region: " + region);
  }
  return helperName;
}

function getHelperSheet_(region) {
  const helperSheetName = getHelperSheetName_(region);
  const sheet = getSheet_(region, helperSheetName);

  if (!sheet) {
    throw new Error("Helper sheet not found for region " + region + ": " + helperSheetName);
  }

  return sheet;
}

function getSalespeople_(region) {
  return getSalespersonConfig_(region).activeSalespeople.slice();
}

function getClasses_(region) {
  const sheet = getDataSheet_(region);
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return [];

  const values = sheet.getRange(
    FIRST_DATA_ROW,
    COL.primaryClass,
    lastRow - FIRST_DATA_ROW + 1,
    2
  ).getValues();

  const set = new Set();

  values.forEach(([primaryClass, secondaryClasses]) => {
    if (primaryClass) {
      set.add(String(primaryClass).trim());
    }

    if (secondaryClasses) {
      String(secondaryClasses)
        .split(";")
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(s => set.add(s));
    }
  });

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function getBoatsByClass(region, className, storeFilter) {
  if (!region) throw new Error("No region selected.");

  const selectedClass = String(className || "").trim();
  const selectedStore = normalizeText_(storeFilter);

  const sheet = getDataSheet_(region);
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return [];

  const startCol = Math.min(
    COL.boatInfo,
    COL.salePrice,
    COL.stockNum,
    COL.hours,
    COL.primaryClass,
    COL.secondaryClasses,
    COL.store
  );

  const endCol = Math.max(
    COL.boatInfo,
    COL.salePrice,
    COL.stockNum,
    COL.hours,
    COL.primaryClass,
    COL.secondaryClasses,
    COL.store
  );

  const values = sheet.getRange(
    FIRST_DATA_ROW,
    startCol,
    lastRow - FIRST_DATA_ROW + 1,
    endCol - startCol + 1
  ).getValues();

  function getCell(row, colNumber) {
    return row[colNumber - startCol];
  }

  return values
    .map(function(row) {
      const boatInfo = getCell(row, COL.boatInfo);
      const salePrice = getCell(row, COL.salePrice);
      const stockNum = getCell(row, COL.stockNum);
      const hours = getCell(row, COL.hours);
      const primaryClass = getCell(row, COL.primaryClass);
      const secondaryClasses = getCell(row, COL.secondaryClasses);
      const boatStore = getCell(row, COL.store);

      if (!boatInfo || !stockNum) return null;

      if (selectedStore && normalizeText_(boatStore) !== selectedStore) {
        return null;
      }

      const matchesPrimary =
        String(primaryClass || "").trim() === selectedClass;

      const matchesSecondary =
        String(secondaryClasses || "")
          .split(";")
          .map(function(s) { return s.trim(); })
          .includes(selectedClass);

      if (selectedClass && !matchesPrimary && !matchesSecondary) {
        return null;
      }

      return {
        boatInfo: String(boatInfo),
        stockNum: String(stockNum || ""),
        salePrice: formatPrice_(salePrice),
        hours: hours === "" || hours == null ? "" : String(hours),
        store: String(boatStore || "")
      };
    })
    .filter(Boolean)
    .sort(function(a, b) {
      return a.boatInfo.localeCompare(b.boatInfo);
    });
}

function getBoatDetails(region, stockNum) {
  if (!region) throw new Error("No region selected.");
  if (!stockNum) return null;

  const sheet = getDataSheet_(region);
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return null;

  const stockValues = sheet.getRange(
    FIRST_DATA_ROW,
    COL.stockNum,
    lastRow - FIRST_DATA_ROW + 1,
    1
  ).getValues();
  const normalizedStockNum = String(stockNum || "").trim();
  let matchOffset = -1;

  for (let i = 0; i < stockValues.length; i++) {
    if (String(stockValues[i][0] || "").trim() === normalizedStockNum) {
      matchOffset = i;
      break;
    }
  }

  if (matchOffset === -1) {
    return null;
  }

  const width = COL.daysListed - COL.boatInfo + 1;

const startCol = Math.min(
  COL.boatInfo,
  COL.salePrice,
  COL.stockNum,
  COL.websiteDesc,
  COL.websiteOptions,
  COL.hours,
  COL.primaryClass,
  COL.usedOptions,
  COL.motorInfo,
  COL.daysListed,
  COL.store
);

const endCol = Math.max(
  COL.boatInfo,
  COL.salePrice,
  COL.stockNum,
  COL.websiteDesc,
  COL.websiteOptions,
  COL.hours,
  COL.primaryClass,
  COL.usedOptions,
  COL.motorInfo,
  COL.daysListed,
  COL.store
);

const row = sheet.getRange(
  FIRST_DATA_ROW + matchOffset,
  startCol,
  1,
  endCol - startCol + 1
).getValues()[0];

function getCell(colNumber) {
  return row[colNumber - startCol];
}

const boatInfo = getCell(COL.boatInfo);
const salePrice = getCell(COL.salePrice);
const currentStock = getCell(COL.stockNum);
const websiteDesc = getCell(COL.websiteDesc);
const websiteOptions = getCell(COL.websiteOptions);
const hours = getCell(COL.hours);
const primaryClass = getCell(COL.primaryClass);
const usedOptions = getCell(COL.usedOptions);
const motorInfo = getCell(COL.motorInfo);
const daysListed = getCell(COL.daysListed);
const store = getCell(COL.store);

  const IMAGE_START_COL = 53; // BA
  const IMAGE_COL_COUNT = 66; // BA:DN

  const imageValues = sheet.getRange(
    FIRST_DATA_ROW + matchOffset,
    IMAGE_START_COL,
    1,
    IMAGE_COL_COUNT
  ).getValues()[0];

  const images = imageValues
    .map(function(url) { return String(url || '').trim(); })
    .filter(function(url) { return url !== ''; });

  return {
    classification: String(primaryClass || ""),
    boatInfo: String(boatInfo || ""),
    store: String(store || ""),
    daysListed: String(daysListed || ""),
    stockNum: String(currentStock || ""),
    price: formatPrice_(salePrice),
    hours: hours === "" || hours == null ? "" : String(hours),
    motorInfo: String(motorInfo || ""),
    options: String(usedOptions || ""),
    websiteDesc: String(websiteDesc || ""),
    websiteOptions: String(websiteOptions || ""),
    images: images
  };
}

function generateListing(region, payload) {
  if (!region) throw new Error("No region selected.");

  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in Script Properties");
  }

  const salespersonName = String(payload.salespersonName || "").trim();
  const classification = String(payload.classification || "").trim();
  const boatInfo = String(payload.boatInfo || "").trim();
  const stockNum = String(payload.stockNum || "").trim();
  const price = String(payload.price || "").trim();
  const hours = String(payload.hours || "").trim();
  const motorInfo = String(payload.motorInfo || "").trim();
  const options = String(payload.options || "").trim();
  const websiteDesc = String(payload.websiteDesc || "").trim();
  const websiteOptions = String(payload.websiteOptions || "").trim();

  if (!boatInfo) return "";

let regionContext = "";
let companyName = "";

if (region === "OMG") {
  companyName = "Ocean Marine Group";
  regionContext = `
You are a top-performing used boat salesperson for Ocean Marine Group in Mississippi and Alabama along the Gulf Coast writing a Facebook Marketplace listing designed to generate messages quickly.

Market Context:
- The buyer is likely boating along the Gulf Coast in Mississippi and Alabama
- Common use cases include coastal cruising, island hopping, sandbar days, inshore fishing, family boating, and nearshore recreation
- The tone and examples should fit the Gulf Coast lifestyle
`;
} else if (region === "Texas (North)") {
  companyName = "Premier Boating Centers";
  regionContext = `
You are a top-performing used boat salesperson for Premier Boating Centers in Texas writing a Facebook Marketplace listing designed to generate messages quickly.

Market Context:
- The buyer is likely using their boat on lakes such as Lake Conroe, Lake Livingston, Lake Houston, Clear Lake, Sam Rayburn Reservoir, and Toledo Bend Reservoir
- The buyer may also use their boat on inland coastal waters such as Galveston Bay, West Bay, and Trinity Bay
- Focus on use cases such as lake days, cruising, family time, watersports, fishing, entertaining, and versatile upper-coast boating
- The tone and examples should fit boating life in North / Upper Coastal Texas
`;
} else if (region === "Texas (South)") {
  companyName = "Premier Boating Centers";
  regionContext = `
You are a top-performing used boat salesperson for Premier Boating Centers in Texas writing a Facebook Marketplace listing designed to generate messages quickly.

Market Context:
- The buyer is likely using their boat in shallow inland coastal waters such as Corpus Christi Bay, Matagorda Bay, Copano Bay, Aransas Bay, San Antonio Bay, Espiritu Santo Bay, Baffin Bay, and Laguna Madre
- The buyer may also use their boat on lakes such as Lake Corpus Christi, Choke Canyon Reservoir, Canyon Lake, Medina Lake, and Calaveras Lake
- Focus on use cases such as shallow-water fishing, bay running, family cruising, sandbar time, versatile coastal use, and South Texas lake recreation
- The tone and examples should fit boating life in South Texas, especially shallow bay and inland-water use
`;
} else {
  companyName = "Premier Boating Centers";
  regionContext = `
You are a top-performing used boat salesperson for ${companyName} writing a Facebook Marketplace listing designed to generate messages quickly.
`;
}

const prompt = `
${regionContext}

Your goal is to create a high-converting Marketplace post that feels human, trustworthy, energetic, and easy to skim on a phone.

BOAT DATA
Company Name: ${companyName}
Region: ${region || ""}
Salesperson Name: ${salespersonName || ""}
Classification: ${classification || ""}
Boat Info: ${boatInfo || ""}
Stock Number: ${stockNum || ""}
Price: ${price || ""}
Hours: ${hours || ""}
Motor Info: ${motorInfo || ""}
Boat Options: ${options || ""}
Current Website Description: ${websiteDesc || ""}
Current Website Options: ${websiteOptions || ""}

PRIMARY OBJECTIVE
Make someone scrolling Facebook Marketplace stop, read, and message.

TARGET STYLE
- Sound like a real salesperson, not a manufacturer brochure
- Confident, upbeat, local, and natural
- Slightly playful is okay, but still credible
- Mobile-friendly and highly skimmable
- Use short sections and line breaks
- Use emojis sparingly but effectively, such as 🔥 ⚡ 💥 ✔️ 👀 💰 ⏱️ 📌

FACEBOOK MARKETPLACE BEST PRACTICES TO FOLLOW
- Lead with the most attractive real selling points first
- The benefits of the boat and how the owner would use it are key. Paint a picture of how great owning this boat will be for them.
- Include price when available
- Include hours when available
- Include stock number when available
- Highlight the real equipment buyers care about most
- Focus on what the boat is great for, not just what it has
- Make the description easy to scan quickly on a phone
- Keep it concise and punchy
- Use the website description and website options as source material, but rewrite them for Facebook Marketplace so they feel less corporate and more conversational
- Tailor the imagined usage scenarios to the selected region and its boating lifestyle
- Only reference use cases and water types that fit both the region and the actual boat type

REQUIRED STRUCTURE
1. Opening hook
   - 1 to 2 short lines
   - Attention-grabbing
   - Opportunity-driven or lifestyle-driven
   - May reference salesperson name naturally if it helps
   - Do not include the last initial of the salesperson's name

2. Excitement / availability line
   - Example idea: ready for the water, ready for the weekend
   - Do not sound fake or overhyped

3. Quick value setup
   - 1 to 3 short lines explaining what kind of buyer this boat fits
   - Examples of use cases: sandbar days, family cruising, fishing, watersports, lake days, coastal exploring, shallow-water fishing, bay running
   - Only include use cases that fit the actual boat type
   - Match the use case language to the selected region

4. Package Includes section
   - Use a heading like: ⚡ Package Includes:
   - Include the most important real features from motor info, options, and website options
   - Prefer short bullet-style lines
   - Prioritize trailer, electronics, towers, trolling motors, anchors, joystick, radar, audio, power options, fishing features, ballast, surf systems, etc. when present

5. Quick Look section
   - Use a heading like: ⚡ Quick Look:
   - Include only fields that exist:
     - Price
     - Hours
     - Stock #
   - Format cleanly for mobile readability

6. Why this boat stands out
   - 2 to 4 short lines
   - Translate specs into value
   - Emphasize versatility, readiness, condition signals only if actually provided, and reasons this is a smart buy

7. Call to action
   - Direct and simple
   - Encourage message, call, text, or come see it
   - Use salesperson first name if helpful
   - Do not use the salesperson's last initial

8. Light urgency close
   - End with mild urgency
   - Keep it believable and natural
   - Never sound pushy or cheesy

STRICT RULES
- Use only the information provided
- Never invent features, condition, ownership history, financing terms, trailer inclusion, service history, location, or warranty unless explicitly provided
- Never invent engine hours, horsepower, electronics, or options
- If something is missing, skip it
- Do not copy the website description verbatim
- Do not sound like a spec sheet
- Do not write giant paragraphs
- Avoid empty clichés like won’t last long unless rewritten naturally
- Avoid all caps except for very short emphasis like JUST LISTED if it fits naturally
- Do not use quotation marks around the post
- Output plain text only
- Ideal length: 120 to 220 words
- Do not use the initial of the salesperson's last name
- Do not mention bodies of water that are outside the selected region
- Do not force a lake, bay, coastal, shallow-water, or offshore use case if it does not fit the actual boat

FINAL QUALITY BAR
The result should feel like a strong real-world Facebook Marketplace boat post from a sharp salesperson who knows how to get attention and drive inquiries fast in the selected region.
`;

  return requestGeneratedListing_(apiKey, prompt);
}

function saveListing(region, payload) {
  if (!region) throw new Error("No region selected.");

  const salespersonName = String(payload.salespersonName || "").trim();

  if (!salespersonName) {
    throw new Error("Missing salesperson name.");
  }

  return withSheetWriteLock_(function() {
    const sheet = getSalespersonListingSheet_(region, salespersonName);
    const targetRow = findFirstEmptyListingRow_(sheet);

    writeListingRow_(sheet, targetRow, {
      stockNum: payload.stockNum || "",
      price: payload.price || "",
      colE: payload.bmbBoard || "",
      colF: payload.video || "",
      description: payload.aiListing || "",
      colH: payload.link || ""
    });

    return true;
  });
}

function getSalespersonListings(region, salespersonName) {
  if (!region) throw new Error("No region selected.");

  const sheet = getSalespersonListingSheet_(region, salespersonName);

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return {
      values: [],
      backgrounds: [],
      columnWidths: [],
      rowNumbers: [],
      headers: {}
    };
  }

  const numCols = 15; // A:O
  const range = sheet.getRange(1, 1, lastRow, numCols);
  const values = range.getDisplayValues();

  return {
    values: values,
    backgrounds: range.getBackgrounds(),
    columnWidths: Array.from({ length: numCols }, (_, i) => sheet.getColumnWidth(i + 1)),
    rowNumbers: Array.from({ length: lastRow }, (_, i) => i + 1),
    headers: {
      B: values[0] && values[0][1] ? values[0][1] : "Column B",
      D: values[0] && values[0][3] ? values[0][3] : "Column D",
      E: values[0] && values[0][4] ? values[0][4] : "Column E",
      F: values[0] && values[0][5] ? values[0][5] : "Column F",
      G: values[0] && values[0][6] ? values[0][6] : "Column G",
      H: values[0] && values[0][7] ? values[0][7] : "Column H"
    }
  };
}

function getStores(region) {
  if (!region) throw new Error("No region selected.");

  const sheet = getDataSheet_(region);
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return [];

  const values = sheet.getRange(
    FIRST_DATA_ROW,
    COL.store,
    lastRow - FIRST_DATA_ROW + 1,
    1
  ).getValues();

  const set = new Set();

  values.forEach(function(row) {
    const store = String(row[0] || "").trim();

    if (
      store &&
      store.toLowerCase() !== "undefined" &&
      store.toLowerCase() !== "null"
    ) {
      set.add(store);
    }
  });

  return Array.from(set).sort(function(a, b) {
    return a.localeCompare(b);
  });
}

function clearSalespersonListing(region, salespersonName, rowNumber) {
  if (!region) throw new Error("No region selected.");

  if (!rowNumber || rowNumber < 2) {
    throw new Error("Invalid row number.");
  }

  return withSheetWriteLock_(function() {
    const sheet = getSalespersonListingSheet_(region, salespersonName);

    writeListingRow_(sheet, rowNumber, {
      stockNum: "",
      price: "",
      colE: "",
      colF: "",
      description: "",
      colH: ""
    });

    return true;
  });
}

function updateSalespersonListing(region, salespersonName, rowNumber, updatedValues) {
  if (!region) throw new Error("No region selected.");

  if (!rowNumber || rowNumber < 2) {
    throw new Error("Invalid row number.");
  }

  return withSheetWriteLock_(function() {
    const sheet = getSalespersonListingSheet_(region, salespersonName);

    writeListingRow_(sheet, rowNumber, {
      stockNum: updatedValues.stockNum || "",
      price: updatedValues.price || "",
      colE: updatedValues.colE || "",
      colF: updatedValues.colF || "",
      description: updatedValues.description || "",
      colH: updatedValues.colH || ""
    });

    return true;
  });
}

function getAnalyticsData(region, viewName) {
  if (!region) throw new Error("No region selected.");

  const sheet = getSheet_(region, ANALYTICS_SHEET_NAME);

  if (!sheet) {
    throw new Error("Analytics sheet not found.");
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return {
      values: [],
      backgrounds: [],
      columnWidths: [],
      startColumn: 0
    };
  }

  const isRegionalView =
    viewName === "Regional Used Units" || viewName === "Region Used Units";

  // New layout:
  // All Used Units     => B:P
  // Regional Used Units => R:AF
  const startColumn = isRegionalView ? 18 : 2; // R or B
  const numCols = 15; // B:P and R:AF are both 15 columns wide

  const range = sheet.getRange(1, startColumn, lastRow, numCols);
  const values = range.getDisplayValues();
  const backgrounds = range.getBackgrounds();

  const columnWidths = [];
  for (let c = 0; c < numCols; c++) {
    columnWidths.push(sheet.getColumnWidth(startColumn + c));
  }

  const filteredValues = [];
  const filteredBackgrounds = [];

  for (let r = 0; r < values.length; r++) {
    const sheetRowNumber = r + 1;
    const firstCellInSelectedRange = String(values[r][0] || "").trim();

    // Always keep rows 1 and 2
    if (sheetRowNumber === 1 || sheetRowNumber === 2) {
      filteredValues.push(values[r]);
      filteredBackgrounds.push(backgrounds[r]);
      continue;
    }

    // Then only keep rows where the first column in the selected range is not blank:
    // All Used Units => column B
    // Regional Used Units => column R
    if (firstCellInSelectedRange !== "") {
      filteredValues.push(values[r]);
      filteredBackgrounds.push(backgrounds[r]);
    }
  }

  return {
    values: filteredValues,
    backgrounds: filteredBackgrounds,
    columnWidths: columnWidths,
    startColumn: startColumn
  };
}

function formatPrice_(value) {
  if (value === "" || value == null || isNaN(value)) return String(value || "");
  return "$" + Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function requestGeneratedListing_(apiKey, prompt) {
  let lastError = null;

  for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt++) {
    const response = UrlFetchApp.fetch(OPENAI_API_URL, {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + apiKey
      },
      payload: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt
      }),
      muteHttpExceptions: true
    });

    const statusCode = typeof response.getResponseCode === "function"
      ? response.getResponseCode()
      : 200;
    const responseText = response.getContentText();

    try {
      return parseGeneratedListingResponse_(statusCode, responseText);
    } catch (error) {
      lastError = error;
      if (!shouldRetryOpenAiRequest_(statusCode, attempt)) {
        break;
      }
    }
  }

  throw lastError || new Error("OpenAI request failed.");
}

function parseGeneratedListingResponse_(statusCode, responseText) {
  const json = parseJsonResponse_(responseText, "OpenAI API response was not valid JSON.");

  if (statusCode >= 400) {
    const apiMessage = json && json.error && json.error.message
      ? json.error.message
      : "OpenAI request failed with status " + statusCode + ".";
    throw new Error(apiMessage);
  }

  if (json.error) {
    throw new Error(json.error.message || "OpenAI returned an error.");
  }

  if (json.output_text && json.output_text.trim()) {
    return json.output_text.trim();
  }

  const fallback = extractGeneratedText_(json);
  if (fallback) {
    return fallback;
  }

  throw new Error("OpenAI response did not include generated listing text.");
}

function parseJsonResponse_(text, fallbackMessage) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse OpenAI response", {
      responsePreview: String(text || "").slice(0, 500)
    });
    throw new Error(fallbackMessage);
  }
}

function extractGeneratedText_(json) {
  const primary = json.output?.[0]?.content?.[0]?.text;
  if (primary && String(primary).trim()) {
    return String(primary).trim();
  }

  const merged = (json.output || [])
    .map(function(item) {
      return (item.content || [])
        .map(function(contentItem) {
          return contentItem.text || "";
        })
        .join(" ");
    })
    .join(" ")
    .trim();

  return merged || "";
}

function shouldRetryOpenAiRequest_(statusCode, attempt) {
  return attempt < OPENAI_MAX_ATTEMPTS && (statusCode === 429 || statusCode >= 500);
}

function withSheetWriteLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function getSalespersonListingSheet_(region, salespersonName) {
  const ss = getRegionSpreadsheet_(region);
  const tabName = getSalespersonTabName_(region, salespersonName);
  const sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    throw new Error("Sheet not found: " + tabName);
  }

  return sheet;
}

function findFirstEmptyListingRow_(sheet) {
  const startRow = 2;
  const lastRow = Math.max(sheet.getLastRow(), startRow);
  const numRows = lastRow - startRow + 1;
  const colBValues = sheet.getRange(startRow, 2, numRows, 1).getValues();

  for (let i = 0; i < colBValues.length; i++) {
    if (!String(colBValues[i][0] || "").trim()) {
      return startRow + i;
    }
  }

  return lastRow + 1;
}

function writeListingRow_(sheet, rowNumber, values) {
  // Write each column individually to avoid overwriting formula columns (e.g. col C).
  sheet.getRange(rowNumber, 2).setValue(values.stockNum || "");  // B: Stock #
  sheet.getRange(rowNumber, 4).setValue(values.price || "");     // D: Price
  sheet.getRange(rowNumber, 5).setValue(values.colE || "");      // E: BMB Board
  sheet.getRange(rowNumber, 6).setValue(values.colF || "");      // F: Video
  sheet.getRange(rowNumber, 7).setValue(values.description || ""); // G: Description
  sheet.getRange(rowNumber, 8).setValue(values.colH || "");      // H: Link
}

function getDataSheet_(region) {
  const sheet = getSheet_(region, "UIMT");

  if (!sheet) {
    throw new Error("UIMT sheet not found for region: " + region);
  }

  return sheet;
}
function getSalespeopleSheet_(region) {
  const sheet = getSheet_(region, SALESPEOPLE_SHEET_NAME);

  if (!sheet) {
    throw new Error('Salespeople sheet not found for region: ' + region);
  }

  return sheet;
}

function getSalespersonTabName_(region, salespersonName) {
  const config = getSalespersonConfig_(region);

  if (!config.hasRows) {
    throw new Error('No salespeople configured for region: ' + region);
  }

  const entry = config.byDisplayName[String(salespersonName || '').trim()];
  if (!entry) {
    throw new Error('Salesperson not found in config: ' + salespersonName);
  }

  if (!entry.isActive) {
    throw new Error('Salesperson is inactive: ' + salespersonName);
  }

  if (!entry.tabName) {
    throw new Error('Missing tab name for salesperson: ' + salespersonName);
  }

  return entry.tabName;
}

function getManagerViewData() {
  const sheet = getSheet_(MANAGER_VIEW_CONFIG.region, MANAGER_VIEW_CONFIG.sheetName);

  if (!sheet) {
    throw new Error("Manager View sheet not found.");
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return {
      values: [],
      backgrounds: [],
      columnWidths: [],
      startColumn: 0
    };
  }

  // B:AI
  const startColumn = MANAGER_VIEW_CONFIG.startColumn;
  const numCols = MANAGER_VIEW_CONFIG.numCols;

  const range = sheet.getRange(1, startColumn, lastRow, numCols);
  const values = range.getDisplayValues();
  const backgrounds = range.getBackgrounds();

  const columnWidths = [];
  for (let c = 0; c < numCols; c++) {
    columnWidths.push(sheet.getColumnWidth(startColumn + c));
  }

  const filteredValues = [];
  const filteredBackgrounds = [];

  for (let r = 0; r < values.length; r++) {
    const sheetRowNumber = r + 1;
    const colBValue = String(values[r][0] || "").trim();

    // Always keep rows 1 and 2
    if (sheetRowNumber === 1 || sheetRowNumber === 2) {
      filteredValues.push(values[r]);
      filteredBackgrounds.push(backgrounds[r]);
      continue;
    }

    // Then keep rows where Column B is not blank
    if (colBValue !== "") {
      filteredValues.push(values[r]);
      filteredBackgrounds.push(backgrounds[r]);
    }
  }

  return {
    values: filteredValues,
    backgrounds: filteredBackgrounds,
    columnWidths: columnWidths,
    startColumn: startColumn
  };
}

function getSheet_(region, sheetName) {
  const cacheKey = region + "::" + sheetName;

  if (!(cacheKey in EXECUTION_CACHE.sheetsByKey)) {
    const ss = getRegionSpreadsheet_(region);
    EXECUTION_CACHE.sheetsByKey[cacheKey] = ss.getSheetByName(sheetName) || null;
  }

  return EXECUTION_CACHE.sheetsByKey[cacheKey];
}

function getPhotoDownloadPayload(photoUrls) {
  const urls = Array.isArray(photoUrls) ? photoUrls : [];
  const results = [];

  urls.forEach(function(url, index) {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) return;

    try {
      const response = UrlFetchApp.fetch(cleanUrl, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const code = response.getResponseCode();
      if (code < 200 || code >= 300) {
        throw new Error('HTTP ' + code);
      }

      const blob = response.getBlob();
      const contentType = blob.getContentType() || 'application/octet-stream';
      const bytes = blob.getBytes();
      const base64 = Utilities.base64Encode(bytes);

      results.push({
        url: cleanUrl,
        fileName: getPhotoFileName_(cleanUrl, index, contentType),
        contentType: contentType,
        base64: base64
      });
    } catch (err) {
      results.push({
        url: cleanUrl,
        error: String((err && err.message) ? err.message : err)
      });
    }
  });

  return results;
}

function getPhotoFileName_(url, index, contentType) {
  try {
    const withoutQuery = String(url || '').split('?')[0];
    const parts = withoutQuery.split('/');
    let fileName = parts[parts.length - 1] || '';

    if (!fileName) {
      return 'photo-' + (index + 1) + guessExtensionFromMime_(contentType);
    }

    if (fileName.indexOf('.') === -1) {
      fileName += guessExtensionFromMime_(contentType);
    }

    return fileName;
  } catch (e) {
    return 'photo-' + (index + 1) + guessExtensionFromMime_(contentType);
  }
}

function guessExtensionFromMime_(contentType) {
  const type = String(contentType || '').toLowerCase();

  if (type.indexOf('jpeg') !== -1 || type.indexOf('jpg') !== -1) return '.jpg';
  if (type.indexOf('png') !== -1) return '.png';
  if (type.indexOf('webp') !== -1) return '.webp';
  if (type.indexOf('gif') !== -1) return '.gif';

  return '.bin';
}

function getSalespersonConfig_(region) {
  if (!EXECUTION_CACHE.salespersonConfigByRegion[region]) {
    const sheet = getSalespeopleSheet_(region);
    const lastRow = sheet.getLastRow();

    // Salespeople sheet structure:
    // A = Salesperson Name
    // B = Tab Name
    // C = Active
    // D = Phone Number
    // E = Store
    // F = Default CTA
    // G = Region
    const values = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 7).getValues();

    const byDisplayName = {};
    const activeSalespeople = [];

    for (let i = 0; i < values.length; i++) {
      const displayName = String(values[i][0] || '').trim(); // Column A
      const tabName = String(values[i][1] || '').trim();     // Column B
      const isActive = String(values[i][2] || '').trim().toUpperCase() === 'Y'; // Column C
      const phone = String(values[i][3] || '').trim();       // Column D
      const store = String(values[i][4] || '').trim();       // Column E
      const defaultCta = String(values[i][5] || '').trim();  // Column F
      const salespersonRegion = String(values[i][6] || '').trim(); // Column G

      if (!displayName) {
        continue;
      }

      byDisplayName[displayName] = {
        isActive: isActive,
        tabName: tabName,
        phone: phone,
        store: store,
        defaultCta: defaultCta,
        region: salespersonRegion
      };

      if (
        isActive &&
        salespersonRegion.toLowerCase() === String(region || '').trim().toLowerCase()
      ) {
        activeSalespeople.push(displayName);
      }
    }

    activeSalespeople.sort(function(a, b) {
      return a.localeCompare(b);
    });

    EXECUTION_CACHE.salespersonConfigByRegion[region] = {
      hasRows: values.length > 0,
      byDisplayName: byDisplayName,
      activeSalespeople: activeSalespeople
    };
  }

  return EXECUTION_CACHE.salespersonConfigByRegion[region];
}
function SHEET_NAME() {
  return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getName();
}

function getEligibleBoats(region, salespersonName, className, storeFilter) {
  if (!region) throw new Error("No region selected.");
  if (!salespersonName) throw new Error("No salesperson selected.");

  const selectedClass = String(className || "").trim();
  const selectedStore = normalizeText_(storeFilter);

  const salespersonConfig = getSalespersonConfig_(region);
  const salesperson = salespersonConfig.byDisplayName[String(salespersonName || "").trim()];

  if (!salesperson) {
    throw new Error("Salesperson not found: " + salespersonName);
  }

  const salespersonStores = String(salesperson.store || "")
    .split(";")
    .map(function(store) {
      return normalizeText_(store);
    })
    .filter(Boolean);

  const sheet = getDataSheet_(region);
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return [];

  const startCol = Math.min(
    COL.boatInfo,
    COL.salePrice,
    COL.stockNum,
    COL.hours,
    COL.primaryClass,
    COL.secondaryClasses,
    COL.daysListed,
    COL.store,
    COL.status
  );

  const endCol = Math.max(
    COL.boatInfo,
    COL.salePrice,
    COL.stockNum,
    COL.hours,
    COL.primaryClass,
    COL.secondaryClasses,
    COL.daysListed,
    COL.store,
    COL.status
  );

  const values = sheet.getRange(
    FIRST_DATA_ROW,
    startCol,
    lastRow - FIRST_DATA_ROW + 1,
    endCol - startCol + 1
  ).getValues();

  function getCell(row, colNumber) {
    return row[colNumber - startCol];
  }

  return values
    .map(function(row) {
      const boatInfo = getCell(row, COL.boatInfo);
      const salePrice = getCell(row, COL.salePrice);
      const stockNum = getCell(row, COL.stockNum);
      const hours = getCell(row, COL.hours);
      const primaryClass = getCell(row, COL.primaryClass);
      const secondaryClasses = getCell(row, COL.secondaryClasses);
      const daysListed = getCell(row, COL.daysListed);
      const boatStore = getCell(row, COL.store);
      const status = getCell(row, COL.status);

      if (!boatInfo || !stockNum) return null;

      if (selectedStore && normalizeText_(boatStore) !== selectedStore) {
        return null;
      }

      const matchesPrimary =
        String(primaryClass || "").trim() === selectedClass;

      const matchesSecondary =
        String(secondaryClasses || "")
          .split(";")
          .map(function(s) { return s.trim(); })
          .includes(selectedClass);

      if (selectedClass && !matchesPrimary && !matchesSecondary) {
        return null;
      }

      const normalizedBoatStore = normalizeText_(boatStore);
      const sameStore = salespersonStores.indexOf(normalizedBoatStore) !== -1;

      const normalizedStatus = normalizeText_(status);
      const isInContract = normalizedStatus === "in contract";

      const isCON = String(stockNum || "")
        .toUpperCase()
        .indexOf("CON") !== -1;

      const isUnder30 = Number(daysListed || 0) < 30;

      const eligible =
        !isInContract &&
        (sameStore || !isCON) &&
        (sameStore || !isUnder30);

      if (!eligible) return null;

      return {
        boatInfo: String(boatInfo),
        stockNum: String(stockNum || ""),
        salePrice: formatPrice_(salePrice),
        hours: hours === "" || hours == null ? "" : String(hours),
        store: String(boatStore || "")
      };
    })
    .filter(Boolean)
    .sort(function(a, b) {
      return a.boatInfo.localeCompare(b.boatInfo);
    });
}

function normalizeText_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/*
Professional summary:
This file is the primary server-side controller for the Facebook Listings Apps Script web app.
It routes page requests, reads configuration and operational data from Google Sheets, prepares boat
and salesperson records for the UI, generates AI-assisted Facebook Marketplace listing copy, and
persists listing activity back into salesperson and analytics-facing tabs.

Operational role:
- Serves the correct HTML interface for the Listing Generator, Listings, Analytics, and Manager pages
- Resolves region-specific spreadsheet targets and helper-sheet dependencies
- Reads salesperson, class, boat, analytics, and manager-view data from Google Sheets
- Generates listing copy through the OpenAI Responses API using region-aware prompt construction
- Saves, updates, and clears salesperson listing records in their assigned tabs

Business purpose:
This is the orchestration layer that turns spreadsheet-based dealership inventory data into a usable
internal web application for generating, managing, and reviewing Marketplace listings across OMG and
Premier Boating Centers regions.
*/