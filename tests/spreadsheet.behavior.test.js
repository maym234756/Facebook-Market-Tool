import { describe, expect, it } from 'vitest';
import { loadAppsScriptFiles } from './support/load-apps-script.js';
import { createPropertiesService, createSpreadsheetApp } from './support/mock-spreadsheet.js';

const OMG_ID = '13g1AXFomQ6rLbdfWogEmeIHwjzdjTjA9fuZML0P4Tcw';

function createContext() {
  const spreadsheetApp = createSpreadsheetApp({
    [OMG_ID]: {
      Salespeople: [
        ['Name', 'Active', 'Tab'],
        ['Zoe Agent', 'Y', 'Zoe Tab'],
        ['Aaron Seller', 'Y', 'Aaron Tab'],
        ['Inactive Rep', 'N', 'Inactive Tab']
      ],
      UIMT: [
        [],
        [],
        [
          '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
          '2022 Tidewater 2410', '', 54999, 'STK-101', 'Clean coastal-ready center console', 'Garmin; T-top', 120, 'Center Console', 'Fishing; Family', '', 'Power Pole; Simrad', 'Yamaha F300'
        ],
        [
          '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
          '2021 Harris Cruiser', '', 32999, 'STK-202', 'Family pontoon with room to cruise', 'Bimini; Stereo', '', 'Pontoon', 'Family', '', 'Changing room', 'Mercury 150'
        ]
      ],
      'Zoe Tab': [
        ['A', 'Stock #', 'C', 'Price', 'BMB', 'Video', 'AI Listing', 'Link'],
        ['', 'EXIST-1', '', '$22,000', 'board-1', 'video-1', 'listing-1', 'link-1'],
        ['', '', '', '', '', '', '', '']
      ],
      Analytics: {
        values: [
          Array.from({ length: 32 }, (_, index) => `H${index + 1}`),
          Array.from({ length: 32 }, (_, index) => `Sub${index + 1}`),
          ['','Row B1','x','x','x','x','x','x','x','x','x','x','x','x','x','','','Region R1','x','x','x','x','x','x','x','x','x','x','x','x','x','x'],
          ['','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','',''],
          ['','Row B2','x','x','x','x','x','x','x','x','x','x','x','x','x','','','Region R2','x','x','x','x','x','x','x','x','x','x','x','x','x','x']
        ],
        backgrounds: Array.from({ length: 5 }, () => Array.from({ length: 32 }, () => '#ffffff')),
        columnWidths: { 2: 180, 18: 220 }
      },
      'Manager View': {
        values: [
          Array.from({ length: 35 }, (_, index) => `M${index + 1}`),
          Array.from({ length: 35 }, (_, index) => `Sub${index + 1}`),
          ['','Manager Row','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','',''],
          ['','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','']
        ],
        backgrounds: Array.from({ length: 4 }, () => Array.from({ length: 35 }, () => '#eeeeee')),
        columnWidths: { 2: 200 }
      }
    }
  });

  return loadAppsScriptFiles(['src/Code.js'], {
    SpreadsheetApp: spreadsheetApp,
    PropertiesService: createPropertiesService({ OPENAI_API_KEY: 'test-key' })
  });
}

describe('Apps Script spreadsheet behavior', () => {
  it('reads active salespeople in sorted order', () => {
    const context = createContext();

    expect(context.getInitialData('OMG').salespeople).toEqual(['Aaron Seller', 'Zoe Agent']);
  });

  it('builds classes and boat summaries from the UIMT sheet', () => {
    const context = createContext();

    expect(context.getClasses_('OMG')).toEqual(['Center Console', 'Family', 'Fishing', 'Pontoon']);
    expect(context.getBoatsByClass('OMG', 'Fishing')).toEqual([
      {
        boatInfo: '2022 Tidewater 2410',
        stockNum: 'STK-101',
        salePrice: '$54,999',
        hours: '120'
      }
    ]);
  });

  it('returns detailed boat data for a stock number', () => {
    const context = createContext();

    expect(context.getBoatDetails('OMG', 'STK-202')).toEqual({
      classification: 'Pontoon',
      boatInfo: '2021 Harris Cruiser',
      stockNum: 'STK-202',
      price: '$32,999',
      hours: '',
      motorInfo: 'Mercury 150',
      options: 'Changing room',
      websiteDesc: 'Family pontoon with room to cruise',
      websiteOptions: 'Bimini; Stereo'
    });
  });

  it('writes, updates, and clears salesperson listings in the mock sheet', () => {
    const context = createContext();

    context.saveListing('OMG', {
      salespersonName: 'Zoe Agent',
      stockNum: 'NEW-3',
      price: '$44,500',
      bmbBoard: 'board-3',
      video: 'video-3',
      aiListing: 'listing-3',
      link: 'link-3'
    });

    let listingData = context.getSalespersonListings('OMG', 'Zoe Agent');
    expect(listingData.values[2][1]).toBe('NEW-3');
    expect(listingData.values[2][6]).toBe('listing-3');

    context.updateSalespersonListing('OMG', 'Zoe Agent', 3, {
      stockNum: 'NEW-3B',
      price: '$45,000',
      colE: 'board-3b',
      colF: 'video-3b',
      description: 'updated listing',
      colH: 'link-3b'
    });

    listingData = context.getSalespersonListings('OMG', 'Zoe Agent');
    expect(listingData.values[2][1]).toBe('NEW-3B');
    expect(listingData.values[2][6]).toBe('updated listing');

    context.clearSalespersonListing('OMG', 'Zoe Agent', 3);

    listingData = context.getSalespersonListings('OMG', 'Zoe Agent');
    expect(listingData.values[2][1]).toBe('');
    expect(listingData.values[2][6]).toBe('');
  });

  it('filters analytics and manager views the same way Apps Script would', () => {
    const context = createContext();

    const allUsed = context.getAnalyticsData('OMG', 'All Used Units');
    const regionalUsed = context.getAnalyticsData('OMG', 'Regional Used Units');
    const managerView = context.getManagerViewData();

    expect(allUsed.startColumn).toBe(2);
    expect(allUsed.values).toHaveLength(4);
    expect(regionalUsed.startColumn).toBe(18);
    expect(regionalUsed.values).toHaveLength(4);
    expect(managerView.values).toHaveLength(3);
  });
});

/*
Professional summary:
This test file validates spreadsheet-driven Apps Script behaviors against a fully local mock data
model. It exercises the major read, transform, write, and filtering paths in Code.js without
reaching Google Sheets, Apps Script, or the live deployment.

Operational role:
- Verifies salesperson lookup and active-user filtering
- Verifies boat class aggregation, listing summaries, and boat detail retrieval
- Verifies save, update, and clear behaviors for salesperson listing rows
- Verifies analytics and manager-view filtering behavior against representative sheet layouts

Why it exists:
It gives the project a reliable local safety net for spreadsheet logic, which is the highest-risk
part of the server-side code when making future changes.
*/