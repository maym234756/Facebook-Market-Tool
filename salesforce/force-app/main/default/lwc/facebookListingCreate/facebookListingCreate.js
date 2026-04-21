import { LightningElement, track } from 'lwc';
import getFormData     from '@salesforce/apex/FacebookListingFormController.getFormData';
import getBoatsByClass from '@salesforce/apex/FacebookListingFormController.getBoatsByClass';
import getBoatDetails  from '@salesforce/apex/FacebookListingFormController.getBoatDetails';
import generateListing from '@salesforce/apex/FacebookListingFormController.generateListing';
import saveListing     from '@salesforce/apex/FacebookListingFormController.saveListing';

export default class FacebookListingCreate extends LightningElement {

    // ---- form state ----
    @track region         = '';
    @track salespersonName = '';
    @track className      = '';
    @track stockNum       = '';
    @track bmbBoard       = '';
    @track video          = '';
    @track listingLink    = '';
    @track aiListing      = '';

    // ---- picklist options ----
    @track regionOptions     = [];
    @track salespersonOptions = [];
    @track classOptions      = [];
    @track boatOptions       = [];

    // ---- loaded boat record ----
    @track boatDetails = null;

    // ---- UI state ----
    @track isGenerating  = false;
    @track isSaving      = false;
    @track errorMessage  = null;
    @track successMessage = null;

    // -----------------------------------------------------------------------
    connectedCallback() {
        if (!document.getElementById('fb-dark-bg')) {
            const s = document.createElement('style');
            s.id = 'fb-dark-bg';
            s.textContent = 'html,body{overflow:hidden!important;background:#061a38!important}';
            document.head.appendChild(s);
        }
        // Load top-level form data (regions, empty salespeople + classes)
        this._loadFormData('');
    }

    disconnectedCallback() {
        const s = document.getElementById('fb-dark-bg');
        if (s) s.remove();
    }

    // -----------------------------------------------------------------------
    // Region change
    // -----------------------------------------------------------------------
    handleRegionChange(event) {
        this.region          = event.detail.value;
        this.salespersonName = '';
        this.className       = '';
        this.stockNum        = '';
        this.boatDetails     = null;
        this.boatOptions     = [];
        this._clearMessages();
        this._loadFormData(this.region);
    }

    _loadFormData(region) {
        getFormData({ region })
            .then(data => {
                this.regionOptions = (data.regions || []).map(r => ({ label: r, value: r }));
                this.salespersonOptions = (data.salespeople || []).map(s => ({ label: s, value: s }));
                this.classOptions = (data.classes || []).map(c => ({ label: c, value: c }));
            })
            .catch(err => { this.errorMessage = this._extractMessage(err); });
    }

    // -----------------------------------------------------------------------
    // Salesperson
    // -----------------------------------------------------------------------
    handleSalespersonChange(event) {
        this.salespersonName = event.detail.value;
        this._clearMessages();
    }

    // -----------------------------------------------------------------------
    // Class change → load boats
    // -----------------------------------------------------------------------
    handleClassChange(event) {
        this.className   = event.detail.value;
        this.stockNum    = '';
        this.boatDetails = null;
        this._clearMessages();
        if (this.className) {
            getBoatsByClass({ region: this.region, className: this.className })
                .then(boats => {
                    this.boatOptions = (boats || []).map(b => ({
                        label: b.boatInfo + (b.stockNum ? ' — ' + b.stockNum : '') + (b.salePrice ? '  ' + b.salePrice : ''),
                        value: b.stockNum
                    }));
                })
                .catch(err => { this.errorMessage = this._extractMessage(err); });
        } else {
            this.boatOptions = [];
        }
    }

    // -----------------------------------------------------------------------
    // Boat change → load details
    // -----------------------------------------------------------------------
    handleBoatChange(event) {
        this.stockNum = event.detail.value;
        this.boatDetails = null;
        this._clearMessages();
        if (this.stockNum) {
            getBoatDetails({ region: this.region, stockNum: this.stockNum })
                .then(details => { this.boatDetails = details; })
                .catch(err => { this.errorMessage = this._extractMessage(err); });
        }
    }

