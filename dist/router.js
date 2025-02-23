
/*!
 * Router v0.1.0 (Router ror SPA)
 * Build: 23.02.2025, 20:22:55
 * Copyright 2025 by Serhii Pimenov
 * Licensed under MIT
 */


// src/router.js
var version = "0.1.0";
var build_time = "23.02.2025, 20:22:55";
var Router = class _Router {
  static debug = false;
  static log(...args) {
    if (_Router.debug) {
      console.log("[Router]:", ...args);
    }
  }
  constructor(options = {}) {
    this.routes = {};
    this.fallbackRoute = options.fallback || "/";
    this.maxRedirects = options.maxRedirects || 5;
    this.redirectCount = 0;
    this.basePath = options.basePath || "";
    this.middleware = [];
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
    this.cache = /* @__PURE__ */ new Map();
    this.cacheLimit = options.cacheLimit ?? 50;
    this.touchStartX = 0;
    this.enableSwipeNavigation = options.enableSwipeNavigation || false;
    if (this.enableSwipeNavigation) {
      this.initSwipeNavigation();
    }
    window.addEventListener("unhandledrejection", this.handleError.bind(this));
  }
  initSwipeNavigation() {
    document.addEventListener("touchstart", (e) => {
      this.touchStartX = e.touches[0].clientX;
    }, { passive: true });
    document.addEventListener("touchend", (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = this.touchStartX - touchEndX;
      if (Math.abs(diff) > 100) {
        if (diff > 0) {
          window.history.forward();
        } else {
          window.history.back();
        }
      }
    }, { passive: true });
  }
  handleError(error) {
    _Router.log("Critical error:", error);
    if (this.routes["/error"]) {
      this.navigateTo("/error", true);
    } else {
      this.navigateTo(this.fallbackRoute, true);
    }
  }
  sanitizePath(path) {
    try {
      if (!path) return "/";
      const url = new URL(path, window.location.origin);
      let sanitized = decodeURIComponent(url.pathname);
      sanitized = sanitized.replace(/[<>'"`;(){}]/g, "").replace(/[\u0000-\u001F\u007F-\u009F]/g, "").replace(/([^/])\/{2,}/g, "$1/").replace(/\/+/g, "/").replace(/(.+)\/$/, "$1").replace(/\.+/g, ".").split("/").filter((segment) => segment !== ".." && segment !== ".").join("/");
      if (!sanitized.startsWith("/")) {
        sanitized = "/" + sanitized;
      }
      if (this.isBlockedPath(sanitized)) {
        _Router.log("Blocked malicious path:", path);
        return "/";
      }
      return sanitized;
    } catch (e) {
      _Router.log("Invalid URL:", e);
      return "/";
    }
  }
  isBlockedPath(path) {
    const blockedPatterns = [
      /^\/(api|admin|wp-admin|wp-content|wp-includes)/i,
      /\.(php|asp|aspx|jsp|cgi|config|env|git|sql|htaccess)$/i,
      /\/(.+\/)*\.{2,}\//,
      // Path traversal attempts
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /file:/i
    ];
    return blockedPatterns.some((pattern) => pattern.test(path));
  }
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
  beforeEach(hook) {
    _Router.log("Register BE hook ", hook.name);
    this.beforeEachHooks.push(hook);
  }
  afterEach(hook) {
    _Router.log("Register AE hook ", hook.name);
    this.afterEachHooks.push(hook);
  }
  use(middleware) {
    _Router.log("Register middleware", middleware.name);
    this.middleware.push(middleware);
  }
  addRoute(path, callback) {
    _Router.log("Add route :", path);
    this.routes[path] = callback;
  }
  removeRoute(path) {
    _Router.log("Remove route :", path);
    if (this.routes[path]) {
      delete this.routes[path];
      return true;
    }
    return false;
  }
  getRoutes() {
    return this.routes;
  }
  async navigate(path) {
    if (this.redirectCount > this.maxRedirects) {
      console.error("Maximum redirect limit reached");
      this.redirectCount = 0;
      await this.navigateTo("/error", true);
      return;
    }
    this.redirectCount++;
    const route = this.matchRoute(this.sanitizePath(path));
    if (route) {
      try {
        this.redirectCount++;
        for (const middleware of this.middleware) {
          _Router.log("Run middleware:", middleware.name);
          await middleware(route);
        }
        for (const hook of this.beforeEachHooks) {
          _Router.log("Run BE hook :", hook.name);
          await hook(route);
        }
        _Router.log("Run route component with params:", route.params);
        await route.callback(route.params);
        for (const hook of this.afterEachHooks) {
          _Router.log("Run AE hook :", hook.name);
          await hook(route);
        }
      } catch (error) {
        console.error("Navigation error:", error);
        this.routes["/error"] && this.routes["/error"](error);
      }
    } else {
      this.redirectCount = 0;
      this.routes["/404"] && this.routes["/404"]();
    }
  }
  async navigateTo(path, replaceState = false) {
    _Router.log("Programmatic navigation to:", path);
    this.redirectCount = 0;
    const url = new URL(path, window.location.origin);
    if (replaceState) {
      window.history.replaceState({}, "", url);
    } else {
      window.history.pushState({}, "", url);
    }
    await this.navigate(url.pathname);
  }
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
  _performMatch(path) {
    _Router.log("Matching route for path:", path);
    const [_, queryString] = path.split("?");
    const queryParams = new URLSearchParams(queryString);
    const queryObject = Object.fromEntries(queryParams);
    for (const route in this.routes) {
      const paramNames = [];
      const regexPath = route.replace(/:([^\/]+)/g, (_2, paramName) => {
        paramNames.push(paramName);
        return "([^/]+)";
      });
      const match = path.match(new RegExp(`^${regexPath}$`));
      if (match) {
        _Router.log("Route found:", route);
        const params = match.slice(1).reduce((acc, value, index) => {
          acc[paramNames[index]] = value;
          return acc;
        }, {});
        return {
          callback: this.routes[route],
          params,
          query: queryObject
        };
      }
    }
    return null;
  }
  clearCache() {
    this.cache.clear();
  }
  resetRedirectCount() {
    this.redirectCount = 0;
  }
  listen() {
    window.addEventListener("popstate", () => {
      _Router.log("Popstate event triggered");
      this.redirectCount = 0;
      this.navigate(window.location.pathname);
    });
    document.addEventListener("click", (event) => {
      if (event.target.tagName === "A" && event.target.href.startsWith(window.location.origin)) {
        event.preventDefault();
        _Router.log("Popstate event triggered", event.target.href);
        this.redirectCount = 0;
        window.history.pushState({}, "", event.target.href);
        this.navigate(event.target.pathname);
      }
    });
    this.redirectCount = 0;
    this.navigate(window.location.pathname);
  }
};
Router.info = () => {
  console.info(`%c Router %c v${version} %c ${build_time} `, "color: #ffffff; font-weight: bold; background: #ed1cab", "color: white; background: darkgreen", "color: white; background: #0080fe;");
};
var router_default = Router;

// src/index.js
var index_default = router_default;
export {
  index_default as default
};
