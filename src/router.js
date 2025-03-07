const version = "__VERSION__"
const build_time = "__BUILD_TIME__"

/**
 * Router class provides client-side routing functionality for single-page applications.
 * It supports features like route addition, navigation hooks, redirects, middleware,
 * lazy-loaded routes, swipe navigation, and path sanitization for enhanced security.
 */
class Router {
    /**
     * Constructor initializes the Router instance with options.
     * @param {Object} options - Configuration options for the router.
     * @param {string} options.fallback - Fallback route if no match is found.
     * @param {number} options.maxRedirects - Maximum number of redirects allowed.
     * @param {string} options.base - Base path for the router.
     * @param {number} options.cacheLimit - Maximum number of cached routes.
     * @param {boolean} options.enableSwipeNavigation - Enable swipe navigation.
     * @param {boolean} options.useHash - Use hash-based routing.
     * @param {Object} options.routes - Initial routes to be added.
     * 
     */
    constructor(options = {}) {
        this.routes = {};
        this.fallbackRoute = options.fallback || '/';
        this.maxRedirects = options.maxRedirects || 5;
        this.redirectCount = 0;
        this.basePath = options.base || '';
        this.middleware = [];
        this.beforeEachHooks = [];
        this.afterEachHooks = [];
        this.cache = new Map();
        this.cacheLimit = options.cacheLimit ?? 50;
        this.touchStartX = 0;
        this.enableSwipeNavigation = options.enableSwipeNavigation || false;
        this.current = null;
        this.redirects = {};
        this.useHash = options.useHash || false;
        this.events = {
            beforeNavigate: [],
            afterNavigate: [],
            routeNotFound: [],
            error: []
        };

        if (this.enableSwipeNavigation) {
            this.initSwipeNavigation();
        }

        if (options.routes) {
            for (const [path, callback] of Object.entries(options.routes)) {
                this.addRoute(path, callback);
            }
        }
        
        window.addEventListener('unhandledrejection', this.handleError.bind(this));
    }

    /**
     * Adds an event listener for a specific event.
     * @param event
     * @param callback
     * @returns {Router}
     */
    on(event, callback) {
        if (this.events[event]) {
            this.events[event].push(callback);
        }
        return this;
    }

    /**
     * Emit an event with optional arguments.
     * @param event
     * @param args
     * @returns {boolean}
     */
    emit(event, ...args) {
        if (this.events[event]) {
            for (const callback of this.events[event]) {
                const result = callback(...args);
                if (event === 'beforeNavigate' && result === false) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Initialize swipe navigation for touch devices.
     */
    initSwipeNavigation() {
        document.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].clientX;
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const diff = this.touchStartX - touchEndX;

            // Свайп вправо/вліво для навігації
            if (Math.abs(diff) > 100) {
                if (diff > 0) {
                    window.history.forward();
                } else {
                    window.history.back();
                }
            }
        }, { passive: true });
    }

    /**
     * Handle errors during navigation.
     * @param error
     */
    handleError(error) {
        this.emit('error', error);
        if (this.routes['/error']) {
            this.navigateTo('/error', true);
        } else {
            this.navigateTo(this.fallbackRoute, true);
        }
    }

