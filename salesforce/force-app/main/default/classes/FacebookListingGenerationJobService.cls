public with sharing class FacebookListingGenerationJobService {

    public class SubmitResponse {
        @AuraEnabled public Id jobId;
        @AuraEnabled public String status;
        @AuraEnabled public String correlationId;
    }

    public class StatusResponse {
        @AuraEnabled public Id jobId;
        @AuraEnabled public String status;
        @AuraEnabled public String resultText;
        @AuraEnabled public String errorText;
        @AuraEnabled public String correlationId;
        @AuraEnabled public Boolean isTerminal;
    }

    public static SubmitResponse submitJob(String region, Map<String, Object> payload) {
        String normalizedRegion = String.isBlank(region) ? '' : region.trim();
        if (String.isBlank(normalizedRegion)) {
            throw new AuraHandledException('No region selected.');
        }

        if (payload == null || payload.isEmpty()) {
            throw new AuraHandledException('Missing generation payload.');
        }

        FacebookListingGenerationJob__c job = new FacebookListingGenerationJob__c(
            Status__c = 'Queued',
            Region__c = normalizedRegion,
            PayloadJson__c = JSON.serialize(payload),
            CorrelationId__c = createCorrelationId()
        );
        insert job;

        System.enqueueJob(new FacebookListingGenerationQueueable(job.Id));

        SubmitResponse response = new SubmitResponse();
        response.jobId = job.Id;
        response.status = job.Status__c;
        response.correlationId = job.CorrelationId__c;
        return response;
    }

    public static StatusResponse getJobStatus(Id jobId) {
        if (jobId == null) {
            throw new AuraHandledException('Missing job id.');
        }

        FacebookListingGenerationJob__c job = [
            SELECT Id, Status__c, ResultText__c, ErrorText__c, CorrelationId__c, CreatedById
            FROM FacebookListingGenerationJob__c
            WHERE Id = :jobId
            LIMIT 1
        ];

        if (job.CreatedById != UserInfo.getUserId()) {
            throw new AuraHandledException('You do not have access to this generation job.');
        }

        StatusResponse response = new StatusResponse();
        response.jobId = job.Id;
        response.status = job.Status__c;
        response.resultText = job.ResultText__c;
        response.errorText = job.ErrorText__c;
        response.correlationId = job.CorrelationId__c;
        response.isTerminal = job.Status__c == 'Completed' || job.Status__c == 'Failed';
        return response;
    }

    @TestVisible
    private static String createCorrelationId() {
        Blob seed = Blob.valueOf(
            UserInfo.getUserId() + ':'
            + String.valueOf(Datetime.now().getTime()) + ':'
            + String.valueOf(Crypto.getRandomLong())
        );
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', seed)).substring(0, 24).toLowerCase();
    }
}