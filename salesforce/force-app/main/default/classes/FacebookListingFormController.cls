/**
 * FacebookListingFormController
 *
 * AuraEnabled methods called by the facebookListingCreate LWC.
 * Each method delegates to FacebookListingCalloutService which
 * handles signing and the HTTP callout to the Apps Script doPost endpoint.
 */
public with sharing class FacebookListingFormController {

    /**
     * Returns regions, salespeople (for the given region), and boat classes.
     * Called on initial load and whenever the region picker changes.
     */
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> getFormData(String region) {
        return FacebookListingCalloutService.getFormData(region);
    }

    /**
     * Returns the list of boats for a given region + class.
     */
    @AuraEnabled(cacheable=false)
    public static List<Object> getBoatsByClass(String region, String className) {
        Map<String, Object> result = FacebookListingCalloutService.getBoatsByClass(region, className);
        Object boats = result.get('boats');
        if (boats instanceof List<Object>) {
            return (List<Object>) boats;
        }
        return new List<Object>();
    }

    /**
     * Returns detailed boat record by stock number.
     */
    @AuraEnabled(cacheable=false)
    public static Map<String, Object> getBoatDetails(String region, String stockNum) {
        Map<String, Object> result = FacebookListingCalloutService.getBoatDetails(region, stockNum);
        Object details = result.get('details');
        if (details instanceof Map<String, Object>) {
            return (Map<String, Object>) details;
        }
        return new Map<String, Object>();
    }

    /**
     * Calls OpenAI via Apps Script to generate an AI Facebook Marketplace listing.
     * payload keys: salespersonName, classification, boatInfo, stockNum, price,
     *               hours, motorInfo, options, websiteDesc, websiteOptions
     */
    @AuraEnabled(cacheable=false)
    public static String generateListing(String region, Map<String, Object> payload) {
        Map<String, Object> result = FacebookListingCalloutService.generateListing(region, payload);
        return String.valueOf(result.get('listing') ?? '');
    }

    /**
     * Submits an async generation job that reuses the existing Apps Script generator.
     */
    @AuraEnabled(cacheable=false)
    public static FacebookListingGenerationJobService.SubmitResponse submitGenerateListingJob(
        String region,
        Map<String, Object> payload
    ) {
        return FacebookListingGenerationJobService.submitJob(region, payload);
    }

    /**
     * Returns the current status for an async generation job.
     */
    @AuraEnabled(cacheable=false)
    public static FacebookListingGenerationJobService.StatusResponse getGenerateListingJobStatus(Id jobId) {
        return FacebookListingGenerationJobService.getJobStatus(jobId);
    }

    /**
     * Saves the finished listing row to the salesperson's Google Sheet tab.
     * payload keys: salespersonName, stockNum, price, bmbBoard, video, aiListing, link
     */
    @AuraEnabled(cacheable=false)
    public static void saveListing(String region, Map<String, Object> payload) {
        FacebookListingCalloutService.saveListing(region, payload);
    }
}
