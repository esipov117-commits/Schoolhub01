/* SchoolHub Web Push (PWA).
 *
 * На iOS уведомления работают только когда сайт добавлен на экран «Домой»
 * (iOS 16.4+). На Android/десктопе — в обычной вкладке.
 */
(function () {
    'use strict';

    var meta = document.querySelector('meta[name="vapid-public-key"]');
    var vapidKey = (meta && meta.content ? meta.content : '').trim();
    var supported = 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window;
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var standalone = window.navigator.standalone === true
        || window.matchMedia('(display-mode: standalone)').matches;

    var registration = null;
    var subscribed = false;
    var busy = false;

    if (!vapidKey || !supported) return;

    /* ---------- helpers ---------- */

    function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        var raw = window.atob(base64);
        var output = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
        return output;
    }

    function csrfToken() {
        var match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
        if (match) return decodeURIComponent(match[1]);
        var input = document.querySelector('[name=csrfmiddlewaretoken]');
        return input ? input.value : '';
    }

    function post(url, body) {
        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken(),
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(body)
        });
    }

    function toast(message) {
        var el = document.createElement('div');
        el.className = 'msg-toast push-toast';
        el.textContent = message;
        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('show'); });
        setTimeout(function () {
            el.classList.remove('show');
            setTimeout(function () { el.remove(); }, 320);
        }, 4200);
    }

    /* ---------- service worker ---------- */

    function ensureRegistration() {
        if (registration) return Promise.resolve(registration);
        return navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(function (reg) {
                registration = reg;
                return reg;
            });
    }

    function currentSubscription() {
        return ensureRegistration()
            .then(function () { return navigator.serviceWorker.ready; })
            .then(function (reg) { return reg.pushManager.getSubscription(); })
            .catch(function () { return null; });
    }

    /* ---------- state / UI ---------- */

    function currentState() {
        if (isIOS && !standalone) return 'ios-install';
        if (Notification.permission === 'denied') return 'denied';
        if (Notification.permission === 'granted') return subscribed ? 'subscribed' : 'granted';
        return 'default';
    }

    var LABELS = {
        'subscribed': 'Уведомления включены',
        'granted': 'Включить уведомления',
        'default': 'Включить уведомления',
        'denied': 'Уведомления заблокированы',
        'ios-install': 'Установить на экран «Домой»'
    };

    function updateUI() {
        return currentSubscription().then(function (sub) {
            subscribed = !!sub;
            var state = currentState();
            var label = LABELS[state] || LABELS.default;

            document.querySelectorAll('[data-push-toggle]').forEach(function (el) {
                el.hidden = false;
                el.classList.toggle('on', state === 'subscribed');
                el.setAttribute('aria-checked', state === 'subscribed' ? 'true' : 'false');
                /* Кнопка-пункт в меню профиля показывает текст и подпись;
                   переключатель в настройках состоит из .toggle-slider, поэтому
                   текст в него не пишем, чтобы не стереть слайдер. */
                if (!el.querySelector('.toggle-slider')) {
                    el.textContent = label;
                }
                if (el.hasAttribute('data-push-label')) {
                    el.setAttribute('aria-label', label);
                }
            });
            document.querySelectorAll('[data-push-status]').forEach(function (el) {
                el.textContent = {
                    'subscribed': 'Push-уведомления включены на этом устройстве.',
                    'denied': 'Уведомления запрещены в настройках браузера.',
                    'ios-install': 'На iPhone уведомления работают после установки сайта на экран «Домой».',
                    'granted': 'Разрешение есть, но устройство ещё не подписано.',
                    'default': 'Включите, чтобы получать сообщения как в приложении.'
                }[state] || '';
            });
        });
    }

    /* ---------- subscribe / unsubscribe ---------- */

    function enable() {
        if (busy) return Promise.resolve();
        busy = true;

        var ask = Notification.permission === 'granted'
            ? Promise.resolve('granted')
            : Notification.requestPermission();

        return ask.then(function (permission) {
            if (permission !== 'granted') {
                toast('Уведомления не разрешены. Включите их в настройках браузера.');
                return;
            }
            return ensureRegistration()
                .then(function () { return navigator.serviceWorker.ready; })
                .then(function (reg) { return reg.pushManager.getSubscription(); })
                .then(function (sub) {
                    if (sub) return sub;
                    return reg_subscribe();
                })
                .then(function (sub) {
                    return post('/push/subscribe/', sub.toJSON());
                })
                .then(function (response) {
                    if (!response.ok) throw new Error('subscribe failed');
                    return updateUI();
                })
                .then(function () {
                    toast('Уведомления включены');
                });
        }).catch(function () {
            toast('Не удалось включить уведомления');
        }).finally(function () {
            busy = false;
        });
    }

    function reg_subscribe() {
        return navigator.serviceWorker.ready.then(function (reg) {
            return reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey)
            });
        });
    }

    function disable() {
        if (busy) return Promise.resolve();
        busy = true;

        return currentSubscription().then(function (sub) {
            if (!sub) return;
            var endpoint = sub.endpoint;
            return sub.unsubscribe()
                .catch(function () { /* подписка могла уже устареть */ })
                .then(function () {
                    return post('/push/unsubscribe/', { endpoint: endpoint });
                });
        }).then(function () {
            subscribed = false;
            return updateUI();
        }).then(function () {
            toast('Уведомления выключены');
        }).catch(function () {
            toast('Не удалось выключить уведомления');
        }).finally(function () {
            busy = false;
        });
    }

    function toggle() {
        var state = currentState();
        if (state === 'ios-install') {
            showInstallHint(true);
            toast('Добавьте SchoolHub на экран «Домой», чтобы включить уведомления.');
            return;
        }
        if (state === 'denied') {
            toast('Уведомления запрещены в настройках Safari/приложения.');
            return;
        }
        if (subscribed) disable();
        else enable();
    }

    /* ---------- iOS install hint ---------- */

    var hintEl = null;

    function showInstallHint(force) {
        if (!isIOS || standalone) return;
        if (!force && localStorage.getItem('sh-install-hint') === 'off') return;

        if (hintEl) {
            hintEl.classList.add('show');
            return;
        }

        hintEl = document.createElement('div');
        hintEl.className = 'ios-install-hint';
        hintEl.innerHTML =
            '<div class="ios-install-text">' +
                '<strong>Уведомления как в приложении</strong>' +
                '<span>Нажмите «Поделиться» <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg> и выберите «На экран «Домой»».</span>' +
            '</div>' +
            '<button type="button" class="ios-install-close" aria-label="Закрыть">×</button>';

        hintEl.querySelector('.ios-install-close').addEventListener('click', function () {
            hintEl.classList.remove('show');
            localStorage.setItem('sh-install-hint', 'off');
        });

        document.body.appendChild(hintEl);
        requestAnimationFrame(function () { hintEl.classList.add('show'); });
    }

    /* ---------- wiring ---------- */

    document.addEventListener('click', function (event) {
        var el = event.target.closest('[data-push-toggle]');
        if (!el) return;
        event.preventDefault();
        toggle();
    });

    navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'push:resubscribe') {
            if (Notification.permission === 'granted') enable();
        }
    });

    window.SchoolHubPush = {
        enable: enable,
        disable: disable,
        toggle: toggle,
        refresh: updateUI,
        isSupported: function () { return supported; }
    };

    function boot() {
        ensureRegistration().then(updateUI);
        if (isIOS && !standalone) {
            setTimeout(function () { showInstallHint(false); }, 1800);
        }
        /* Разрешение уже есть, а подписки нет (например, после переустановки) —
           восстанавливаем её без повторного запроса разрешения. */
        if (Notification.permission === 'granted') {
            currentSubscription().then(function (sub) {
                if (!sub) enable();
            });
        }
    }

    if (document.readyState === 'complete') boot();
    else window.addEventListener('load', boot);

    if (window.__pageInits) {
        window.__pageInits.push(function () { updateUI(); });
    }
})();
