/**
 * FacebookListingPhotoProxyService
 *
 * Server-side proxy that fetches listing photos and returns their bytes as
 * base64 so the LWC can build a ZIP in the browser. This bypasses browser CORS
 * restrictions (many photo CDNs don't send Access-Control-Allow-Origin) and
 * mirrors the response shape of the Apps Script getPhotoDownloadPayload
 * function so the LWC can use the same assembly pipeline.
 *
 * Only URLs whose hostname is in ALLOWED_HOSTS are fetched. Any other URL is
 * returned with an "error" entry so the LWC can surface it without making an
 * unauthorized callout (defense-in-depth against SSRF even though the URL list
 * originates from trusted Apps Script boat-record data).
 */
public with sharing class FacebookListingPhotoProxyService {

    private static final Integer TIMEOUT_MS = 30000;
    private static final Integer MAX_URLS_PER_REQUEST = 60;

    private static final Set<String> ALLOWED_HOSTS = new Set<String>{
        'www.oceanmarine.boats',
        'www.premierboatingcenters.com'
    };

    /**
     * Per-URL result record returned to the LWC. Uses member-name parity with
     * the Apps Script version: on success {url, fileName, contentType, base64};
     * on failure {url, error}.
     */
    public class PhotoResult {
        @AuraEnabled public String url;
        @AuraEnabled public String fileName;
        @AuraEnabled public String contentType;
        @AuraEnabled public String base64;
        @AuraEnabled public String error;
    }

    public static List<PhotoResult> fetchPhotos(List<String> urls) {
        List<PhotoResult> out = new List<PhotoResult>();
        if (urls == null || urls.isEmpty()) {
            return out;
        }
        if (urls.size() > MAX_URLS_PER_REQUEST) {
            throw new AuraHandledException(
                'Too many photos requested at once. Max per request: '
                + String.valueOf(MAX_URLS_PER_REQUEST)
            );
        }

        Http http = new Http();
        Integer index = 0;

        for (String rawUrl : urls) {
            PhotoResult result = new PhotoResult();
            String cleanUrl = rawUrl == null ? '' : rawUrl.trim();
            result.url = cleanUrl;

            if (String.isBlank(cleanUrl)) {
                result.error = 'Empty URL';
                out.add(result);
                index++;
                continue;
            }

            Url parsed;
            try {
                parsed = new Url(cleanUrl);
            } catch (Exception ex) {
                result.error = 'Invalid URL';
                out.add(result);
                index++;
                continue;
            }

            String host = parsed.getHost() == null ? '' : parsed.getHost().toLowerCase();
            if (!ALLOWED_HOSTS.contains(host)) {
                result.error = 'Host not allowed: ' + host;
                out.add(result);
                index++;
                continue;
            }

            HttpRequest req = new HttpRequest();
            req.setEndpoint(cleanUrl);
            req.setMethod('GET');
            req.setTimeout(TIMEOUT_MS);
            req.setHeader('User-Agent', 'Salesforce-FacebookListing-PhotoProxy/1.0');

            HttpResponse res;
            try {
                res = http.send(req);
            } catch (Exception ex) {
                result.error = 'Callout failed: ' + ex.getMessage();
                out.add(result);
                index++;
                continue;
            }

            Integer code = res.getStatusCode();
            if (code < 200 || code >= 300) {
                result.error = 'HTTP ' + String.valueOf(code);
                out.add(result);
                index++;
                continue;
            }

            Blob body = res.getBodyAsBlob();
            if (body == null || body.size() == 0) {
                result.error = 'Empty response body';
                out.add(result);
                index++;
                continue;
            }

            String contentType = res.getHeader('Content-Type');
            if (String.isBlank(contentType)) {
                contentType = 'application/octet-stream';
            }

            result.contentType = contentType;
            result.base64      = EncodingUtil.base64Encode(body);
            result.fileName    = buildFileName(cleanUrl, index, contentType);
            out.add(result);
            index++;
        }

        return out;
    }

    @TestVisible
    private static String buildFileName(String rawUrl, Integer index, String contentType) {
        String fallback = 'photo-' + String.valueOf(index + 1) + guessExtensionFromMime(contentType);
        if (String.isBlank(rawUrl)) {
            return fallback;
        }
        String withoutQuery = rawUrl.split('\\?')[0];
        List<String> parts = withoutQuery.split('/');
        String name = parts.isEmpty() ? '' : parts[parts.size() - 1];
        if (String.isBlank(name)) {
            return fallback;
        }
        if (!name.contains('.')) {
            name += guessExtensionFromMime(contentType);
        }
        return name;
    }

    @TestVisible
    private static String guessExtensionFromMime(String contentType) {
        String t = (contentType == null ? '' : contentType).toLowerCase();
        if (t.contains('jpeg') || t.contains('jpg')) return '.jpg';
        if (t.contains('png'))  return '.png';
        if (t.contains('webp')) return '.webp';
        if (t.contains('gif'))  return '.gif';
        return '.bin';
    }
}
