/**
 * FacebookListingUrlBuilder
 *
 * Generates a time-limited, HMAC-SHA256-signed URL that allows the
 * Apps Script web app to accept an iframe embed from Salesforce.
 *
 * The signing logic mirrors Code.js  buildSalesforceEmbedPayload_ / createSalesforceEmbedSignature_:
 *   payload = "salesforce:" + page + ":" + expiresAt
 *   signature = HMAC-SHA256(payload, secret)  →  lowercase hex
 *
 * Secret storage: Custom Setting  FacebookListingSettings__c.EmbedSecret__c
 * Apps Script deployment URL: Custom Setting  FacebookListingSettings__c.AppsScriptUrl__c
 */
public with sharing class FacebookListingUrlBuilder {

    /** Token valid for 5 minutes (300 000 ms). */
    private static final Long TOKEN_TTL_MS = 300000L;

    /**
     * Returns a fully-qualified, signed Apps Script URL for the given page
     * (listings | analytics | manager | index).
     *
     * Called from the facebookListing LWC via @AuraEnabled.
     */
    @AuraEnabled(cacheable=false)
    public static String buildSignedUrl(String page) {
        String normalizedPage = normalizePage(page);

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
        String payload = 'salesforce:' + normalizedPage + ':' + String.valueOf(expiresAt);
        String signature = hmacHex(payload, settings.EmbedSecret__c);

        // Build URL: <base>?embed=salesforce&page=<page>&expires=<ts>&sig=<hex>
        String baseUrl = settings.AppsScriptUrl__c.trim();
        String sep = baseUrl.contains('?') ? '&' : '?';

        return baseUrl
            + sep + 'embed=salesforce'
            + '&page=' + EncodingUtil.urlEncode(normalizedPage, 'UTF-8')
            + '&expires=' + String.valueOf(expiresAt)
            + '&sig=' + signature;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static String normalizePage(String raw) {
        String p = String.isBlank(raw) ? '' : raw.trim().toLowerCase();
        if (p == 'listings' || p == 'analytics' || p == 'manager') {
            return p;
        }
        return 'index';
    }

    /**
     * HMAC-SHA256 of utf-8 payload with utf-8 secret, returned as lowercase hex —
     * identical to Utilities.computeHmacSha256Signature in Apps Script.
     */
    private static String hmacHex(String payload, String secret) {
        Blob sig = Crypto.generateMac(
            'hmacSHA256',
            Blob.valueOf(payload),
            Blob.valueOf(secret)
        );
        return EncodingUtil.convertToHex(sig).toLowerCase();
    }
}
