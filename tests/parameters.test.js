// router.test.js

import { it, describe, beforeEach, expect } from '@olton/latte'
import Router from '../src/index.js'

describe('Router Parameters', () => {
    let router;

    beforeEach(() => {
        router = new Router();
    });

    it('should parse single parameter', async () => {
        let capturedParams = null;
        router.addRoute('/user/:id', (params) => {
            capturedParams = params;
        });

        await router.navigate('/user/123');
        expect(capturedParams).toBeObject({ id: '123' });
    });

    it('should parse multiple parameters', async () => {
        let capturedParams = null;
        router.addRoute('/blog/:year/:month/:day', (params) => {
            capturedParams = params;
        });

        await router.navigate('/blog/2024/03/15');
        expect(capturedParams).toBeObject({
            year: '2024',
            month: '03',
            day: '15'
        });
    });
});
