import { LightningElement, track } from 'lwc';
import getFormData     from '@salesforce/apex/FacebookListingFormController.getFormData';
import getBoatsByClass from '@salesforce/apex/FacebookListingFormController.getBoatsByClass';
import getBoatDetails  from '@salesforce/apex/FacebookListingFormController.getBoatDetails';
import generateListing from '@salesforce/apex/FacebookListingFormController.generateListing';
import submitGenerateListingJob from '@salesforce/apex/FacebookListingFormController.submitGenerateListingJob';
import getGenerateListingJobStatus from '@salesforce/apex/FacebookListingFormController.getGenerateListingJobStatus';
import saveListing     from '@salesforce/apex/FacebookListingFormController.saveListing';

const GENERATE_JOB_POLL_INTERVAL_MS = 3000;
const GENERATE_JOB_POLL_MAX_ATTEMPTS = 40;
const USE_ASYNC_GENERATION = true;

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
    @track photoItems = [];

    // ---- UI state ----
    @track isGenerating  = false;
    @track isSaving      = false;
    @track errorMessage  = null;
    @track successMessage = null;

    _activeGenerationJobId = null;
    _activeGenerationRequestKey = null;
    _generatePollAttempts = 0;
    _generatePollTimer = null;

    // -----------------------------------------------------------------------
    connectedCallback() {
        if (!document.getElementById('fb-dark-bg')) {
            const s = document.createElement('style');
            s.id = 'fb-dark-bg';
            s.textContent = 'html,body{background:#061a38!important}';
            document.head.appendChild(s);
        }
        // Load top-level form data (regions, empty salespeople + classes)
        this._loadFormData('');
    }

    disconnectedCallback() {
        this._cancelActiveGeneration();
        const s = document.getElementById('fb-dark-bg');
        if (s) s.remove();
    }

    // -----------------------------------------------------------------------
    // Region change
    // -----------------------------------------------------------------------
    handleRegionChange(event) {
        this._cancelActiveGeneration();
        this.region          = event.detail.value;
        this.salespersonName = '';
        this.className       = '';
        this.stockNum        = '';
        this.boatDetails     = null;
        this.photoItems      = [];
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
        this._cancelActiveGeneration();
        this.className   = event.detail.value;
        this.stockNum    = '';
        this.boatDetails = null;
        this.photoItems  = [];
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
        this._cancelActiveGeneration();
        this.stockNum = event.detail.value;
        this.boatDetails = null;
        this.photoItems = [];
        this._clearMessages();
        if (this.stockNum) {
            getBoatDetails({ region: this.region, stockNum: this.stockNum })
                .then(details => {
                    this.boatDetails = details;
                    this.photoItems = this._buildPhotoItems(details);
                })
                .catch(err => { this.errorMessage = this._extractMessage(err); });
        }
    }

    handlePhotoToggle(event) {
        const targetUrl = event.target.dataset.url;
        const isSelected = event.target.checked;

        this.photoItems = this.photoItems.map(photo => (
            photo.url === targetUrl
                ? { ...photo, selected: isSelected }
                : photo
        ));
    }

    handleSelectAllPhotos() {
        if (!this.photoItems.length) {
            return;
        }

        this._clearMessages();
        this.photoItems = this.photoItems.map(photo => ({ ...photo, selected: true }));
        this.successMessage = 'All photos selected.';
    }

    handleOpenSelectedPhotos() {
        this._openPhotoUrls(
            this.photoItems
                .filter(photo => photo.selected)
                .map(photo => photo.url)
        );
    }

    handleOpenAllPhotos() {
        this._openPhotoUrls(this.photoItems.map(photo => photo.url));
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
        this._cancelActiveGeneration();
        this._clearMessages();
        this.isGenerating = true;
        this.aiListing    = '';

        const payload = this._buildGeneratePayload();

        if (USE_ASYNC_GENERATION) {
            this._submitGenerateListingJob(payload);
            return;
        }

        this._generateListingSynchronously(payload);
    }

    _submitGenerateListingJob(payload) {
        const requestKey = this._buildGenerateRequestKey(payload);
        this._activeGenerationRequestKey = requestKey;

        submitGenerateListingJob({ region: this.region, payload })
            .then(result => {
                if (requestKey !== this._activeGenerationRequestKey) {
                    return;
                }

                this._activeGenerationJobId = result.jobId;
                this._generatePollAttempts = 0;
                this._startGeneratePolling(requestKey);
            })
            .catch(() => {
                if (requestKey === this._activeGenerationRequestKey) {
                    this._activeGenerationRequestKey = null;
                }
                this._generateListingSynchronously(payload);
            });
    }

    _startGeneratePolling(requestKey) {
        this._stopGeneratePolling();
        this._pollGenerateJob(requestKey);
        this._generatePollTimer = window.setInterval(() => {
            this._pollGenerateJob(requestKey);
        }, GENERATE_JOB_POLL_INTERVAL_MS);
    }

    _pollGenerateJob(requestKey) {
        if (!this._activeGenerationJobId || requestKey !== this._activeGenerationRequestKey) {
            return;
        }

        if (this._generatePollAttempts >= GENERATE_JOB_POLL_MAX_ATTEMPTS) {
            this._cancelActiveGeneration();
            this.errorMessage = 'Generation is taking longer than expected. Please try again shortly.';
            return;
        }

        this._generatePollAttempts += 1;

        getGenerateListingJobStatus({ jobId: this._activeGenerationJobId })
            .then(result => {
                if (requestKey !== this._activeGenerationRequestKey) {
                    return;
                }

                if (!result || !result.isTerminal) {
                    return;
                }

                this._stopGeneratePolling();
                this.isGenerating = false;

                if (result.status === 'Completed') {
                    this.aiListing = result.resultText || '';
                    if (!this.aiListing) {
                        this.errorMessage = 'Generation completed without listing text.';
                    }
                } else {
                    this.errorMessage = result.errorText || 'Failed to generate listing.';
                }

                this._activeGenerationJobId = null;
                this._activeGenerationRequestKey = null;
                this._generatePollAttempts = 0;
            })
            .catch(err => {
                if (requestKey !== this._activeGenerationRequestKey) {
                    return;
                }

                this._cancelActiveGeneration();
                this.errorMessage = this._extractMessage(err);
            });
    }

    _generateListingSynchronously(payload) {
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
        this._cancelActiveGeneration();
        this._resetFormFields();
        this._clearMessages();
    }

    _resetFormFields() {
        this.salespersonName = '';
        this.className       = '';
        this.stockNum        = '';
        this.boatDetails     = null;
        this.photoItems      = [];
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

    get hasBoatPhotos() {
        return this.photoItems.length > 0;
    }

    get cannotOpenSelectedPhotos() {
        return !this.photoItems.some(photo => photo.selected);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    _buildPhotoItems(details) {
        const images = details && Array.isArray(details.images) ? details.images : [];

        return images
            .map(url => (typeof url === 'string' ? url.trim() : ''))
            .filter(url => !!url)
            .map((url, index) => ({
                id: `photo-${index + 1}`,
                url,
                alt: `Boat photo ${index + 1}`,
                linkTitle: `Open photo ${index + 1}`,
                checkboxTitle: `Select photo ${index + 1}`,
                selected: false
            }));
    }

    _openPhotoUrls(urls) {
        if (!urls.length) {
            this.errorMessage = 'No photos selected.';
            this.successMessage = null;
            return;
        }

        this._clearMessages();
        urls.forEach(url => {
            window.open(url, '_blank', 'noopener');
        });

        this.successMessage = urls.length === 1
            ? 'Opened 1 photo.'
            : `Opened ${urls.length} photos.`;
    }

    _buildGeneratePayload() {
        return {
            salespersonName: this.salespersonName,
            classification: this.boatDetails ? this.boatDetails.classification : this.className,
            boatInfo: this.boatDetails ? this.boatDetails.boatInfo : '',
            stockNum: this.stockNum,
            price: this.boatDetails ? this.boatDetails.price : '',
            hours: this.boatDetails ? this.boatDetails.hours : '',
            motorInfo: this.boatDetails ? this.boatDetails.motorInfo : '',
            options: this.boatDetails ? this.boatDetails.options : '',
            websiteDesc: this.boatDetails ? this.boatDetails.websiteDesc : '',
            websiteOptions: this.boatDetails ? this.boatDetails.websiteOptions : ''
        };
    }

    _buildGenerateRequestKey(payload) {
        return [
            this.region,
            this.stockNum,
            payload.salespersonName,
            String(Date.now())
        ].join(':');
    }

    _stopGeneratePolling() {
        if (this._generatePollTimer) {
            window.clearInterval(this._generatePollTimer);
            this._generatePollTimer = null;
        }
    }

    _cancelActiveGeneration() {
        this._stopGeneratePolling();
        this._activeGenerationJobId = null;
        this._activeGenerationRequestKey = null;
        this._generatePollAttempts = 0;
        this.isGenerating = false;
    }

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
