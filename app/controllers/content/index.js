import Controller from '@ember/controller';
import { A } from '@ember/array';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import DS from 'ember-data';
import loadAll from 'ember-osf/utils/load-relationship';
import config from 'ember-get-config';
import Analytics from 'ember-osf/mixins/analytics';
import permissions from 'ember-osf/const/permissions';
import fileDownloadPath from '../../utils/file-download-path';


const { PromiseArray } = DS;

/**
 * Takes an object with query parameter name as the key and value,
 * or [value, maxLength] as the values.
 *
 * @method queryStringify
 * @param queryParams {!object}
 * @param queryParams.key {!array|!string}
 * @param queryParams.key[0] {!string}
 * @param queryParams.key[1] {int}
 * @return {string}
 */

const DATE_LABEL = {
    created: 'content.date_label.created_on',
    submitted: 'content.date_label.submitted_on',
};
const PRE_MODERATION = 'pre-moderation';
const REJECTED = 'rejected';
const INITIAL = 'initial';

/**
 * @module ember-preprints
 * @submodule controllers
 */

/**
 * @class Content Controller
 */
export default Controller.extend(Analytics, {
    theme: service(),
    currentUser: service(),
    queryParams: {
        chosenFile: 'file',
    },
    fullScreenMFR: false,
    expandedAuthors: true,
    showLicenseText: false,
    activeFile: null,
    chosenFile: null,
    expandedAbstract: navigator.userAgent.includes('Prerender'),
    hasTag: computed.bool('model.tags.length'),
    metricsExtra: computed('model', function() {
        return this.get('model.id');
    }),
    title: computed('model', function() {
        return this.get('model.title');
    }),
    fullDescription: computed('model', function() {
        return this.get('model.description');
    }),
    hyperlink: computed('model', function() {
        return window.location.href;
    }),
    fileDownloadURL: computed('model', function() {
        return fileDownloadPath(this.get('model.primaryFile'), this.get('model'));
    }),
    allowCommenting: computed('model.provider', 'model', function() {
        return this.get('model.provider').get('allowCommenting') && this.get('model.isPublished');
    }),
    facebookAppId: computed('model', function() {
        return this.get('model.provider.facebookAppId') ? this.get('model.provider.facebookAppId') : config.FB_APP_ID;
    }),
    supplementalMaterialDisplayLink: computed('node.links.html', function() {
        const supplementalLink = this.get('node.links.html');
        return supplementalLink.replace(/^https?:\/\//i, '');
    }),
    dateLabel: computed('model.provider.reviewsWorkflow', function() {
        return this.get('model.provider.reviewsWorkflow') === PRE_MODERATION ?
            DATE_LABEL.submitted :
            DATE_LABEL.created;
    }),
    relevantDate: computed('model.provider.reviewsWorkflow', function() {
        return this.get('model.provider.reviewsWorkflow') ?
            this.get('model.dateLastTransitioned') :
            this.get('model.dateCreated');
    }),

    editButtonLabel: computed('model.{provider.reviewsWorkflow,reviewsState}', function () {
        const editPreprint = 'content.project_button.edit_preprint';
        const editResubmitPreprint = 'content.project_button.edit_resubmit_preprint';
        return (
            this.get('model.provider.reviewsWorkflow') === PRE_MODERATION
            && this.get('model.reviewsState') === REJECTED
        ) ? editResubmitPreprint : editPreprint;
    }),

    isAdmin: computed('model', function() {
        // True if the current user has admin permissions for the node that contains the preprint
        return (this.get('model.currentUserPermissions') || []).includes(permissions.ADMIN);
    }),

    userIsContrib: computed('authors.[]', 'isAdmin', 'currentUser.currentUserId', function() {
        if (this.get('isAdmin')) {
            return true;
        } else if (this.get('authors').length) {
            const authorIds = this.get('authors').map((author) => {
                return author.get('userId');
            });
            return this.get('currentUser.currentUserId') ? authorIds.includes(this.get('currentUser.currentUserId')) : false;
        }
        return false;
    }),

    showStatusBanner: computed('model.{provider.reviewsWorkflow,reviewsState}', 'userIsContrib', function() {
        return (
            this.get('model.provider.reviewsWorkflow')
            && this.get('userIsContrib')
            && this.get('model.reviewsState') !== INITIAL
        );
    }),

    disciplineReduced: computed('model.subjects', function() {
        // Preprint disciplines are displayed in collapsed form on content page
        return this.get('model.subjects').reduce((acc, val) => acc.concat(val), []).uniqBy('id');
    }),
    /* eslint-disable ember/named-functions-in-promises */
    authors: computed('model', function() {
        // Cannot be called until node has loaded!
        const model = this.get('model');
        const contributors = A();
        return PromiseArray.create({
            promise: loadAll(model, 'contributors', contributors)
                .then(() => contributors),
        });
    }),
    /* eslint-enable ember/named-functions-in-promises */
    fullLicenseText: computed('model.{license.text,licenseRecord}', function() {
        const text = this.get('model.license.text') || '';
        const { year = '', copyright_holders = [] } = this.get('model.licenseRecord'); /* eslint-disable-line camelcase */
        return text
            .replace(/({{year}})/g, year)
            .replace(/({{copyrightHolders}})/g, copyright_holders.join(', '));
    }),

    hasShortenedDescription: computed('model.description', function() {
        const description = this.get('model.description');

        return description && description.length > 350;
    }),

    useShortenedDescription: computed('expandedAbstract', 'hasShortenedDescription', function() {
        return this.get('hasShortenedDescription') && !this.get('expandedAbstract');
    }),

    description: computed('model.description', function() {
        // Get a shortened version of the abstract, but doesn't cut in the middle of word by going
        // to the last space.
        return this.get('model.description')
            .slice(0, 350)
            .replace(/\s+\S*$/, '');
    }),

    emailHref: computed('model', function() {
        const titleEncoded = encodeURIComponent(this.get('model.title'));
        const hrefEncoded = encodeURIComponent(window.location.href);
        return `mailto:?subject=${titleEncoded}&body=${hrefEncoded}`;
    }),

    actions: {
        toggleLicenseText() {
            const licenseState = this.toggleProperty('showLicenseText') ? 'Expand' : 'Contract';
            this.get('metrics')
                .trackEvent({
                    category: 'button',
                    action: 'click',
                    label: `Content - License ${licenseState}`,
                });
        },
        expandMFR() {
            // State of fullScreenMFR before the transition (what the user perceives as the action)
            const beforeState = this.toggleProperty('fullScreenMFR') ? 'Expand' : 'Contract';

            this.get('metrics')
                .trackEvent({
                    category: 'button',
                    action: 'click',
                    label: `Content - MFR ${beforeState}`,
                });
        },
        expandAbstract() {
            this.toggleProperty('expandedAbstract');
        },
        // Metrics are handled in the component
        chooseFile(fileItem) {
            if (!fileItem) return;

            this.setProperties({
                chosenFile: fileItem.get('id'),
                activeFile: fileItem,
            });
        },
        shareLink(href, category, action, label, extra) {
            const metrics = this.get('metrics');

            // TODO submit PR to ember-metrics for a trackSocial function for Google Analytics.
            // For now, we'll use trackEvent.
            metrics.trackEvent({
                category,
                action,
                label,
                extra,
            });

            if (label.includes('email')) { return; }

            window.open(href, '', 'menubar=no,toolbar=no,resizable=yes,scrollbars=yes,width=600,height=400');
            return false;
        },
        // Sends Event to GA/Keen as normal. Sends second event to Keen under
        // "non-contributor-preprint-downloads" collection to track non contributor
        // preprint downloads specifically.
        dualTrackNonContributors(category, label, url, primary) {
            this.send('click', category, label, url); // Sends event to both Google Analytics and Keen.

            const eventData = {
                download_info: {
                    preprint: {
                        type: 'preprint',
                        id: this.get('model.id'),
                    },
                    file: {
                        id: primary ? this.get('model.primaryFile.id') : this.get('activeFile.id'),
                        primaryFile: primary,
                        version: primary ? this.get('model.primaryFile.currentVersion') : this.get('activeFile.currentVersion'),
                    },
                },
                interaction: {
                    category,
                    action: 'click',
                    label: `${label} as Non-Contributor`,
                    url,
                },
            };

            const keenPayload = {
                collection: 'non-contributor-preprint-downloads',
                eventData,
                node: this.get('node'),
            };

            if (!this.get('userIsContrib')) {
                this.get('metrics').invoke('trackSpecificCollection', 'Keen', keenPayload); // Sends event to Keen if logged-in user is not a contributor or non-authenticated user
            }
        },
    },

    _returnContributors(contributors) {
        return contributors;
    },
});