    /**
     * Sanitize the path to prevent XSS and path traversal attacks.
     * @param path
     * @returns {string}
     */
    sanitizePath(path) {
        try {
            if (!path) return '/';

            const url = new URL(path, window.location.origin);
            let sanitized = decodeURIComponent(url.pathname)

            sanitized = sanitized
                // Видаляємо небезпечні символи
                .replace(/[<>'"`;(){}]/g, '')
                // Видаляємо керуючі символи
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
                // Видаляємо множинні слеші на початку
                .replace(/([^/])\/{2,}/g, '$1/')
                // Видаляємо множинні слеші
                .replace(/\/+/g, '/')
                // Видаляємо trailing слеш (окрім кореневого шляху)
                .replace(/(.+)\/$/, '$1')
                // Видаляємо точки для запобігання path traversal
                .replace(/\.+/g, '.')
                // Видаляємо спроби path traversal
                .split('/')
                .filter(segment => segment !== '..' && segment !== '.')
                .join('/');
            
            // Переконуємося що шлях починається з /
            if (!sanitized.startsWith('/')) {
                sanitized = '/' + sanitized;
            }

            // Додаткові перевірки безпеки
            if (this.isBlockedPath(sanitized)) {
                return '/';
            }

            return sanitized;
        } catch (e) {
            return '/';
        }
    }

    /**
     * Check if the path is blocked by any of the defined patterns.
     * @param path
     * @returns {boolean}
     */
    isBlockedPath(path) {
        // Список заборонених шляхів
        const blockedPatterns = [
            /^\/(api|admin|wp-admin|wp-content|wp-includes)/i,
            /\.(php|asp|aspx|jsp|cgi|config|env|git|sql|htaccess)$/i,
            /\/(.+\/)*\.{2,}\//,  // Path traversal attempts
            /javascript:/i,
            /data:/i,
            /vbscript:/i,
            /file:/i
        ];

        return blockedPatterns.some(pattern => pattern.test(path));
    }

    /**
     * Test the path against the router's rules.
     * @param path
     * @returns {{original, sanitized: string, isBlocked: boolean, isModified: boolean}}
     */
    test(path) {
        const original = path;
        const sanitized = this.sanitizePath(path);
        return {
            original,
            sanitized,
            isBlocked: this.isBlockedPath(sanitized),
            isModified: original !== sanitized
        };
    }

    /**
     * Add a beforeEach hook to be executed
     * @param hook
     * @returns {Router}
     */
    beforeEach(hook) {
        this.beforeEachHooks.push(hook);
        return this;
    }

    /**
     * Add an afterEach hook to be executed
     * @param hook
     * @returns {Router}
     */
    afterEach(hook) {
        this.afterEachHooks.push(hook);
        return this;
    }

    /**
     * Add a middleware function to be executed before
     * @param middleware
     * @returns {Router}
     */
    use(middleware) {
        this.middleware.push(middleware);
        return this;
    }

    /**
     * Add a redirect from one path to another.
     * @param from
     * @param to
     * @returns {Router|boolean}
     */
    addRedirect(from, to) {
        if (this.redirects[from]) {
            return false;
        }
        this.redirects[from] = to;
        return this
    }

    /**
     * Add a route to the router.
     * @param path
     * @param callback
     * @returns {Router}
     */
    addRoute(path, callback) {
        this.routes[path] = callback;
        return this
    }

    /**
     * Add a nested route to the router.
     * @param parentPath
     * @param path
     * @param callback
     * @returns {Router}
     */
    addNestedRoute(parentPath, path, callback) {
        const fullPath = `${parentPath}${path}`.replace(/\/\//g, '/');
        this.addRoute(fullPath, callback);
        return this; // Для цепочки вызовов
    }

    /**
     * Add a lazy-loaded route to the router.
     * @param path
     * @param importFunc
     * @returns {Router}
     */
    addLazyRoute(path, importFunc) {
        this.addRoute(path, async (params) => {
            try {
                const module = await importFunc();
                const component = module.default || module;
                return component(params);
            } catch (error) {
                throw error;
            }
        });
        return this;
    }

    /**
     * Add a lazy-loaded nested route to the router.
     * @param parentPath
     * @param path
     * @param importFunc
     * @returns {Router}
     */
    addLazyNestedRoute(parentPath, path, importFunc) {
        const fullPath = `${parentPath}${path}`.replace(/\/\//g, '/');
        this.addLazyRoute(fullPath, importFunc);
        return this; // Для цепочки вызовов
    }

    /**
     * Add a fallback route to be used when no other routes match.
     * @param path
     * @returns {Router}
     */
    addFallbackRoute(path) {
        this.fallbackRoute = path;
        return this;
    }

    /**
     * Add a 404 route to be used when no other routes match.
     * @param path
     * @returns {Router}
     */
    add404Route(path) {
        this.routes['/404'] = path;
        return this;
    }

    /**
     * Add an error route to be used when an error occurs.
     * @param path
     * @returns {Router}
     */
    addErrorRoute(path) {
        this.routes['/error'] = path;
        return this;
    }

    /**
     * Add a protected route with a guard function.
     * @param path
     * @param callback
     * @param guardFunction
     * @returns {Router}
     */
    addProtectedRoute(path, callback, guardFunction) {
        this.addRoute(path, async (params) => {
            if (await guardFunction(params)) {
                return callback(params);
            } else {
                await this.navigateTo('/login', true);
            }
        });
        return this;
    }

    /**
     * Remove a route from the router.
     * @param path
     * @returns {Router}
     */
    removeRoute(path) {
        if (this.routes[path]) {
            delete this.routes[path];
        }
        return this;
    }

    /**
     * Update an existing route with a new callback.
     * @param path
     * @param callback
     * @returns {Router}
     */
    updateRoute(path, callback) {
        if (this.routes[path]) {
            this.routes[path] = callback;
        }
        return this;
    }

    /**
     * Get the registered routes.
     * @returns {*|{}}
     */
    getRoutes() {
        return this.routes;
    }

    /**
     * Navigate to a specific path.
     * @param path
     * @returns {Promise<void>}
     */
    async navigate(path) {
        if (this.redirectCount > this.maxRedirects) {
            console.error('Maximum redirect limit reached');
            this.redirectCount = 0;
            this.emit('error', new Error('Maximum redirect limit reached'));
            await this.navigateTo('/error', true);
            return;
        }
        this.redirectCount++;

        const route = this.matchRoute(this.sanitizePath(path));

        if (route) {
            try {
                // Событие перед навигацией
                const canContinue = await this.emit('beforeNavigate', route);
                if (canContinue === false) {
                    return;
                }

                if (this.redirects[route.path]) {
                    await this.navigateTo(this.redirects[route.path], true);
                    return;
                }

                this.redirectCount++;

                for (const middleware of this.middleware) {
                    await middleware(route);
                }

                for (const hook of this.beforeEachHooks) {
                    await hook(route);
                }

                await route.callback(route.params);

                for (const hook of this.afterEachHooks) {
                    await hook(route);
                }

                this.current = route;

                this.emit('afterNavigate', route);
            } catch (error) {
                console.error('Navigation error:', error);
                this.emit('error', error); // Событие ошибки
                this.routes['/error'] && this.routes['/error'](error);
            }
        } else {
            this.redirectCount = 0;
            this.emit('routeNotFound', path); // Событие "маршрут не найден"
            this.routes['/404'] && this.routes['/404']();
        }
    }

    /**
     * Navigate to a specific path and replace the current state.
     * @param path
     * @param replaceState
     * @returns {Promise<void>}
     */
    async navigateTo(path, replaceState = false) {
        this.redirectCount = 0;
        const url = new URL(path, window.location.origin);
        if (replaceState) {
            window.history.replaceState({}, '', url);
        } else {
            window.history.pushState({}, '', url);
        }
        await this.navigate(url.pathname);
    }

    /**
     * Match a route against the registered routes.
     * @param path
     * @returns {any|{path: *, pattern: *, callback: *, params: *, query: {[p: string]: string}}}
     */
    matchRoute(path) {
        if (this.cache.has(path)) {
            return this.cache.get(path);
        }

        const result = this._performMatch(path);

        if (this.cache.size >= this.cacheLimit) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(path, result);
        return result;
    }

    /**
     * Perform the actual matching of the path against the registered routes.
     * @param path
     * @returns {{path, pattern: string, callback: *, params: *, query: {[p: string]: string}}|null}
     * @private
     */
    _performMatch(path) {
        const [_, queryString] = path.split('?');
        const queryParams = new URLSearchParams(queryString);
        const queryObject = Object.fromEntries(queryParams);
        
        for (const route in this.routes) {
            const paramNames = [];
            const regexPath = route.replace(/:([^\/]+)/g, (_, paramName) => {
                paramNames.push(paramName);
                return '([^\/]+)';
            });
            const match = path.match(new RegExp(`^${regexPath}$`));
            if (match) {
                const params = match.slice(1).reduce((acc, value, index) => {
                    acc[paramNames[index]] = value;
                    return acc;
                }, {});
                return {
                    path,
                    pattern: regexPath,
                    callback: this.routes[route],
                    params,
                    query: queryObject
                };
            }
        }
        return null;
    }

    /**
     * Clear the cache of routes.
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Reset the redirect count.
     */
    resetRedirectCount() {
        this.redirectCount = 0;
    }

    /**
     * Get the full path of a current path.
     * @param path
     * @returns {string|*}
     */
    getFullPath(path) {
        return this.useHash ? `#${path}` : path;
    }

    /**
     * Get the current path from the location.
     * @returns {string|string}
     */
    getPathFromLocation() {
        return this.useHash
            ? window.location.hash.slice(1) || '/'
            : window.location.pathname;
    }

    /**
     * Start listening for navigation events.
     */
    listen() {
        const event = this.useHash ? 'hashchange' : 'popstate';

        window.addEventListener(event, () => {
            this.redirectCount = 0;
            this.navigate(this.getPathFromLocation());
        });

        document.addEventListener('click', (event) => {
            if (event.target.tagName === 'A') {
                const href = event.target.getAttribute('href');
                if (href && (
                    (this.useHash && href.startsWith('#')) ||
                    (!this.useHash && event.target.href.startsWith(window.location.origin))
                )) {
                    event.preventDefault();
                    const path = this.useHash ? href.slice(1) : event.target.pathname;
                    this.redirectCount = 0;
                    this.navigateTo(path);
                }
            }
        });

        this.redirectCount = 0;
        this.navigate(this.getPathFromLocation());
    }
}

Router.info = () => {
    console.info(`%c Router %c v${version} %c ${build_time} `, "color: #ffffff; font-weight: bold; background: #ed1cab", "color: white; background: darkgreen", "color: white; background: #0080fe;")
}

export default Router;