    // -----------------------------------------------------------------------
    // Optional fields
    // -----------------------------------------------------------------------
    handleBmbChange(event)   { this.bmbBoard    = event.detail.value; }
    handleVideoChange(event) { this.video        = event.detail.value; }
    handleLinkChange(event)  { this.listingLink  = event.detail.value; }
    handleListingTextChange(event) { this.aiListing = event.detail.value; }

    // -----------------------------------------------------------------------
    // Generate listing
    // -----------------------------------------------------------------------
    handleGenerate() {
        if (this.cannotGenerate) return;
        this._clearMessages();
        this.isGenerating = true;
        this.aiListing    = '';

        const payload = {
            salespersonName:  this.salespersonName,
            classification:   this.boatDetails ? this.boatDetails.classification : this.className,
            boatInfo:         this.boatDetails ? this.boatDetails.boatInfo        : '',
            stockNum:         this.stockNum,
            price:            this.boatDetails ? this.boatDetails.price           : '',
            hours:            this.boatDetails ? this.boatDetails.hours           : '',
            motorInfo:        this.boatDetails ? this.boatDetails.motorInfo       : '',
            options:          this.boatDetails ? this.boatDetails.options         : '',
            websiteDesc:      this.boatDetails ? this.boatDetails.websiteDesc     : '',
            websiteOptions:   this.boatDetails ? this.boatDetails.websiteOptions  : ''
        };

        generateListing({ region: this.region, payload })
            .then(text => {
                this.aiListing    = text;
                this.isGenerating = false;
            })
            .catch(err => {
                this.isGenerating = false;
                this.errorMessage = this._extractMessage(err);
            });
    }

    // -----------------------------------------------------------------------
    // Save listing → Google Sheets
    // -----------------------------------------------------------------------
    handleSave() {
        if (this.cannotSave) return;
        this._clearMessages();
        this.isSaving = true;

        const payload = {
            salespersonName: this.salespersonName,
            stockNum:        this.stockNum,
            price:           this.boatDetails ? this.boatDetails.price : '',
            bmbBoard:        this.bmbBoard,
            video:           this.video,
            aiListing:       this.aiListing,
            link:            this.listingLink
        };

        saveListing({ region: this.region, payload })
            .then(() => {
                this.isSaving       = false;
                this.successMessage = 'Listing saved to Google Sheets successfully!';
                this._resetFormFields();
            })
            .catch(err => {
                this.isSaving     = false;
                this.errorMessage = this._extractMessage(err);
            });
    }

    // -----------------------------------------------------------------------
    // Copy listing to clipboard
    // -----------------------------------------------------------------------
    handleCopyListing() {
        if (!this.aiListing) return;
        navigator.clipboard.writeText(this.aiListing)
            .then(() => { this.successMessage = 'Listing copied to clipboard!'; })
            .catch(() => { this.errorMessage = 'Could not copy to clipboard.'; });
    }

    // -----------------------------------------------------------------------
    // Reset
    // -----------------------------------------------------------------------
    handleReset() {
        this._resetFormFields();
        this._clearMessages();
    }

    _resetFormFields() {
        this.salespersonName = '';
        this.className       = '';
        this.stockNum        = '';
        this.boatDetails     = null;
        this.bmbBoard        = '';
        this.video           = '';
        this.listingLink     = '';
        this.aiListing       = '';
        this.boatOptions     = [];
    }

    // -----------------------------------------------------------------------
    // Computed properties
    // -----------------------------------------------------------------------
    get noRegion()      { return !this.region; }
    get noClass()       { return !this.className; }

    get ynOptions() {
        return [
            { label: 'Y', value: 'Y' },
            { label: 'N', value: 'N' }
        ];
    }

    get cannotGenerate() {
        return this.isGenerating
            || !this.region
            || !this.salespersonName
            || !this.stockNum;
    }

    get cannotCopy() {
        return !this.aiListing;
    }

    get cannotSave() {
        return this.isSaving
            || !this.region
            || !this.salespersonName
            || !this.stockNum
            || !this.aiListing;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    _clearMessages() {
        this.errorMessage   = null;
        this.successMessage = null;
    }

    _extractMessage(err) {
        return (err && err.body && err.body.message)
            ? err.body.message
            : 'An unexpected error occurred. Please try again.';
    }
}
