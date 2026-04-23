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
declare module "@salesforce/apex/FacebookListingFormController.saveListing" {
  export default function saveListing(param: {region: any, payload: any}): Promise<any>;
}
declare module "@salesforce/apex/FacebookListingFormController.getPhotoDownloadPayload" {
  export default function getPhotoDownloadPayload(param: {urls: any}): Promise<any>;
}
