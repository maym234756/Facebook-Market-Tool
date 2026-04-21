# Salesforce – Facebook Listing Tab

This folder contains all Salesforce metadata needed to surface the
Facebook Marketplace Listings tool as a native Salesforce tab.

---

## How It Works

1. **Apps Script** already validates signed tokens (HMAC-SHA256 + expiry) before
   allowing iframe embedding (`embed=salesforce` parameter).
2. **Apex** (`FacebookListingUrlBuilder`) builds a fresh signed URL on every page
   load using the shared secret stored in the `FacebookListingSettings__c`
   Custom Setting.
3. **LWC** (`facebookListing`) calls the Apex method, then renders a sandboxed
   `<iframe>` with the signed URL.  Tokens refresh automatically every 4 minutes
   (before the 5-minute server-side expiry).
4. A **Custom Tab** wires the LWC into the Salesforce navigation bar as
   "Facebook Listing".

---

## Deployment Steps

### 1 — Prerequisites
- Salesforce CLI (`sf`) installed and authenticated to your org.
- The Apps Script web app is **deployed** as "Execute as: Me, Who has access: Anyone".

### 2 — Generate a shared secret
Run the following in any terminal and save the output:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3 — Set the secret in Apps Script
In the Apps Script editor → Project Settings → Script Properties, add:

| Key                     | Value                          |
|-------------------------|-------------------------------|
| `SALESFORCE_EMBED_SECRET` | *the hex string from step 2* |

### 4 — Deploy the Salesforce package
```bash
cd salesforce
sf org login web --alias myOrg           # skip if already authenticated
sf project deploy start --target-org myOrg
```

### 5 — Configure the Custom Setting
In Salesforce → Setup → Custom Settings → **Facebook Listing Settings** → Manage:

| Field            | Value                                              |
|------------------|----------------------------------------------------|
| Apps Script URL  | `https://script.google.com/macros/s/<ID>/exec`    |
| Embed Secret     | *same hex string from step 2*                     |

### 6 — Add the tab to your App
Setup → App Manager → your Sales/Service App → Edit → Navigation Items →
add **Facebook Listing**.

### 7 — Set field-level security on the Custom Setting
Ensure only System Administrators can view `EmbedSecret__c` —
go to the field's Field-Level Security and restrict accordingly.

---

## Security Notes

- The `EmbedSecret__c` field holds a sensitive value. Restrict FLS and do not
  expose it in flows, reports, or API responses.
- Tokens expire after **5 minutes** server-side (Apps Script) and are refreshed
  every **4 minutes** client-side (LWC).
- The iframe uses `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`
  to limit what the embedded content can do.
- The Apex class is declared `with sharing` so it obeys Salesforce sharing rules.
