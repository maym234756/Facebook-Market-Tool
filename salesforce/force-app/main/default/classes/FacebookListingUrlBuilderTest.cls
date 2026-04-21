@IsTest
private class FacebookListingUrlBuilderTest {

    @TestSetup
    static void makeData() {
        FacebookListingSettings__c s = new FacebookListingSettings__c();
        s.AppsScriptUrl__c = 'https://script.google.com/macros/s/FAKE_ID/exec';
        s.EmbedSecret__c   = 'test-secret-key';
        insert s;
    }

    @IsTest
    static void testListingsPageReturnsSignedUrl() {
        Test.startTest();
        String url = FacebookListingUrlBuilder.buildSignedUrl('listings');
        Test.stopTest();

        System.assert(url.contains('embed=salesforce'), 'Should contain embed=salesforce');
        System.assert(url.contains('page=listings'),    'Should contain page=listings');
        System.assert(url.contains('expires='),         'Should contain expires param');
        System.assert(url.contains('sig='),             'Should contain sig param');
    }

    @IsTest
    static void testIndexPageFallback() {
        Test.startTest();
        String url = FacebookListingUrlBuilder.buildSignedUrl('UNKNOWN');
        Test.stopTest();
        System.assert(url.contains('page=index'), 'Unknown page should fall back to index');
    }

    @IsTest
    static void testMissingSettingsThrows() {
        delete [SELECT Id FROM FacebookListingSettings__c];
        Test.startTest();
        try {
            FacebookListingUrlBuilder.buildSignedUrl('listings');
            System.assert(false, 'Expected exception');
        } catch (AuraHandledException ex) {
            System.assert(ex.getMessage().contains('not configured'), ex.getMessage());
        }
        Test.stopTest();
    }
}
