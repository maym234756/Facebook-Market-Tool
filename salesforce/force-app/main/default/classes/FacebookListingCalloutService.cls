/**
 * FacebookListingCalloutService
 *
 * Makes HMAC-signed POST callouts from Salesforce to the Apps Script doPost endpoint.
 *
 * Signature payload (mirrors Code.js createSalesforceWriteSignature_):
 *   "salesforce-write:<action>:<expiresAt>"
 *
 * All methods throw AuraHandledException on failure so LWC @wire / imperative
 * Apex calls surface the message cleanly in the UI.
 */
public with sharing class FacebookListingCalloutService {

    private static final Long TOKEN_TTL_MS    = 300000L;   // 5 minutes
    private static final String WRITE_MODE    = 'salesforce-write';
    private static final Integer TIMEOUT_MS   = 30000;

    // -----------------------------------------------------------------------
    // Public API — called by FacebookListingFormController
    // -----------------------------------------------------------------------

    public static Map<String, Object> getFormData(String region) {
        Map<String, Object> body = new Map<String, Object>{ 'region' => region };
        return callAppsScript('getFormData', body);
    }

    public static Map<String, Object> getBoatsByClass(String region, String className) {
        Map<String, Object> body = new Map<String, Object>{
            'region'    => region,
            'className' => className
        };
        return callAppsScript('getBoatsByClass', body);
    }

    public static Map<String, Object> getBoatDetails(String region, String stockNum) {
        Map<String, Object> body = new Map<String, Object>{
            'region'   => region,
            'stockNum' => stockNum
        };
        return callAppsScript('getBoatDetails', body);
    }

    public static Map<String, Object> generateListing(String region, Map<String, Object> payload) {
        payload.put('region', region);
        return callAppsScript('generateListing', payload);
    }

    public static Map<String, Object> saveListing(String region, Map<String, Object> payload) {
        payload.put('region', region);
        return callAppsScript('saveListing', payload);
    }

    // -----------------------------------------------------------------------
    // Core callout
    // -----------------------------------------------------------------------

    private static Map<String, Object> callAppsScript(String action, Map<String, Object> data) {
        FacebookListingSettings__c settings = FacebookListingSettings__c.getInstance();
        if (settings == null
                || String.isBlank(settings.AppsScriptUrl__c)
                || String.isBlank(settings.EmbedSecret__c)) {
            throw new AuraHandledException(
                'FacebookListingSettings__c is not configured. '
                + 'Set AppsScriptUrl__c and EmbedSecret__c in Custom Settings.'
            );
        }

        Long expiresAt = Datetime.now().getTime() + TOKEN_TTL_MS;
        String sig     = buildWriteSignature(action, expiresAt, settings.EmbedSecret__c);

        // Merge token fields into body
        data.put('action',  action);
        data.put('expires', expiresAt);
        data.put('sig',     sig);

        String bodyJson = JSON.serialize(data);

        HttpRequest req = new HttpRequest();
        req.setEndpoint(settings.AppsScriptUrl__c.trim());
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(TIMEOUT_MS);
        req.setBody(bodyJson);

        Http http = new Http();
        HttpResponse res;
        try {
            res = http.send(req);
        } catch (CalloutException ex) {
            throw new AuraHandledException('Callout failed: ' + ex.getMessage());
        }

        // Google Apps Script redirects the initial POST to a finalized execution URL
        // that must be retrieved with GET (the response body is on the redirect target).
        if ((res.getStatusCode() == 301 || res.getStatusCode() == 302 || res.getStatusCode() == 303)
                && String.isNotBlank(res.getHeader('Location'))) {
            String redirectUrl = res.getHeader('Location');
            HttpRequest redir = new HttpRequest();
            redir.setEndpoint(redirectUrl);
            redir.setMethod('GET');
            redir.setTimeout(TIMEOUT_MS);
            try {
                res = http.send(redir);
            } catch (CalloutException ex) {
                throw new AuraHandledException('Redirect callout failed: ' + ex.getMessage());
            }
        }

        String responseBody = res.getBody();
        Map<String, Object> parsed;
        try {
            parsed = (Map<String, Object>) JSON.deserializeUntyped(responseBody);
        } catch (JSONException ex) {
            // Surface enough context for diagnosis: status, first 800 chars of body
            String snippet = responseBody != null && responseBody.length() > 800
                ? responseBody.substring(0, 800) : responseBody;
            throw new AuraHandledException(
                'Apps Script returned invalid JSON (HTTP ' + res.getStatusCode() + '): ' + snippet
            );
        }

        Boolean ok = parsed.get('ok') == true;
        if (!ok) {
            String errMsg = parsed.containsKey('error')
                ? String.valueOf(parsed.get('error'))
                : 'Apps Script returned an error.';
            throw new AuraHandledException(errMsg);
        }

        Object dataObj = parsed.get('data');
        if (dataObj instanceof Map<String, Object>) {
            return (Map<String, Object>) dataObj;
        }
        return new Map<String, Object>();
    }

    // -----------------------------------------------------------------------
    // HMAC helpers — mirrors Apps Script createSalesforceWriteSignature_
    // -----------------------------------------------------------------------

    @TestVisible
    private static String buildWriteSignature(String action, Long expiresAt, String secret) {
        String payload = WRITE_MODE + ':' + action + ':' + String.valueOf(expiresAt);
        Blob sig = Crypto.generateMac('hmacSHA256', Blob.valueOf(payload), Blob.valueOf(secret));
        return EncodingUtil.convertToHex(sig).toLowerCase();
    }
}
