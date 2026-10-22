(function () {
    'use strict';

    var pending = new Set();
    var flushTimer = null;
    var queuedRoots = [];

    function flush() {
        if (!pending.size) return;
        var ids = Array.from(pending);
        pending.clear();
        var url = window.POST_VIEWS_URL;
        if (!url) return;
        try {
            fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({ post_ids: ids }),
                credentials: 'same-origin'
            }).catch(function () {});
        } catch (err) { /* ignore */ }
    }

    function scheduleFlush() {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, 600);
    }

    function onIntersect(entries) {
        entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            var el = en.target;
            var id = el.getAttribute('data-post-id');
            if (!id) return;
            pending.add(id);
            scheduleFlush();
            if (window.__postViewsObserver) window.__postViewsObserver.unobserve(el);
        });
    }

    function ensureObserver() {
        if (!('IntersectionObserver' in window)) return null;
        if (!window.__postViewsObserver) {
            window.__postViewsObserver = new IntersectionObserver(onIntersect, {
                threshold: 0.35
            });
        }
        return window.__postViewsObserver;
    }

    function observePostViews(root) {
        var observer = ensureObserver();
        if (!observer) return;
        var scope = root || document;
        var cards;
        if (typeof scope.querySelectorAll === 'function') {
            cards = scope.querySelectorAll('.post-card, .post[data-post-id]');
        } else {
            cards = document.querySelectorAll('.post-card, .post[data-post-id]');
        }
        Array.prototype.forEach.call(cards, function (el) {
            if (el.__postViewObserved) return;
            if (!el.getAttribute('data-post-id')) return;
            el.__postViewObserved = true;
            observer.observe(el);
        });
    }

    function safeObserve(root) {
        if (window.__postViewsReady) {
            observePostViews(root);
        } else {
            queuedRoots.push(root || document);
        }
    }

    function drainQueue() {
        if (window.__postViewsReady) return;
        window.__postViewsReady = true;
        var roots = queuedRoots;
        queuedRoots = [];
        roots.forEach(function (r) { observePostViews(r); });
    }

    window.observePostViews = safeObserve;
    window.__drainPostViews = drainQueue;

    if (document.readyState !== 'loading') {
        drainQueue();
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            drainQueue();
        });
    }
})();