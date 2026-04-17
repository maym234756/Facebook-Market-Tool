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
  motorInfo: 48          // AV
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
  const page = (e && e.parameter && e.parameter.page) ? e.parameter.page : "index";
  const templateName =
    page === "listings" ? "Listings" :
    page === "analytics" ? "Analytics" :
    page === "manager" ? "Manager" :
    "Index";

  const template = HtmlService.createTemplateFromFile(templateName);
  template.appUrl = ScriptApp.getService().getUrl();

  return template.evaluate().setTitle("PBC/OMG Facebook Listings App");
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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

function getRegionSpreadsheet_(region) {
  if (!region) {
    throw new Error("No region selected.");
  }

  const id = REGION_MAP[region];
  if (!id) {
    throw new Error("Invalid region: " + region);
  }

  return SpreadsheetApp.openById(id);
}

function getHelperSheetName_(region) {
  const helperName = HELPER_SHEET_MAP[region];
  if (!helperName) {
    throw new Error("No helper sheet configured for region: " + region);
  }
  return helperName;
}

function getHelperSheet_(region) {
  const ss = getRegionSpreadsheet_(region);
  const helperSheetName = getHelperSheetName_(region);
  const sheet = ss.getSheetByName(helperSheetName);

  if (!sheet) {
    throw new Error("Helper sheet not found for region " + region + ": " + helperSheetName);
  }

  return sheet;
}

function getSalespeople_(region) {
  const sheet = getSalespeopleSheet_(region);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  return values
    .filter(function(row) {
      return String(row[1] || '').trim().toUpperCase() === 'Y';
    })
    .map(function(row) {
      return String(row[0] || '').trim();
    })
    .filter(Boolean)
    .sort(function(a, b) {
      return a.localeCompare(b);
    });
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

function getBoatsByClass(region, className) {
  if (!region) throw new Error("No region selected.");
  if (!className) return [];

  const sheet = getDataSheet_(region);
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return [];

  const width = COL.motorInfo - COL.boatInfo + 1;
  const values = sheet.getRange(
    FIRST_DATA_ROW,
    COL.boatInfo,
    lastRow - FIRST_DATA_ROW + 1,
    width
  ).getValues();

  return values
    .map(row => {
      const boatInfo = row[0];          // AK
      const salePrice = row[2];         // AM
      const stockNum = row[3];          // AN
      const hours = row[6];             // AQ
      const primaryClass = row[7];      // AR
      const secondaryClasses = row[8];  // AS

      const matchesPrimary =
        String(primaryClass || "").trim() === String(className || "").trim();

      const matchesSecondary =
        String(secondaryClasses || "")
          .split(";")
          .map(s => s.trim())
          .includes(String(className || "").trim());

      if (!boatInfo || (!matchesPrimary && !matchesSecondary)) return null;

      return {
        boatInfo: String(boatInfo),
        stockNum: String(stockNum || ""),
        salePrice: formatPrice_(salePrice),
        hours: hours === "" || hours == null ? "" : String(hours)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.boatInfo.localeCompare(b.boatInfo));
}

function getBoatDetails(region, stockNum) {
  if (!region) throw new Error("No region selected.");
  if (!stockNum) return null;

  const sheet = getDataSheet_(region);
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return null;

  const width = COL.motorInfo - COL.boatInfo + 1;
  const values = sheet.getRange(
    FIRST_DATA_ROW,
    COL.boatInfo,
    lastRow - FIRST_DATA_ROW + 1,
    width
  ).getValues();

  for (const row of values) {
    const boatInfo = row[0];         // AK
    const salePrice = row[2];        // AM
    const currentStock = row[3];     // AN
    const websiteDesc = row[4];      // AO
    const websiteOptions = row[5];   // AP
    const hours = row[6];            // AQ
    const primaryClass = row[7];     // AR
    const usedOptions = row[10];     // AU
    const motorInfo = row[11];       // AV

    if (String(currentStock || "").trim() === String(stockNum || "").trim()) {
      return {
        classification: String(primaryClass || ""),
        boatInfo: String(boatInfo || ""),
        stockNum: String(currentStock || ""),
        price: formatPrice_(salePrice),
        hours: hours === "" || hours == null ? "" : String(hours),
        motorInfo: String(motorInfo || ""),
        options: String(usedOptions || ""),
        websiteDesc: String(websiteDesc || ""),
        websiteOptions: String(websiteOptions || "")
      };
    }
  }

  return null;
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

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + apiKey
    },
    payload: JSON.stringify({
      model: "gpt-5-mini",
      input: prompt
    }),
    muteHttpExceptions: true
  });

  const text = response.getContentText();
  const json = JSON.parse(text);

  if (json.error) {
    throw new Error(json.error.message);
  }

  if (json.output_text && json.output_text.trim()) {
    return json.output_text.trim();
  }

  const fallback =
    json.output?.[0]?.content?.[0]?.text ||
    json.output?.map(o => (o.content || []).map(c => c.text || "").join(" ")).join(" ").trim();

  return fallback || "";
}

