public without sharing class FacebookListingGenerationQueueable implements Queueable, Database.AllowsCallouts {

    private final Id jobId;

    public FacebookListingGenerationQueueable(Id jobId) {
        this.jobId = jobId;
    }

    public void execute(QueueableContext context) {
        FacebookListingGenerationJob__c job = [
            SELECT Id, Status__c, Region__c, PayloadJson__c
            FROM FacebookListingGenerationJob__c
            WHERE Id = :jobId
            LIMIT 1
        ];

        if (job.Status__c == 'Completed' || job.Status__c == 'Failed') {
            return;
        }

        job.Status__c = 'Processing';
        job.StartedAt__c = System.now();
        update job;

        try {
            Map<String, Object> payload = (Map<String, Object>) JSON.deserializeUntyped(job.PayloadJson__c);
            Map<String, Object> result = FacebookListingCalloutService.generateListing(job.Region__c, payload);

            job.Status__c = 'Completed';
            job.ResultText__c = String.valueOf(result.get('listing'));
            job.ErrorText__c = null;
            job.FinishedAt__c = System.now();
            update job;
        } catch (Exception ex) {
            job.Status__c = 'Failed';
            job.ErrorText__c = trimToFieldLength_(String.valueOf(ex.getMessage()), 32768);
            job.FinishedAt__c = System.now();
            update job;
        }
    }

    private static String trimToFieldLength_(String value, Integer maxLength) {
        if (String.isBlank(value)) {
            return value;
        }

        Integer safeLength = maxLength == null ? value.length() : Math.min(maxLength, value.length());
        return value.substring(0, safeLength);
    }
}