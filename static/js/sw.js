/* SchoolHub service worker: Web Push + клики по уведомлениям.
 * Отдаётся Django-вью с корня сайта (/sw.js), поэтому scope = "/".
 */

const DEFAULT_ICON = '/static/icons/icon-192.png?v=2';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { body: event.data ? event.data.text() : '' };
    }

    const title = data.title || 'SchoolHub';
    const options = {
        body: data.body || '',
        icon: data.icon || DEFAULT_ICON,
        badge: data.badge || DEFAULT_ICON,
        data: { url: data.url || '/' },
    };

    if (data.tag) {
        options.tag = data.tag;
        options.renotify = true;
    }

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
        });

        for (const client of windows) {
            if (new URL(client.url).origin !== self.location.origin) continue;
            await client.focus();
            if ('navigate' in client) {
                try {
                    await client.navigate(url);
                } catch (e) { /* некоторые браузеры не дают navigate */ }
            }
            return;
        }

        if (self.clients.openWindow) {
            await self.clients.openWindow(url);
        }
    })());
});

/* iOS может пересоздать подписку — просим открытые вкладки переподписаться. */
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
        });
        for (const client of windows) {
            client.postMessage({ type: 'push:resubscribe' });
        }
    })());
});
