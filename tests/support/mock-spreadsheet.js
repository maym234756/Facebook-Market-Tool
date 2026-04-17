function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

function normalizeCell(value) {
  return value == null ? '' : value;
}

class MockRange {
  constructor(sheet, row, column, numRows, numColumns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }

  getValues() {
    return this.sheet.readMatrix(this.row, this.column, this.numRows, this.numColumns);
  }

  getDisplayValues() {
    return this.getValues().map((row) => row.map((value) => String(value == null ? '' : value)));
  }

  getBackgrounds() {
    return this.sheet.readBackgrounds(this.row, this.column, this.numRows, this.numColumns);
  }

  setValue(value) {
    this.sheet.writeCell(this.row, this.column, value);
    return this;
  }

  clearContent() {
    this.sheet.writeCell(this.row, this.column, '');
    return this;
  }
}

class MockSheet {
  constructor(name, values = [], options = {}) {
    this.name = name;
    this.values = cloneMatrix(values);
    this.backgrounds = cloneMatrix(options.backgrounds || []);
    this.columnWidths = { ...(options.columnWidths || {}) };
  }

  ensureCell(row, column) {
    while (this.values.length < row) {
      this.values.push([]);
    }

    while (this.values[row - 1].length < column) {
      this.values[row - 1].push('');
    }

    while (this.backgrounds.length < row) {
      this.backgrounds.push([]);
    }

    while (this.backgrounds[row - 1].length < column) {
      this.backgrounds[row - 1].push('#ffffff');
    }
  }

  getLastRow() {
    for (let rowIndex = this.values.length; rowIndex >= 1; rowIndex -= 1) {
      const row = this.values[rowIndex - 1] || [];
      if (row.some((value) => String(normalizeCell(value)).trim() !== '')) {
        return rowIndex;
      }
    }

    return 0;
  }

  getSheetByName() {
    return null;
  }

  getRange(row, column, numRows = 1, numColumns = 1) {
    return new MockRange(this, row, column, numRows, numColumns);
  }

  getColumnWidth(column) {
    return this.columnWidths[column] || 100;
  }

  readMatrix(row, column, numRows, numColumns) {
    const output = [];

    for (let rowOffset = 0; rowOffset < numRows; rowOffset += 1) {
      const currentRow = [];
      for (let colOffset = 0; colOffset < numColumns; colOffset += 1) {
        const sourceRow = this.values[row + rowOffset - 1] || [];
        currentRow.push(normalizeCell(sourceRow[column + colOffset - 1]));
      }
      output.push(currentRow);
    }

    return output;
  }

  readBackgrounds(row, column, numRows, numColumns) {
    const output = [];

    for (let rowOffset = 0; rowOffset < numRows; rowOffset += 1) {
      const currentRow = [];
      for (let colOffset = 0; colOffset < numColumns; colOffset += 1) {
        const sourceRow = this.backgrounds[row + rowOffset - 1] || [];
        currentRow.push(sourceRow[column + colOffset - 1] || '#ffffff');
      }
      output.push(currentRow);
    }

    return output;
  }

  writeCell(row, column, value) {
    this.ensureCell(row, column);
    this.values[row - 1][column - 1] = value;
  }
}

class MockSpreadsheet {
  constructor(sheetDefinitions) {
    this.sheets = new Map(
      Object.entries(sheetDefinitions).map(([sheetName, definition]) => {
        const values = Array.isArray(definition) ? definition : definition.values;
        const options = Array.isArray(definition) ? {} : definition;
        return [sheetName, new MockSheet(sheetName, values, options)];
      })
    );
  }

  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }
}

export function createSpreadsheetApp(spreadsheetsById) {
  const spreadsheets = new Map(
    Object.entries(spreadsheetsById).map(([id, sheetDefinitions]) => [id, new MockSpreadsheet(sheetDefinitions)])
  );

  return {
    openById(id) {
      const spreadsheet = spreadsheets.get(id);
      if (!spreadsheet) {
        throw new Error(`Unknown spreadsheet id: ${id}`);
      }

      return spreadsheet;
    }
  };
}

export function createPropertiesService(properties = {}) {
  return {
    getScriptProperties() {
      return {
        getProperty(name) {
          return properties[name] || null;
        }
      };
    }
  };
}

/*
Professional summary:
This file provides mock implementations of SpreadsheetApp, Spreadsheet, Sheet, Range, and
PropertiesService behavior that the pulled Apps Script code depends on. The mocks reproduce the
subset of spreadsheet operations needed for local tests.

Operational role:
- Simulates reading and writing spreadsheet cell ranges in memory
- Supports behaviors such as getValues, getDisplayValues, getBackgrounds, setValue, and clearContent
- Exposes fake spreadsheet instances by spreadsheet ID so production logic can be exercised locally

Why it exists:
Most of the important server-side logic depends on Google Sheets data. This mock layer allows that
logic to be verified locally without touching a live spreadsheet or the live Apps Script project.
*/