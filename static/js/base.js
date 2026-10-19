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

    /* ---- bottom nav sliding indicator ---- */
    function placeIndicator(animate) {
        if (!bottomNav || !indicator) return;
        var el = bottomNav.querySelector('a.active') || bottomNav.querySelector('a');
        if (!el) return;
        if (!animate) indicator.style.transition = 'none';
        indicator.style.left = el.offsetLeft + 'px';
        indicator.style.width = el.offsetWidth + 'px';
        if (!animate) {
            void indicator.offsetWidth;
            indicator.style.transition = '';
        }
    }

    if (bottomNav && !reduce) {
        indicator = document.createElement('span');
        indicator.className = 'bottom-nav-indicator';
        bottomNav.insertBefore(indicator, bottomNav.firstChild);
        requestAnimationFrame(function () { placeIndicator(false); });
        window.addEventListener('resize', function () { placeIndicator(false); });
    }

    /* Keep sidebar / bottom nav "active" state in sync with the URL.
       The bottom nav lives outside .layout, so it is not replaced on navigation. */
    function syncActiveLinks() {
        var path = location.pathname;
        document.querySelectorAll('.sidebar a[href], .bottom-nav a[href]').forEach(function (a) {
            var href = a.getAttribute('href');
            if (!href || href.charAt(0) !== '/') return;
            var active = href === '/' ? path === '/' : path.indexOf(href) === 0;
            a.classList.toggle('active', active);
        });
        placeIndicator(true);
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

    /* ---- stylesheets: add the ones the new page needs (e.g. feed.css) ---- */
    function syncStylesheets(doc) {
        var waits = [];
        doc.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
            var href = l.getAttribute('href');
            if (!href) return;
            var exists = Array.prototype.some.call(
                document.querySelectorAll('link[rel="stylesheet"]'),
                function (x) { return x.getAttribute('href') === href; }
            );
            if (exists) return;
            var clone = l.cloneNode(true);
            waits.push(new Promise(function (resolve) {
                clone.onload = clone.onerror = function () { resolve(); };
                setTimeout(resolve, 3000);
            }));
            document.head.appendChild(clone);
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

                return syncStylesheets(doc).then(function () {
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
        navigate(href, true);
    });

    window.addEventListener('popstate', function () {
        navigate(location.pathname + location.search, false);
    });
})();