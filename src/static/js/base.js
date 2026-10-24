/* SchoolHub base scripts (static/js/base.js)
 *
 * Contains: mobile search, notifications, SPA-style navigation.
 *
 * Contract for page scripts (feed.js etc.):
 *   window.__pageInits.push(fn)     - fn() is called after every SPA navigation
 *   window.__pageCleanups.push(fn)  - fn() is called BEFORE the page content is swapped
 */

window.__pageInits = window.__pageInits || [];
window.__pageCleanups = window.__pageCleanups || [];

/* ====================== Mobile search ====================== */
document.addEventListener('DOMContentLoaded', function () {
    var searchButton = document.getElementById('mobileSearchButton');
    var searchPanel = document.getElementById('mobileSearchPanel');
    var searchInput = document.getElementById('mobileSearchInput');

    if (!searchButton || !searchPanel) return;

    searchButton.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();

        var isOpen = searchPanel.classList.contains('open');
        searchPanel.classList.toggle('open', !isOpen);
        searchButton.setAttribute('aria-expanded', String(!isOpen));

        if (!isOpen && searchInput) {
            setTimeout(function () { searchInput.focus(); }, 50);
        }
    });

    document.addEventListener('click', function (event) {
        if (
            searchPanel.classList.contains('open') &&
            !searchPanel.contains(event.target) &&
            !searchButton.contains(event.target)
        ) {
            searchPanel.classList.remove('open');
            searchButton.setAttribute('aria-expanded', 'false');
        }
    });

    searchPanel.addEventListener('click', function (event) {
        event.stopPropagation();
    });
});

/* ====================== Notifications ====================== */
(function () {
    var btn = document.getElementById('notifBtn');
    if (!btn) return;

    var panel = document.getElementById('notifPanel');
    var badge = document.getElementById('notifBadge');
    var prevCount = -1;
    var toastEl = null;
    var toastTimer = null;

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function render(items) {
        if (!items || !items.length) {
            panel.innerHTML = '<div class="notif-empty">Новых сообщений нет</div>';
            return;
        }
        panel.innerHTML = items.map(function (i) {
            var avatar = i.avatar
                ? '<img src="' + esc(i.avatar) + '" alt="">'
                : '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
            var count = i.count > 1
                ? ' <span style="color:var(--muted);font-weight:400;">· ' + i.count + '</span>'
                : '';
            return '<a class="notif-item" href="/chat/' + i.chat_id + '/">' +
                '<div class="notif-avatar">' + avatar + '</div>' +
                '<div style="flex:1; min-width:0;">' +
                    '<div style="font-weight:600; font-size:14px;">' + esc(i.sender) + count + '</div>' +
                    '<div style="font-size:13px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(i.preview) + '</div>' +
                '</div>' +
                '<div style="font-size:12px; color:var(--muted); flex-shrink:0;">' + esc(i.time) + '</div>' +
            '</a>';
        }).join('');
    }

    function hideToast() {
        if (toastEl) toastEl.classList.remove('show');
    }

    function showToast(item) {
        if (!toastEl) {
            toastEl = document.createElement('a');
            toastEl.className = 'msg-toast';
            document.body.appendChild(toastEl);
            toastEl.addEventListener('click', hideToast);
        }
        toastEl.href = '/chat/' + item.chat_id + '/';
        toastEl.innerHTML =
            '<div class="t">' + esc(item.sender) + '</div>' +
            '<div class="p">' + esc(item.preview) + '</div>';
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideToast, 4000);
    }

    function setBadges(count) {
        var text = count > 99 ? '99+' : String(count);
        if (count > 0) {
            badge.textContent = text;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
        document.querySelectorAll('.chat-badge').forEach(function (b) {
            if (count > 0) {
                b.textContent = text;
                b.style.display = 'flex';
            } else {
                b.style.display = 'none';
            }
        });
    }

    async function refresh() {
        try {
            var r = await fetch('/chat/api/unread/', {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            if (!r.ok) return;
            var data = await r.json();
            var count = data.count || 0;
            setBadges(count);
            if (prevCount >= 0 && count > prevCount && data.items && data.items.length) {
                var top = data.items[0];
                if (location.pathname !== '/chat/' + top.chat_id + '/') showToast(top);
            }
            prevCount = count;
            render(data.items);
        } catch (e) { /* offline: skip this cycle */ }
    }

    btn.addEventListener('click', function (event) {
        event.stopPropagation();
        panel.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(panel.classList.contains('open')));
    });

    document.addEventListener('click', function (event) {
        if (panel.classList.contains('open') && !panel.contains(event.target)) {
            panel.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        }
    });

    render([]);
    refresh();
    setInterval(function () {
        if (!document.hidden) refresh();
    }, 8000);
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) refresh();
    });
})();

