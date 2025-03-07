import Logger from "./logger.js";

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
     * @param {Array} options.plugins - Initial plugins to be added.
     * 
     */
    constructor(options = {}) {
        Logger.DEBUG_LEVEL = options.debug ? 4 : 0;
        Logger.debug('[Router] Init Router');
        
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
        this.plugins = [];
        
        if (this.enableSwipeNavigation) {
            this.initSwipeNavigation();
        }

        if (options.routes) {
            Logger.debug('[Router] Registering routes');
            for (const [path, callback] of Object.entries(options.routes)) {
                this.addRoute(path, callback);
            }
        }

        if (options.plugins && Array.isArray(options.plugins)) {
            Logger.debug('[Router] Registering plugins');
            options.plugins.forEach(plugin => {
                if (Array.isArray(plugin)) {
                    this.usePlugin(plugin[0], plugin[1] || {});
                } else {
                    this.usePlugin(plugin);
                }
            });
        }

        Logger.debug('[Router] Subscribing to unhandledrejection event');
        window.addEventListener('unhandledrejection', this.handleError.bind(this));

        Logger.debug('[Router] Router Initialized');
    }

    /**
     * Adds an event listener for a specific event.
     * @param event
     * @param callback
     * @returns {Router}
     */
    on(event, callback) {
        Logger.debug(`[Router] Subscribing to event ${event}`);
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
        Logger.debug(`[Router] Emitting event ${event}`);
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
        Logger.debug('[Router] Initializing swipe navigation');
        Logger.debug('[Router] Adding touchstart event listener');
        document.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].clientX;
        }, { passive: true });

        Logger.debug('[Router] Adding touchend event listener');
        document.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const diff = this.touchStartX - touchEndX;

            if (Math.abs(diff) > 100) {
                if (diff > 0) {
                    Logger.debug('[Router] Swiping right (forward)');
                    window.history.forward();
                } else {
                    Logger.debug('[Router] Swiping left (backward)');
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
        Logger.error('[Router] Error during navigation:', error);
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
        Logger.debug('[Router] Sanitizing path:', path);
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

            Logger.debug('[Router] Sanitized path:', sanitized);
            return sanitized;
        } catch (e) {
            Logger.error('[Router] Error sanitizing path:', e);
            return '/';
        }
    }

    /**
     * Check if the path is blocked by any of the defined patterns.
     * @param path
     * @returns {boolean}
     */
    isBlockedPath(path) {
        Logger.debug('[Router] Checking if path is blocked:', path);
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
        Logger.debug('[Router] Testing path:', path);
        const original = path;
        const sanitized = this.sanitizePath(path);
        const result = {
            original,
            sanitized,
            isBlocked: this.isBlockedPath(sanitized),
            isModified: original !== sanitized
        } 
        Logger.debug(`[Router] test result for path ${path}:`, result);
        return result;
    }

    /**
     * Add a beforeEach hook to be executed
     * @param hook
     * @returns {Router}
     */
    beforeEach(hook) {
        Logger.debug('[Router] Adding beforeEach hook');
        this.beforeEachHooks.push(hook);
        return this;
    }

    /**
     * Add an afterEach hook to be executed
     * @param hook
     * @returns {Router}
     */
    afterEach(hook) {
        Logger.debug('[Router] Adding afterEach hook');
        this.afterEachHooks.push(hook);
        return this;
    }

    /**
     * Add a middleware function to be executed before
     * @param middleware
     * @returns {Router}
     */
    use(middleware) {
        Logger.debug('[Router] Adding middleware');
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
        Logger.debug('[Router] Adding redirect from', from, 'to', to);
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
        Logger.debug('[Router] Adding route', path);
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
        Logger.debug('[Router] Adding nested route', path, 'to', parentPath);
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
        Logger.debug('[Router] Adding lazy-loaded route', path);
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
        Logger.debug('[Router] Adding lazy-loaded nested route', path, 'to', parentPath);
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
        Logger.debug('[Router] Adding fallback route', path);
        this.fallbackRoute = path;
        return this;
    }

    /**
     * Add a 404 route to be used when no other routes match.
     * @param path
     * @returns {Router}
     */
    add404Route(path) {
        Logger.debug('[Router] Adding 404 route', path);
        this.routes['/404'] = path;
        return this;
    }

    /**
     * Add an error route to be used when an error occurs.
     * @param path
     * @returns {Router}
     */
    addErrorRoute(path) {
        Logger.debug('[Router] Adding error route', path);
        this.routes['/error'] = path;
        return this;
    }

    /**
     * Add a protected route with a guard function.
     * @param path
     * @param callback
     * @param guardFunction
     * @param fallback
     * @returns {Router}
     */
    addProtectedRoute(path, callback, guardFunction, fallback = '/login') {
        Logger.debug('[Router] Adding protected route', path);
        this.addRoute(path, async (params) => {
            if (await guardFunction(params)) {
                Logger.debug('[Router] Guard function passed, executing callback');
                return callback(params);
            } else {
                Logger.debug('[Router] Guard function failed, redirecting to', fallback);
                await this.navigateTo(fallback, true);
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
        Logger.debug('[Router] Removing route', path);
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
        Logger.debug('[Router] Updating route', path);
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
        Logger.debug('[Router] Getting registered routes');
        return this.routes;
    }

    /**
     * Navigate to a specific path.
     * @param path
     * @returns {Promise<void>}
     */
    async navigate(path) {
        Logger.debug('[Router] Navigating to', path);
        if (this.redirectCount > this.maxRedirects) {
            Logger.error('[Router] Maximum redirect limit reached, redirecting to', this.fallbackRoute);
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
                Logger.debug('[Router] Route matched:', route);
                const canContinue = this.emit('beforeNavigate', route);
                if (canContinue === false) {
                    Logger.debug('[Router] Navigation cancelled by beforeNavigate hook');
                    return;
                }

                if (this.redirects[route.path]) {
                    Logger.debug('[Router] Redirecting to', this.redirects[route.path]);
                    await this.navigateTo(this.redirects[route.path], true);
                    return;
                }

                this.redirectCount++;

                for (const middleware of this.middleware) {
                    Logger.debug('[Router] Executing middleware');
                    await middleware(route);
                }

                for (const hook of this.beforeEachHooks) {
                    Logger.debug('[Router] Executing beforeEach hook');
                    await hook(route);
                }

                Logger.debug('[Router] Executing route callback');
                await route.callback(route.params);

                for (const hook of this.afterEachHooks) {
                    Logger.debug('[Router] Executing afterEach hook');
                    await hook(route);
                }

                this.current = route;

                this.emit('afterNavigate', route);
                Logger.debug('[Router] Navigation completed');
            } catch (error) {
                Logger.error('[Router] Error during navigation:', error);
                console.error('Navigation error:', error);
                this.emit('error', error); // Событие ошибки
                this.routes['/error'] && this.routes['/error'](error);
            }
        } else {
            Logger.warn('[Router] Route not found:', path);
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
        Logger.debug(`[Router] Navigating to ${path} ${replaceState ? "with replace state" : ""}`);
        this.redirectCount = 0;
        const url = new URL(path, window.location.origin);
        if (replaceState) {
            Logger.debug('[Router] Replacing state with', url);
            window.history.replaceState({}, '', url);
        } else {
            Logger.debug('[Router] Pushing state with', url);
            window.history.pushState({}, '', url);
        }
        Logger.debug('[Router] Navigating to', url);
        await this.navigate(url.pathname);
    }

    /**
     * Match a route against the registered routes.
     * @param path
     * @returns {any|{path: *, pattern: *, callback: *, params: *, query: {[p: string]: string}}}
     */
    matchRoute(path) {
        Logger.debug('[Router] Matching route for', path);
        if (this.cache.has(path)) {
            return this.cache.get(path);
        }

        Logger.debug('[Router] Route not found in cache, performing match');
        const result = this._performMatch(path);

        if (this.cache.size >= this.cacheLimit) {
            Logger.debug('[Router] Cache limit reached, removing oldest entry');
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        Logger.debug('[Router] Caching result for', path);
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
        Logger.debug('[Router] Clearing cache');
        this.cache.clear();
    }

    /**
     * Reset the redirect count.
     */
    resetRedirectCount() {
        Logger.debug('[Router] Resetting redirect count');
        this.redirectCount = 0;
    }

    /**
     * Get the full path of a current path.
     * @param path
     * @returns {string|*}
     */
    getFullPath(path) {
        Logger.debug('[Router] Getting full path for', path);
        return this.useHash ? `#${path}` : path;
    }

    /**
     * Get the current path from the location.
     * @returns {string|string}
     */
    getPathFromLocation() {
        Logger.debug('[Router] Getting path from location');
        return this.useHash
            ? window.location.hash.slice(1) || '/'
            : window.location.pathname;
    }

    /**
     * Start listening for navigation events.
     */
    listen() {
        Logger.debug('[Router] Starting to listen for navigation events');
        
        this._handleNavigation = () => {
            this.redirectCount = 0;
            this.navigate(this.getPathFromLocation()).then(r => {});
        };

        this._handleLinkClick = (event) => {
            if (event.target.tagName === 'A') {
                const href = event.target.getAttribute('href');
                if (href && (
                    (this.useHash && href.startsWith('#')) ||
                    (!this.useHash && event.target.href.startsWith(window.location.origin))
                )) {
                    event.preventDefault();
                    const path = this.useHash ? href.slice(1) : event.target.pathname;
                    this.redirectCount = 0;
                    this.navigateTo(path).then(r => {});
                }
            }
        };

        Logger.debug('[Router] Listening for navigation events');
        window.addEventListener(this.useHash ? 'hashchange' : 'popstate', this._handleNavigation);
        
        Logger.debug('[Router] Listening for link clicks');
        document.addEventListener('click', this._handleLinkClick);

        this._initPlugins();

        this.redirectCount = 0;
        this.navigate(this.getPathFromLocation()).then(r => {});

        return this;
    }

    /**
     * Initialize plugins.
     * @private
     */
    _initPlugins() {
        Logger.debug('[Router] Init plugins');
        this.plugins.forEach(({ plugin, options }) => {
            if (typeof plugin.onInit === 'function') {
                plugin.onInit(this, options);
            }
        });
    }
    
    /**
     * Use a plugin to extend the router's functionality.
     * @param plugin
     * @param options
     * @returns {Router}
     */
    usePlugin(plugin, options = {}) {
        if (!plugin) return this;

        Logger.debug('[Router] Using plugin', plugin);

        if (typeof plugin === 'object' && typeof plugin.install === 'function') {
            Logger.debug('[Router] Installing plugin', plugin);
            plugin.install(this, options);
        } else if (typeof plugin === 'function') {
            Logger.debug('[Router] Executing plugin', plugin);
            plugin(this, options);
        } else {
            Logger.warn('Invalid plugin format. Plugin must be an object with install method or a function.');
            return this;
        }

        Logger.debug('[Router] Add plugin to store', plugin);
        this.plugins.push({ plugin, options });

        Logger.debug('[Router] Plugin initialized');
        return this;
    }
    
    destroy() {
        Logger.debug('[Router] Destroying router');
        
        this.plugins.forEach(({ plugin, options }) => {
            Logger.debug('[Router] Destroying plugin', plugin);
            if (typeof plugin.onDestroy === 'function') {
                plugin.onDestroy(this, options);
            }
        });

        Logger.debug('[Router] Removing event listeners');
        window.removeEventListener(this.useHash ? 'hashchange' : 'popstate', this._handleNavigation);
        document.removeEventListener('click', this._handleLinkClick);
        window.removeEventListener('unhandledrejection', this.handleError);

        this._handleNavigation = null;
        this._handleLinkClick = null;

        // Очищаем состояние
        this.routes = {};
        this.plugins = [];
        this.cache.clear();
        Logger.debug('[Router] Router destroyed');
    }
}

Router.info = () => {
    console.info(`%c Router %c v${version} %c ${build_time} `, "color: #ffffff; font-weight: bold; background: #ed1cab", "color: white; background: darkgreen", "color: white; background: #0080fe;")
}

export default Router;