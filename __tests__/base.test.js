// router.test.js

import { it, describe, beforeEach, expect } from '@olton/latte'
import Router from '../src/index.js'

describe('Router Base Functionality', () => {
    let router;

    beforeEach(() => {
        // Очищаємо DOM між тестами
        document.body.innerHTML = '';
        // Створюємо новий екземпляр роутера
        router = new Router();
        // Скидаємо історію
        window.history.pushState({}, '', '/');
    });

    it('should initialize with empty routes', () => {
        expect(router.routes).toBeObject({});
        expect(router.redirectCount).toBe(0);
    });

    it('should add new route', () => {
        const callback = () => {};
        router.addRoute('/test', callback);
        expect(router.routes['/test']).toBe(callback);
    });

    it('should match exact route', () => {
        const callback = () => {};
        router.addRoute('/test', callback);
        const match = router.matchRoute('/test');
        expect(match.callback).toBe(callback);
        expect(match.params).toBeObject({});
    });

    it('should match route with parameters', () => {
        const callback = () => {};
        router.addRoute('/user/:id', callback);
        const match = router.matchRoute('/user/123');
        expect(match.callback).toBe(callback);
        expect(match.params).toBeObject({ id: '123' });
    });
});
