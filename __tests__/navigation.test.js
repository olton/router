// router.test.js

import { it, describe, beforeEach, expect } from '@olton/easytest'
import Router from '../dist/router.js'

describe('Router Navigation', () => {
    let router;
    let navigationLog = [];

    beforeEach(() => {
        router = new Router();
        navigationLog = [];
    });

    it('should handle navigation', () => {
        router.addRoute('/page', () => {
            navigationLog.push('page visited');
        });

        router.navigate('/page');
        expect(navigationLog).toContain('page visited');
    });

    it('should handle 404 route', () => {
        let notFoundCalled = false;
        router.addRoute('/404', () => {
            notFoundCalled = true;
        });

        router.navigate('/non-existent');
        expect(notFoundCalled).toBe(true);
    });
});