/* ====================== Disable pinch zoom (iOS) ====================== */
(function () {
    function block(e) { e.preventDefault(); }
    document.addEventListener('gesturestart', block, { passive: false });
    document.addEventListener('gesturechange', block, { passive: false });
    document.addEventListener('gestureend', block, { passive: false });
})();

/* ====================== Bottom nav indicator + SPA navigation ====================== */
(function () {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var layout = document.querySelector('.layout');
    var bottomNav = document.querySelector('.bottom-nav');
    var indicator = null;
    var navToken = 0;

    /* ---- bottom nav: iOS "liquid glass" sliding indicator ---- */
    var NAV_SPRING = 'cubic-bezier(.34, 1.45, .5, 1)';

    function setIndicatorPosition(animate) {
        if (!bottomNav || !indicator) return;
        var el = bottomNav.querySelector('a.active') || bottomNav.querySelector('a');
        if (!el) return;

        var nBox = bottomNav.getBoundingClientRect();
        var aBox = el.getBoundingClientRect();
        if (!aBox.width) return; /* nav hidden (desktop) */

        var border = bottomNav.clientLeft || 0;
        var targetX = aBox.left - nBox.left - border;
        var targetW = aBox.width;

        /* current on-screen position (may be mid-animation) */
        var cur = indicator.getBoundingClientRect();
        var fromX = cur.width ? cur.left - nBox.left - border : targetX;
        var fromW = cur.width || targetW;

        if (indicator._anim) {
            indicator._anim.forEach(function (a) { a.cancel(); });
            indicator._anim = null;
        }

        /* commit the destination as the base style */
        indicator.style.transform = 'translate3d(' + targetX + 'px, 0, 0)';
        indicator.style.width = targetW + 'px';

        if (!animate || (fromX === targetX && fromW === targetW)) return;

        var dist = targetX - fromX;
        var stretch = reduce ? 0 : Math.min(Math.abs(dist) * 0.22, 26);
        var dur = reduce ? 200 : 520;

        /* glide across with a springy overshoot */
        var move = indicator.animate(
            [
                { transform: 'translate3d(' + fromX + 'px, 0, 0)' },
                { transform: 'translate3d(' + targetX + 'px, 0, 0)' }
            ],
            { duration: dur, easing: reduce ? 'ease-out' : NAV_SPRING, fill: 'backwards' }
        );

        /* liquid stretch: the pill swells mid-travel, then settles into place */
        var morph = indicator.animate(
            [
                { width: fromW + 'px', offset: 0 },
                { width: (targetW + stretch) + 'px', offset: 0.5 },
                { width: targetW + 'px', offset: 1 }
            ],
            { duration: dur, easing: 'ease-in-out', fill: 'backwards' }
        );

        indicator._anim = [move, morph];
    }

    if (bottomNav) {
        indicator = document.createElement('span');
        indicator.className = 'bottom-nav-indicator';
        bottomNav.insertBefore(indicator, bottomNav.firstChild);

        var settle = function () { setIndicatorPosition(false); };
        requestAnimationFrame(settle);
        window.addEventListener('load', settle);
        window.addEventListener('resize', settle);
        window.addEventListener('orientationchange', settle);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () { setIndicatorPosition(false); });
        }
    }

    /* Toggle "active" state for sidebar + bottom nav links matching a path.
       Returns true if at least one nav link matched. */
    function applyActive(path) {
        var matched = false;
        document.querySelectorAll('.sidebar a[href], .bottom-nav a[href]').forEach(function (a) {
            var href = a.getAttribute('href');
            if (!href || href.charAt(0) !== '/') return;
            var active = href === '/' ? path === '/' : path.indexOf(href) === 0;
            if (active) matched = true;
            a.classList.toggle('active', active);
        });
        return matched;
    }

    /* Keep sidebar / bottom nav "active" state in sync with the URL.
       The bottom nav lives outside .layout, so it is not replaced on navigation. */
    function syncActiveLinks() {
        applyActive(location.pathname);
        setIndicatorPosition(true);
    }

    if (!layout) return;

    /* ---- script loader ---- */
    if (!window.__loadedScripts) {
        window.__loadedScripts = {};
        document.querySelectorAll('script[src]').forEach(function (s) {
            window.__loadedScripts[s.getAttribute('src')] = true;
        });
    }

    /* Runs the scripts inside `root` in document order.
       - inline scripts are re-executed every time (they set page config)
       - external scripts are loaded only once per session */
    function activateScripts(root) {
        var scripts = Array.prototype.slice.call(root.querySelectorAll('script'));
        return scripts.reduce(function (chain, old) {
            return chain.then(function () {
                return new Promise(function (resolve) {
                    var type = old.getAttribute('type');
                    if (type && type !== 'text/javascript') { resolve(); return; }

                    var src = old.getAttribute('src');
                    var s = document.createElement('script');
                    if (src) {
                        if (window.__loadedScripts[src]) { old.remove(); resolve(); return; }
                        window.__loadedScripts[src] = true;
                        s.onload = s.onerror = function () { resolve(); };
                        s.src = src;
                        old.replaceWith(s);
                    } else {
                        s.textContent = old.textContent;
                        old.replaceWith(s);
                        resolve();
                    }
                });
            });
        }, Promise.resolve());
    }

    /* ---- head assets: keep per-page <link>/<style> in sync across SPA navs ----
       base.css is shared (marked with data-base-css); everything else in <head>
       belongs to the current page and must be swapped when the page changes. */
    var baseCssLink = document.head.querySelector('link[data-base-css]');
    var managedHead = Array.prototype.slice.call(
        document.head.querySelectorAll('link[rel="stylesheet"], style')
    ).filter(function (n) { return !n.hasAttribute('data-base-css'); });

    function isPageHeadNode(n) {
        return !n.hasAttribute('data-base-css')
            && (n.tagName === 'STYLE'
                || (n.tagName === 'LINK' && n.getAttribute('rel') === 'stylesheet'));
    }

    function sameAsset(a, b) {
        if (a.tagName !== b.tagName) return false;
        if (a.tagName === 'LINK') return a.getAttribute('href') === b.getAttribute('href');
        return (a.textContent || '').trim() === (b.textContent || '').trim();
    }

    /* Insert before base.css so the cascade matches a full page load
       (page CSS is linked via extra_head, i.e. before base.css). */
    function insertHeadNode(node) {
        if (baseCssLink && baseCssLink.parentNode === document.head) {
            document.head.insertBefore(node, baseCssLink);
        } else {
            document.head.appendChild(node);
        }
    }

    function syncHeadAssets(doc) {
        var desired = Array.prototype.filter.call(
            doc.head.querySelectorAll('link[rel="stylesheet"], style'),
            isPageHeadNode
        );

        /* drop assets the new page no longer needs (prevents feed.css leaking) */
        managedHead = managedHead.filter(function (node) {
            var keep = desired.some(function (d) { return sameAsset(node, d); });
            if (!keep) node.remove();
            return keep;
        });

        var waits = [];
        desired.forEach(function (d) {
            if (managedHead.some(function (m) { return sameAsset(m, d); })) return;
            var node = d.cloneNode(true);
            if (node.tagName === 'LINK') {
                waits.push(new Promise(function (resolve) {
                    node.onload = node.onerror = function () { resolve(); };
                    setTimeout(resolve, 3000);
                }));
            }
            insertHeadNode(node);
            managedHead.push(node);
        });
        return Promise.all(waits);
    }

    function runCleanups() {
        (window.__pageCleanups || []).forEach(function (fn) {
            try { fn(); } catch (e) { /* ignore */ }
        });
    }

    function runInits() {
        (window.__pageInits || []).forEach(function (fn) {
            try { fn(); } catch (e) { console.error(e); }
        });
    }

    function fullLoad(url, push) {
        if (push) window.location.href = url;
        else window.location.reload();
    }

    function navigate(url, push) {
        var token = ++navToken;

        fetch(url, {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
            .then(function (r) {
                var ct = r.headers.get('content-type') || '';
                if (!r.ok || ct.indexOf('text/html') === -1) throw new Error('fallback');
                return r.text().then(function (html) { return { html: html, finalUrl: r.url }; });
            })
            .then(function (res) {
                if (token !== navToken) return null;

                var doc = new DOMParser().parseFromString(res.html, 'text/html');
                var newLayout = doc.querySelector('.layout');
                if (!newLayout) throw new Error('fallback');

                var finalPath = url;
                try {
                    var u = new URL(res.finalUrl, location.href);
                    if (u.origin !== location.origin) throw new Error('fallback');
                    finalPath = u.pathname + u.search + u.hash;
                } catch (e) { throw new Error('fallback'); }

                return syncHeadAssets(doc).then(function () {
                    if (token !== navToken) return null;

                    runCleanups();

                    var theme = doc.documentElement.getAttribute('data-theme');
                    if (theme) document.documentElement.setAttribute('data-theme', theme);
                    else document.documentElement.removeAttribute('data-theme');

                    document.title = doc.title;
                    layout.setAttribute('style', newLayout.getAttribute('style') || '');
                    layout.innerHTML = newLayout.innerHTML;

                    if (push) {
                        history.pushState({ spa: true }, '', finalPath);
                        window.scrollTo(0, 0);
                    }

                    var pageScripts = document.getElementById('pageScripts');
                    var newScripts = doc.getElementById('pageScripts');

                    return activateScripts(layout)
                        .then(function () {
                            if (pageScripts && newScripts) {
                                pageScripts.innerHTML = newScripts.innerHTML;
                                return activateScripts(pageScripts);
                            }
                        })
                        .then(function () {
                            if (token !== navToken) return;
                            syncActiveLinks();
                            runInits();
                        });
                });
            })
            .catch(function () {
                if (token === navToken) fullLoad(url, push);
            });
    }

    /* ---- link interception ---- */
    var FULL_LOAD_PREFIX = /^\/(admin|media|static|accounts)(\/|$)/;

    document.addEventListener('click', function (e) {
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        var a = e.target.closest('a');
        if (!a) return;

        var href = a.getAttribute('href');
        if (!href || href.charAt(0) !== '/' || href.charAt(1) === '/') return;
        if (a.target === '_blank') return;
        if (a.hasAttribute('download') || a.hasAttribute('data-no-spa')) return;
        if (a.closest('form')) return;
        if (FULL_LOAD_PREFIX.test(href)) return;

        /* same-page anchor: let the browser scroll */
        var hashIdx = href.indexOf('#');
        if (hashIdx !== -1 && href.slice(0, hashIdx).split('?')[0] === location.pathname) return;

        e.preventDefault();

        /* instant "liquid glass" feedback: move the pill right away */
        if (applyActive(href.split('?')[0].split('#')[0])) setIndicatorPosition(true);

        navigate(href, true);
    });

    window.addEventListener('popstate', function () {
        navigate(location.pathname + location.search, false);
    });
})();