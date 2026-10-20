/* SchoolHub base scripts (extracted from base.html) */

document.addEventListener("DOMContentLoaded", function () {
    const searchButton = document.getElementById("mobileSearchButton");
    const searchPanel = document.getElementById("mobileSearchPanel");
    const searchInput = document.getElementById("mobileSearchInput");

    if (!searchButton || !searchPanel) {
        return;
    }

    searchButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        const isOpen = searchPanel.classList.contains("open");

        searchPanel.classList.toggle("open", !isOpen);
        searchButton.setAttribute("aria-expanded", String(!isOpen));

        if (!isOpen && searchInput) {
            setTimeout(function () {
                searchInput.focus();
            }, 50);
        }
    });

    document.addEventListener("click", function (event) {
        if (
            searchPanel.classList.contains("open") &&
            !searchPanel.contains(event.target) &&
            !searchButton.contains(event.target)
        ) {
            searchPanel.classList.remove("open");
            searchButton.setAttribute("aria-expanded", "false");
        }
    });

    searchPanel.addEventListener("click", function (event) {
        event.stopPropagation();
    });
});

(function () {
    const btn = document.getElementById('notifBtn');
    if (!btn) return;

    const panel = document.getElementById('notifPanel');
    const badge = document.getElementById('notifBadge');

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function render(items) {
        if (!items.length) {
            panel.innerHTML = '<div class="notif-empty">Новых сообщений нет</div>';
            return;
        }
        panel.innerHTML = items.map(function (i) {
            const avatar = i.avatar
                ? '<img src="' + esc(i.avatar) + '" alt="">'
                : '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
            const count = i.count > 1
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

    async function refresh() {
        try {
            const r = await fetch('/chat/api/unread/', {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            if (!r.ok) return;
            const data = await r.json();
            const count = data.count || 0;
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
            document.querySelectorAll('.chat-badge').forEach(function (b) {
                if (count > 0) {
                    b.textContent = count > 99 ? '99+' : String(count);
                    b.style.display = 'flex';
                } else {
                    b.style.display = 'none';
                }
            });
            if (prevCount >= 0 && count > prevCount && data.items && data.items.length) {
                const top = data.items[0];
                if (location.pathname !== '/chat/' + top.chat_id + '/') showToast(top);
            }
            prevCount = count;
            render(data.items);
        } catch (e) { /* нет сети — пропускаем цикл */ }
    }

    let toastEl = null;
    let toastTimer = null;
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

    let prevCount = -1;

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

(function () {
    function block(e) { e.preventDefault(); }
    document.addEventListener('gesturestart', block, { passive: false });
    document.addEventListener('gesturechange', block, { passive: false });
    document.addEventListener('gestureend', block, { passive: false });
})();

(function () {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var bottomNav = document.querySelector('.bottom-nav');
    var indicator = null;
    var activeLink = null;

    if (bottomNav && !reduce) {
        activeLink = bottomNav.querySelector('a.active') || bottomNav.querySelector('a');

        indicator = document.createElement('span');
        indicator.className = 'bottom-nav-indicator';
        bottomNav.insertBefore(indicator, bottomNav.firstChild);

        function place(el, animate) {
            if (!el) return;
            if (!animate) indicator.style.transition = 'none';
            indicator.style.left = el.offsetLeft + 'px';
            indicator.style.width = el.offsetWidth + 'px';
            if (!animate) {
                void indicator.offsetWidth;
                indicator.style.transition = '';
            }
        }

        if (window.requestAnimationFrame) {
            window.requestAnimationFrame(function () { place(activeLink, false); });
        } else {
            place(activeLink, false);
        }

        window.addEventListener('resize', function () { place(activeLink, false); });
    }

    var layout = document.querySelector('.layout');
    if (!layout) return;

    if (!window.__loadedScripts) {
        window.__loadedScripts = {};
        document.querySelectorAll('script[src]').forEach(function (s) {
            window.__loadedScripts[s.getAttribute('src')] = true;
        });
    }

    function activate(root) {
        root.querySelectorAll('script:not([src])').forEach(function (old) {
            var s = document.createElement('script');
            s.textContent = old.textContent;
            old.replaceWith(s);
        });
        root.querySelectorAll('script[src]').forEach(function (old) {
            var src = old.getAttribute('src');
            if (window.__loadedScripts[src]) return;
            window.__loadedScripts[src] = true;
            var s = document.createElement('script');
            s.setAttribute('src', src);
            old.replaceWith(s);
        });
    }

    function syncHead(doc) {
        var newHead = doc.querySelector('head');
        if (!newHead) return;

        var links = new Set();
        document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
            links.add(l.getAttribute('href'));
        });
        var styles = new Set();
        document.querySelectorAll('head style').forEach(function (s) {
            styles.add(s.textContent);
        });

        newHead.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
            var href = link.getAttribute('href');
            if (!links.has(href)) {
                document.head.appendChild(link.cloneNode(true));
            }
        });
        newHead.querySelectorAll('style').forEach(function (style) {
            if (!styles.has(style.textContent)) {
                document.head.appendChild(style.cloneNode(true));
            }
        });
    }

    function navigate(url, push) {
        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) { return r.text(); })
            .then(function (html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                var newLayout = doc.querySelector('.layout');
                if (!newLayout) { window.location.href = url; return; }
                syncHead(doc);
                layout.innerHTML = newLayout.innerHTML;
                activate(layout);

                var pageScripts = document.getElementById('pageScripts');
                var newScripts = doc.getElementById('pageScripts');
                if (pageScripts && newScripts) {
                    pageScripts.innerHTML = newScripts.innerHTML;
                    activate(pageScripts);
                }

                document.title = doc.title;
                if (push) history.pushState({ spa: true }, '', url);

                if (window.__pageInits) window.__pageInits.forEach(function (init) { init(); });
            })
            .catch(function () { window.location.href = url; });
    }

    document.addEventListener('click', function (e) {
        var a = e.target.closest('a');
        if (!a) return;
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) !== '/' || href.charAt(1) === '/') return;
        if (a.target === '_blank') return;
        if (a.closest('form')) return;
        e.preventDefault();
        navigate(a.getAttribute('href'), true);
    });

    window.addEventListener('popstate', function () {
        navigate(location.pathname + location.search, false);
    });
})();