function saveListing(region, payload) {
  if (!region) throw new Error("No region selected.");

  const ss = getRegionSpreadsheet_(region);
  const salespersonName = String(payload.salespersonName || "").trim();

  if (!salespersonName) {
    throw new Error("Missing salesperson name.");
  }

  const tabName = getSalespersonTabName_(region, salespersonName);
  const sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    throw new Error("Sheet not found: " + tabName);
  }

  const stockNum = payload.stockNum || "";
  const price = payload.price || "";
  const bmbBoard = payload.bmbBoard || "";
  const video = payload.video || "";
  const aiListing = payload.aiListing || "";
  const link = payload.link || "";

  const startRow = 2;
  const lastRow = Math.max(sheet.getLastRow(), startRow);
  const numRows = lastRow - startRow + 1;
  const colBValues = sheet.getRange(startRow, 2, numRows, 1).getValues();

  let targetRow = lastRow + 1;

  for (let i = 0; i < colBValues.length; i++) {
    if (!colBValues[i][0]) {
      targetRow = startRow + i;
      break;
    }
  }

  sheet.getRange(targetRow, 2).setValue(stockNum);   // B
  sheet.getRange(targetRow, 4).setValue(price);      // D
  sheet.getRange(targetRow, 5).setValue(bmbBoard);   // E
  sheet.getRange(targetRow, 6).setValue(video);      // F
  sheet.getRange(targetRow, 7).setValue(aiListing);  // G
  sheet.getRange(targetRow, 8).setValue(link);       // H

  return true;
}

function getSalespersonListings(region, salespersonName) {
  if (!region) throw new Error("No region selected.");

  const ss = getRegionSpreadsheet_(region);
  const tabName = getSalespersonTabName_(region, salespersonName);
  const sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    throw new Error("Sheet not found: " + tabName);
  }

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

function clearSalespersonListing(region, salespersonName, rowNumber) {
  if (!region) throw new Error("No region selected.");

  const ss = getRegionSpreadsheet_(region);
  const tabName = getSalespersonTabName_(region, salespersonName);
  const sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    throw new Error("Sheet not found: " + tabName);
  }

  if (!rowNumber || rowNumber < 2) {
    throw new Error("Invalid row number.");
  }

  sheet.getRange(rowNumber, 2).clearContent(); // B
  sheet.getRange(rowNumber, 4).clearContent(); // D
  sheet.getRange(rowNumber, 5).clearContent(); // E
  sheet.getRange(rowNumber, 6).clearContent(); // F
  sheet.getRange(rowNumber, 7).clearContent(); // G
  sheet.getRange(rowNumber, 8).clearContent(); // H

  return true;
}

function updateSalespersonListing(region, salespersonName, rowNumber, updatedValues) {
  if (!region) throw new Error("No region selected.");

  const ss = getRegionSpreadsheet_(region);
  const tabName = getSalespersonTabName_(region, salespersonName);
  const sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    throw new Error("Sheet not found: " + tabName);
  }

  if (!rowNumber || rowNumber < 2) {
    throw new Error("Invalid row number.");
  }

  sheet.getRange(rowNumber, 2).setValue(updatedValues.stockNum || "");     // B
  sheet.getRange(rowNumber, 4).setValue(updatedValues.price || "");        // D
  sheet.getRange(rowNumber, 5).setValue(updatedValues.colE || "");         // E
  sheet.getRange(rowNumber, 6).setValue(updatedValues.colF || "");         // F
  sheet.getRange(rowNumber, 7).setValue(updatedValues.description || "");  // G
  sheet.getRange(rowNumber, 8).setValue(updatedValues.colH || "");         // H

  return true;
}

function getAnalyticsData(region, viewName) {
  if (!region) throw new Error("No region selected.");

  const ss = getRegionSpreadsheet_(region);
  const sheet = ss.getSheetByName(ANALYTICS_SHEET_NAME);

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
function getDataSheet_(region) {
  const ss = getRegionSpreadsheet_(region);
  const sheet = ss.getSheetByName("UIMT");

  if (!sheet) {
    throw new Error("UIMT sheet not found for region: " + region);
  }

  return sheet;
}
function getSalespeopleSheet_(region) {
  const ss = getRegionSpreadsheet_(region);
  const sheet = ss.getSheetByName(SALESPEOPLE_SHEET_NAME);

  if (!sheet) {
    throw new Error('Salespeople sheet not found for region: ' + region);
  }

  return sheet;
}

function getSalespersonTabName_(region, salespersonName) {
  const sheet = getSalespeopleSheet_(region);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error('No salespeople configured for region: ' + region);
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  for (let i = 0; i < values.length; i++) {
    const displayName = String(values[i][0] || '').trim();
    const active = String(values[i][1] || '').trim().toUpperCase();
    const tabName = String(values[i][2] || '').trim();

    if (displayName === String(salespersonName || '').trim()) {
      if (active !== 'Y') {
        throw new Error('Salesperson is inactive: ' + salespersonName);
      }

      if (!tabName) {
        throw new Error('Missing tab name for salesperson: ' + salespersonName);
      }

      return tabName;
    }
  }

  throw new Error('Salesperson not found in config: ' + salespersonName);
}

function getManagerViewData() {
  const omgSpreadsheetId = "13g1AXFomQ6rLbdfWogEmeIHwjzdjTjA9fuZML0P4Tcw";
  const ss = SpreadsheetApp.openById(omgSpreadsheetId);
  const sheet = ss.getSheetByName("Manager View");

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
  const startColumn = 2;
  const numCols = 34;

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