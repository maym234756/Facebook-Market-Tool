import { LightningElement, track } from 'lwc';
import getFormData     from '@salesforce/apex/FacebookListingFormController.getFormData';
import getBoatsByClass from '@salesforce/apex/FacebookListingFormController.getBoatsByClass';
import getBoatDetails  from '@salesforce/apex/FacebookListingFormController.getBoatDetails';
import generateListing from '@salesforce/apex/FacebookListingFormController.generateListing';
import saveListing     from '@salesforce/apex/FacebookListingFormController.saveListing';
import getPhotoDownloadPayload from '@salesforce/apex/FacebookListingFormController.getPhotoDownloadPayload';

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
    @track isDownloadingPhotos = false;
    @track errorMessage  = null;
    @track successMessage = null;

    // -----------------------------------------------------------------------
    connectedCallback() {
        // Load top-level form data (regions, empty salespeople + classes)
        this._loadFormData('');
    }

    disconnectedCallback() {
        this._cancelActiveGeneration();
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

    handleDownloadSelectedPhotos() {
        const urls = this.photoItems.filter(p => p.selected).map(p => p.url);
        const fileName = (this.stockNum || 'boat') + '-selected-photos.zip';
        this._downloadPhotosAsZip(urls, fileName);
    }

    handleDownloadAllPhotos() {
        const urls = this.photoItems.map(p => p.url);
        const fileName = (this.stockNum || 'boat') + '-all-photos.zip';
        this._downloadPhotosAsZip(urls, fileName);
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
        this._clearMessages();

        // navigator.clipboard may be undefined or blocked by Lightning Web
        // Security.  A synchronous throw before the Promise is created would
        // never reach .catch(), producing a silent failure.  Try the modern
        // API first; fall back to execCommand if it is unavailable.
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(this.aiListing)
                    .then(() => { this.successMessage = 'Listing copied to clipboard!'; })
                    .catch(() => { this._execCommandCopy(); });
            } else {
                this._execCommandCopy();
            }
        } catch (e) {
            this._execCommandCopy();
        }
    }

    _execCommandCopy() {
        const textarea = this.template.querySelector('[data-role="clipboard-proxy"]');

        if (!textarea) {
            this.errorMessage = 'Could not copy to clipboard.';
            return;
        }

        try {
            textarea.value = this.aiListing;
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, this.aiListing.length);
            const ok = document.execCommand('copy');
            textarea.blur();
            if (ok) {
                this.successMessage = 'Listing copied to clipboard!';
            } else {
                this.errorMessage = 'Could not copy to clipboard.';
            }
        } catch (e) {
            this.errorMessage = 'Could not copy to clipboard.';
        }
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

    get cannotDownloadSelectedPhotos() {
        return this.isDownloadingPhotos
            || !this.photoItems.some(photo => photo.selected);
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

    // -----------------------------------------------------------------------
    // Photo download (fetches bytes server-side via Apex proxy in batches of 5
    // to stay under the Apex heap limit, assembles a single store-only ZIP
    // client-side, then triggers a browser download)
    // -----------------------------------------------------------------------
    _downloadPhotosAsZip(urls, zipFileName) {
        if (!urls || !urls.length) {
            this.errorMessage = 'No photos selected.';
            this.successMessage = null;
            return;
        }

        this._clearMessages();
        this.isDownloadingPhotos = true;

        // Split into batches of 5 to stay under the 6 MB Apex heap limit.
        // Each batch is fetched sequentially; results are accumulated then
        // assembled into one ZIP at the end.
        const BATCH_SIZE = 5;
        const batches = [];
        for (let i = 0; i < urls.length; i += BATCH_SIZE) {
            batches.push(urls.slice(i, i + BATCH_SIZE));
        }

        const allFiles = [];
        const runBatch = (index) => {
            if (index >= batches.length) {
                // All batches done — assemble the ZIP
                const valid = allFiles.filter(f => f && !f.error && f.base64);
                if (!valid.length) {
                    const firstError = allFiles.find(f => f && f.error);
                    this.errorMessage = 'Failed to download photos: '
                        + (firstError ? firstError.error : 'No valid files returned.');
                    this.isDownloadingPhotos = false;
                    return;
                }

                const entries = valid.map((f, idx) => ({
                    name: f.fileName || ('photo-' + (idx + 1)),
                    bytes: this._base64ToUint8Array(f.base64)
                }));

                const zipBytes = this._buildStoreZip(entries);
                const blob = new Blob([zipBytes], { type: 'application/zip' });
                this._triggerBrowserDownload(blob, zipFileName);

                const failedCount = allFiles.length - valid.length;
                this.successMessage = failedCount > 0
                    ? `Download ready. ${failedCount} photo(s) could not be fetched.`
                    : 'Photo download ready.';
                this.isDownloadingPhotos = false;
                return;
            }

            getPhotoDownloadPayload({ urls: batches[index] })
                .then(files => {
                    (Array.isArray(files) ? files : []).forEach(f => allFiles.push(f));
                    runBatch(index + 1);
                })
                .catch(err => {
                    this.errorMessage = this._extractMessage(err);
                    this.isDownloadingPhotos = false;
                });
        };

        runBatch(0);
    }

    _base64ToUint8Array(base64) {
        const binary = atob(String(base64 || ''));
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    _triggerBrowserDownload(blob, fileName) {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = this.template.querySelector('[data-role="download-link"]');

        if (!anchor) {
            this.errorMessage = 'Could not start the photo download.';
            this.successMessage = null;
            URL.revokeObjectURL(objectUrl);
            return;
        }

        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }

    /**
     * Build a minimal STORE-mode (no compression) ZIP archive from the given
     * entries. Each entry: { name: String, bytes: Uint8Array }. Store mode is
     * fine for already-compressed media (JPEG/PNG/WEBP) and avoids pulling in
     * a third-party compression library via Static Resources.
     */
    _buildStoreZip(entries) {
        const encoder = new TextEncoder();
        const localParts  = [];
        const centralParts = [];
        let offset = 0;
        const centralRecords = [];

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const nameBytes = encoder.encode(entry.name);
            const data = entry.bytes;
            const crc = this._crc32(data);
            const size = data.length;

            const localHeader = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(localHeader.buffer);
            lv.setUint32(0,  0x04034b50, true);
            lv.setUint16(4,  20, true);
            lv.setUint16(6,  0x0800, true);
            lv.setUint16(8,  0, true);
            lv.setUint16(10, 0, true);
            lv.setUint16(12, 0x0021, true);
            lv.setUint32(14, crc >>> 0, true);
            lv.setUint32(18, size, true);
            lv.setUint32(22, size, true);
            lv.setUint16(26, nameBytes.length, true);
            lv.setUint16(28, 0, true);
            localHeader.set(nameBytes, 30);

            localParts.push(localHeader, data);

            centralRecords.push({ nameBytes, crc, size, offset });
            offset += localHeader.length + size;
        }

        const centralStart = offset;
        for (let i = 0; i < centralRecords.length; i++) {
            const r = centralRecords[i];
            const central = new Uint8Array(46 + r.nameBytes.length);
            const cv = new DataView(central.buffer);
            cv.setUint32(0,  0x02014b50, true);
            cv.setUint16(4,  20, true);
            cv.setUint16(6,  20, true);
            cv.setUint16(8,  0x0800, true);
            cv.setUint16(10, 0, true);
            cv.setUint16(12, 0, true);
            cv.setUint16(14, 0x0021, true);
            cv.setUint32(16, r.crc >>> 0, true);
            cv.setUint32(20, r.size, true);
            cv.setUint32(24, r.size, true);
            cv.setUint16(28, r.nameBytes.length, true);
            cv.setUint16(30, 0, true);
            cv.setUint16(32, 0, true);
            cv.setUint16(34, 0, true);
            cv.setUint16(36, 0, true);
            cv.setUint32(38, 0, true);
            cv.setUint32(42, r.offset, true);
            central.set(r.nameBytes, 46);
            centralParts.push(central);
            offset += central.length;
        }
        const centralSize = offset - centralStart;

        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0,  0x06054b50, true);
        ev.setUint16(4,  0, true);
        ev.setUint16(6,  0, true);
        ev.setUint16(8,  centralRecords.length, true);
        ev.setUint16(10, centralRecords.length, true);
        ev.setUint32(12, centralSize, true);
        ev.setUint32(16, centralStart, true);
        ev.setUint16(20, 0, true);

        const total = offset + eocd.length;
        const out = new Uint8Array(total);
        let p = 0;
        for (let i = 0; i < localParts.length; i++) {
            out.set(localParts[i], p);
            p += localParts[i].length;
        }
        for (let i = 0; i < centralParts.length; i++) {
            out.set(centralParts[i], p);
            p += centralParts[i].length;
        }
        out.set(eocd, p);
        return out;
    }

    _crc32(bytes) {
        let table = FacebookListingCreate._crcTable;
        if (!table) {
            table = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) {
                    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
                }
                table[n] = c >>> 0;
            }
            FacebookListingCreate._crcTable = table;
        }
        let crc = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) {
            crc = (table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
        }
        return (crc ^ 0xffffffff) >>> 0;
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

    _buildGenerateRequestKey() {
        // Retained as a no-op stub for backward compatibility; the async
        // generation pipeline was removed pending deployment of its backend
        // (FacebookListingGenerationJobService + FacebookListingGenerationJob__c).
        return '';
    }

    _stopGeneratePolling() {
        // No-op: async generation disabled.
    }

    _cancelActiveGeneration() {
        // No-op: async generation disabled. Generation runs synchronously via
        // FacebookListingFormController.generateListing.
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
