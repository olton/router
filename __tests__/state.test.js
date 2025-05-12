// router.test.js

import { it, describe, beforeEach, expect } from '@olton/latte'
import Router from '../src/index.js'

describe('Router State Management', () => {
    let router;

    beforeEach(() => {
        router = new Router();
    });

    it('should update browser history', async () => {
        const initialPath = window.location.pathname;
        await router.navigateTo('/new-page');
        expect(window.location.pathname).not.toBe(initialPath);
        expect(window.location.pathname).toBe('/new-page');
    });

    it('should replace state when specified', async () => {
        await router.navigateTo('/first-page');
        const historyLength = window.history.length;

        await router.navigateTo('/second-page', true); // з replaceState
        expect(window.history.length).toBe(historyLength);
    });
});
