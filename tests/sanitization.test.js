import { it, describe, beforeEach, expect } from '@olton/latte'
import Router from '../src/index.js'

describe('Router Path Sanitization', () => {
    let router;

    beforeEach(() => {
        router = new Router();
    });

    it('should handle basic paths', () => {
        expect(router.sanitizePath('/home')).toBe('/home');
        expect(router.sanitizePath('/users/123')).toBe('/users/123');
    });

    it('should remove dangerous characters', () => {
        expect(router.sanitizePath('/page<script>')).toBe('/pagescript');
        expect(router.sanitizePath("/path'injection")).toBe('/pathinjection');
    });

    it('should prevent path traversal', () => {
        expect(router.sanitizePath('/../etc/passwd')).toBe('/etc/passwd');
        expect(router.sanitizePath('/../../secret')).toBe('/secret');
    });

    it('should handle malformed URLs', () => {
        expect(router.sanitizePath('javascript:alert(1)')).toBe('/alert1');
        expect(router.sanitizePath('data:text/html')).toBe('/text/html');
    });

    it('should normalize slashes', () => {
        expect(router.sanitizePath('/path//to///page')).toBe('/path/to/page');
    });

    it('should block dangerous paths', () => {
        expect(router.sanitizePath('/wp-admin/config')).toBe('/');
        expect(router.sanitizePath('/api/internal')).toBe('/');
        expect(router.sanitizePath('/config.php')).toBe('/');
    });

    it('should handle encoded paths', () => {
        expect(router.sanitizePath('/path%20with%20spaces')).toBe('/path with spaces');
        expect(router.sanitizePath('/user%2Fprofile')).toBe('/user/profile');
    });

    it('should handle empty or undefined paths', () => {
        expect(router.sanitizePath()).toBe('/');
        expect(router.sanitizePath('')).toBe('/');
        expect(router.sanitizePath(null)).toBe('/');
    });

    it('should preserve valid special characters', () => {
        expect(router.sanitizePath('/path-with-dashes')).toBe('/path-with-dashes');
        expect(router.sanitizePath('/path_with_underscores')).toBe('/path_with_underscores');
    });
});
