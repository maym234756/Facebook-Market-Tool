import { LightningElement, track } from 'lwc';
import buildSignedUrl from '@salesforce/apex/FacebookListingUrlBuilder.buildSignedUrl';

/** Refresh all embed URLs 1 minute before the 5-min server-side expiry. */
const REFRESH_INTERVAL_MS = 4 * 60 * 1000;
const EMBED_PAGES = ['listings', 'analytics', 'manager'];

export default class FacebookListing extends LightningElement {

    // Per-tab URL state
    @track listingsUrl  = null;
    @track analyticsUrl = null;
    @track managerUrl   = null;

    // Per-tab loading state
    @track listingsLoading  = true;
    @track analyticsLoading = true;
    @track managerLoading   = true;

    // Per-tab error state
    @track listingsError  = null;
    @track analyticsError = null;
    @track managerError   = null;

    _refreshTimer = null;

    connectedCallback() {
        this._loadAllUrls();
        this._refreshTimer = setInterval(() => this._loadAllUrls(), REFRESH_INTERVAL_MS);
        // Paint the entire SF page dark so no grey bleeds through below/beside our component
        if (!document.getElementById('fb-dark-bg')) {
            const s = document.createElement('style');
            s.id = 'fb-dark-bg';
            s.textContent = 'html,body{background:#061a38!important}';
            document.head.appendChild(s);
        }
        // Make the lightning-tabset tab labels white so they're visible on the dark bar
        if (!document.getElementById('fb-tab-style')) {
            const t = document.createElement('style');
            t.id = 'fb-tab-style';
            t.textContent = [
                '.slds-tabs_default__link,',
                '.slds-tabs_default__link:hover,',
                '.slds-tabs_default__link:focus {',
                '  color: #ffffff !important;',
                '}'
            ].join('\n');
            document.head.appendChild(t);
        }
    }

    handleTabSelect() {
        // reserved for future tab-specific logic
    }

    disconnectedCallback() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
        ['fb-dark-bg', 'fb-tab-style'].forEach(id => {
            const s = document.getElementById(id);
            if (s) s.remove();
        });
    }

    _loadAllUrls() {
        EMBED_PAGES.forEach(page => this._loadUrl(page));
    }

    _loadUrl(page) {
        this[page + 'Loading'] = true;
        this[page + 'Error']   = null;
        this[page + 'Url']     = null;

        buildSignedUrl({ page })
            .then(url => {
                this[page + 'Url']     = url;
                this[page + 'Loading'] = false;
            })
            .catch(error => {
                this[page + 'Loading'] = false;
                this[page + 'Error']   =
                    (error && error.body && error.body.message)
                        ? error.body.message
                        : 'Unable to load. Contact your administrator.';
            });
    }
}
