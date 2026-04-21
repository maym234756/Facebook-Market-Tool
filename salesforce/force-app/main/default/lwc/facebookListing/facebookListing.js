import { LightningElement, track } from 'lwc';
import buildSignedUrl from '@salesforce/apex/FacebookListingUrlBuilder.buildSignedUrl';

/** Token refresh interval – 4 minutes (before the 5-min server-side expiry). */
const REFRESH_INTERVAL_MS = 4 * 60 * 1000;
const EMBED_PAGES = new Set(['listings', 'analytics', 'manager']);

export default class FacebookListing extends LightningElement {
    @track signedUrl    = null;
    @track isLoading    = true;
    @track errorMessage = null;

    _currentPage  = 'listings';
    _refreshTimer = null;

    connectedCallback() {
        this._loadUrl();
        this._refreshTimer = setInterval(() => this._loadUrl(), REFRESH_INTERVAL_MS);
    }

    disconnectedCallback() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    }

    handleTabChange(event) {
        const page = event.target.value;
        if (page && page !== this._currentPage) {
            this._currentPage = page;
            if (EMBED_PAGES.has(page)) {
                this._loadUrl();
            } else {
                // Create Listing tab — clear iframe state
                this.signedUrl    = null;
                this.isLoading    = false;
                this.errorMessage = null;
                if (this._refreshTimer) {
                    clearInterval(this._refreshTimer);
                    this._refreshTimer = null;
                }
            }
        }
    }

    get isCreateTab() { return this._currentPage === 'create'; }
    get isEmbedTab()  { return EMBED_PAGES.has(this._currentPage); }

    _loadUrl() {
        this.isLoading    = true;
        this.errorMessage = null;
        this.signedUrl    = null;

        // Restart refresh timer when switching back to an embed tab
        if (!this._refreshTimer) {
            this._refreshTimer = setInterval(() => this._loadUrl(), REFRESH_INTERVAL_MS);
        }

        buildSignedUrl({ page: this._currentPage })
            .then(url => {
                this.signedUrl = url;
                this.isLoading = false;
            })
            .catch(error => {
                this.isLoading    = false;
                this.errorMessage =
                    (error && error.body && error.body.message)
                        ? error.body.message
                        : 'Unable to load Facebook Listings. Contact your administrator.';
            });
    }
}
