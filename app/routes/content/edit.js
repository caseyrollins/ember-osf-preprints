import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import Route from '@ember/routing/route';

import Analytics from 'ember-osf/mixins/analytics';
import config from 'ember-get-config';
import permissions from 'ember-osf/const/permissions';
import ConfirmationMixin from 'ember-onbeforeunload/mixins/confirmation';

import ResetScrollMixin from '../../mixins/reset-scroll';
import SetupSubmitControllerMixin from '../../mixins/setup-submit-controller';
/**
 * @module ember-preprints
 * @submodule routes
 */

/**
 * Fetches current preprint.
 * Redirects to preprint provider route if necessary.
 * @class Edit Route Handler
 */
export default Route.extend(ConfirmationMixin, Analytics, ResetScrollMixin, SetupSubmitControllerMixin, { // eslint-disable-line max-len
    i18n: service(),
    theme: service(),
    headTagsService: service('head-tags'),
    currentUser: service('currentUser'),

    editMode: true,
    preprint: null,

    confirmationMessage: computed('i18n', function() {
        return this.get('i18n').t('submit.abandon_preprint_confirmation');
    }),

    afterModel(preprint) {
        this.set('preprint', preprint);
        return preprint.get('provider')
            .then(this._getProviderInfo.bind(this))
            .then(this._getContributors.bind(this));
    },

    setupController(controller, model) {
        // Runs setupController for 'submit'
        this.setupSubmitController(controller, model);
        controller._setCurrentProvider();
        return this._super(...arguments);
    },
    renderTemplate() {
        // Overrides renderTemplate method.
        // If query param /?edit is present, uses 'submit' template instead.
        this.render('submit');
    },

    setup() {
        // Overrides setup method.  If query param /?edit is present,
        // uses 'submit' controller instead.
        this.set('controllerName', 'submit');
        return this._super(...arguments);
    },

    isPageDirty() {
        // If true, shows a confirmation message when leaving the page
        // True if the user has any unsaved changes
        return this.controller.get('hasDirtyFields');
    },

    _getProviderInfo(provider) {
        const preprint = this.get('preprint');
        const providerId = provider.get('id');
        const themeId = this.get('theme.id');
        const isOSF = providerId === 'osf';

        // If we're on the proper branded site, stay here.
        if (themeId === providerId) { return preprint.get('node'); }

        window.location.replace(`${config.OSF.url}${isOSF ? '' : `preprints/${providerId}/`}${preprint.get('id')}/edit/`);
        return Promise.reject();
    },

    _getContributors(node) {
        const controller = this.controllerFor('submit');
        this.set('node', node);
        controller.set('node', node);
        controller.send('getContributors', node);

        const userPermissions = this.get('node.currentUserPermissions') || [];

        if (!userPermissions.includes(permissions.ADMIN)) {
            this.replaceWith('forbidden'); // Non-admin trying to access edit form.
        }
    },
});
