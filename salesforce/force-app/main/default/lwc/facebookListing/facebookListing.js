import { LightningElement, track } from 'lwc';
import buildSignedUrl from '@salesforce/apex/FacebookListingUrlBuilder.buildSignedUrl';

const EMBED_PAGES = ['listings', 'analytics', 'manager', 'index'];

export default class FacebookListing extends LightningElement {

    // Per-tab URL state
    @track listingsUrl  = null;
    @track analyticsUrl = null;
    @track managerUrl   = null;
    @track indexUrl     = null;

    // Per-tab loading state
    @track listingsLoading  = true;
    @track analyticsLoading = true;
    @track managerLoading   = true;
    @track indexLoading     = true;

    // Per-tab error state
    @track listingsError  = null;
    @track analyticsError = null;
    @track managerError   = null;
    @track indexError     = null;

    _resizeHandler = null;
    _rafHandle = null;

    connectedCallback() {
        this._loadAllUrls(false);
        // No auto-refresh timer: assigning a new src to an iframe always
        // causes a real reload, which interrupts the user mid-session.
        // The Apex token TTL is set long enough (8 hours) to outlast any
        // realistic single session — users get a fresh token on each
        // tab/page load.
        // Size iframes to fit the viewport exactly, avoiding outer-page scroll
        this._resizeHandler = () => this._sizeFrames();
        window.addEventListener('resize', this._resizeHandler);
        window.addEventListener('orientationchange', this._resizeHandler);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this._resizeHandler);
        }
        // Style the lightning-tabset: white tab labels + dark navy tab content
        // panel (so no Salesforce grey/white shows around our component).
        // Scoped to .slds-tabs_default__* so it only affects tab content,
        // not the rest of the Salesforce UI.
        if (!document.getElementById('fb-tab-style')) {
            const t = document.createElement('style');
            t.id = 'fb-tab-style';
            t.textContent = [
                '.slds-tabs_default__link,',
                '.slds-tabs_default__link:hover,',
                '.slds-tabs_default__link:focus {',
                '  color: #ffffff !important;',
                '}',
                '.slds-tabs_default__content.slds-show {',
                '  padding: 0 !important;',
                '  overflow: hidden !important;',
                '  background: #061a38 !important;',
                '}',
                '.slds-tabs_default__nav {',
                '  padding-top: 0 !important;',
                '}'
            ].join('\n');
            document.head.appendChild(t);
        }
    }

    renderedCallback() {
        // Defer to after browser layout so getBoundingClientRect is accurate
        if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
        this._rafHandle = requestAnimationFrame(() => {
            this._rafHandle = null;
            this._sizeFrames();
        });
    }

    handleTabSelect() {
        // reserved for future tab-specific logic
    }

    disconnectedCallback() {
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            window.removeEventListener('orientationchange', this._resizeHandler);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', this._resizeHandler);
            }
            this._resizeHandler = null;
        }
        if (this._rafHandle) {
            cancelAnimationFrame(this._rafHandle);
            this._rafHandle = null;
        }
        ['fb-tab-style'].forEach(id => {
            const s = document.getElementById(id);
            if (s) s.remove();
        });
    }

    _sizeFrames() {
        const host = this.template.host;
        if (!host) return;

        // ── Mobile (Salesforce Mobile app, phone browsers) ──
        // On phones the LWC sits inside Salesforce's own scroll container,
        // and the component's rect.top can be hundreds of pixels below the
        // top of the viewport (Salesforce header + tab strip). Subtracting
        // rect.top from window.innerHeight then leaves the iframe filling
        // only the lower half of the screen.
        //
        // We must detect BOTH portrait and landscape phones:
        //   - Portrait phone: innerWidth < 768  (e.g. 390x844)
        //   - Landscape phone: innerHeight < 600 (e.g. 844x390, 932x430)
        // A landscape phone has innerWidth ~812-932, which would otherwise
        // fall through to the desktop branch and clip ~3/4 of the screen.
        //
        // The Salesforce Mobile app does not render the desktop utility
        // footer, so we don't need a FOOTER_RESERVE on phones either.
        // Just stretch host + iframe to 100dvh and let Salesforce's own
        // scroll container handle positioning.
        const isPhone = window.innerWidth < 768 || window.innerHeight < 600;
        if (isPhone) {
            host.style.height = '100dvh';
            this.template.querySelectorAll('.listing-frame').forEach(f => {
                if (f.style.height !== '100dvh') f.style.height = '100dvh';
            });
            return;
        }

        // ── Desktop ──
        const hostTop = host.getBoundingClientRect().top;
        if (hostTop <= 0) return;

        // Reserve space for Lightning's bottom utility bar (Quick Links,
        // Open Tasks, How-To Videos) so our component never extends past
        // the visible viewport and creates an outer-page scroll.
        const FOOTER_RESERVE = 40;

        // Clamp the host itself so it never extends past the viewport bottom.
        // This is the definitive fix for outer-page scroll regardless of what
        // Lightning's tab panel adds below our component.
        const hostHeight = window.innerHeight - hostTop - FOOTER_RESERVE;
        host.style.height = hostHeight + 'px';

        // Size each visible iframe to fill from its own top to the viewport bottom.
        // Only write the style when the value actually changes to avoid reflow flicker.
        this.template.querySelectorAll('.listing-frame').forEach(f => {
            const rect = f.getBoundingClientRect();
            if (rect.top > 0 && rect.width > 0) {
                const newH = Math.max(200, window.innerHeight - rect.top - FOOTER_RESERVE) + 'px';
                if (f.style.height !== newH) f.style.height = newH;
            }
        });
    }

    _loadAllUrls(silent = false) {
        EMBED_PAGES.forEach(page => this._loadUrl(page, silent));
    }

    _loadUrl(page, silent = false) {
        if (!silent) {
            // First load: show spinner
            this[page + 'Loading'] = true;
            this[page + 'Error']   = null;
            this[page + 'Url']     = null;
        }

        buildSignedUrl({ page })
            .then(url => {
                // Swap URL in silently — no spinner, no blank flash
                this[page + 'Url']     = url;
                this[page + 'Loading'] = false;
                this[page + 'Error']   = null;
            })
            .catch(error => {
                // Only show error on first load; suppress on silent refresh
                if (!silent) {
                    this[page + 'Loading'] = false;
                    this[page + 'Error']   =
                        (error && error.body && error.body.message)
                            ? error.body.message
                            : 'Unable to load. Contact your administrator.';
                }
            });
    }
}
