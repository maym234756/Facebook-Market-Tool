declare module "@salesforce/apex/FacebookListingFormController.getFormData" {
  export default function getFormData(param: {region: any}): Promise<any>;
}
declare module "@salesforce/apex/FacebookListingFormController.getBoatsByClass" {
  export default function getBoatsByClass(param: {region: any, className: any}): Promise<any>;
}
declare module "@salesforce/apex/FacebookListingFormController.getBoatDetails" {
  export default function getBoatDetails(param: {region: any, stockNum: any}): Promise<any>;
}
declare module "@salesforce/apex/FacebookListingFormController.generateListing" {
  export default function generateListing(param: {region: any, payload: any}): Promise<any>;
}
declare module "@salesforce/apex/FacebookListingFormController.submitGenerateListingJob" {
  export default function submitGenerateListingJob(param: {region: any, payload: any}): Promise<any>;
}
declare module "@salesforce/apex/FacebookListingFormController.getGenerateListingJobStatus" {
  export default function getGenerateListingJobStatus(param: {jobId: any}): Promise<any>;
}
declare module "@salesforce/apex/FacebookListingFormController.saveListing" {
  export default function saveListing(param: {region: any, payload: any}): Promise<any>;
}
