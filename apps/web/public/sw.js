const CACHE_NAME = 'cairn-v2';
const SHELL_URLS = ['/chats', '/', '/auth/login'];
// 開発時は登録側（service-worker-registrar.tsx）が ?dev=1 を付ける。dev サーバーのチャンクは
// 内容が変わってもファイル名が変わらず、キャッシュから返すと編集が反映されないため、
// 開発時はキャッシュを一切使わず、以前に溜めたキャッシュも消す（push 通知だけ動かす）
const IS_DEV = new URL(self.location.href).searchParams.get('dev') === '1';

self.addEventListener('install', (event) => {
  if (!IS_DEV) {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
    );
  }
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => IS_DEV || k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (IS_DEV) return;
  const { request } = event;
  const url = new URL(request.url);

  // Static assets: Cache First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // API routes: Network First
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Navigation: Network First, fallback to /chats cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/chats').then((cached) => cached ?? new Response('Offline', { status: 503 }))
      )
    );
    return;
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() ?? '' };
  }
  const tasks = [
    self.registration.showNotification(data.title ?? 'Cairn', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/chats' },
    }),
  ];

  // ホーム画面 PWA のアイコンに未読バッジを付ける（iOS 16.4+ / Android / デスクトップ）。
  // アプリ非起動時はこの Service Worker だけが動くため、バッジ更新はここで行う必要がある。
  // バッジ更新の失敗（未対応環境で setAppBadge が reject する等）は握りつぶす。
  // ここで reject させると Promise.all 全体が失敗し、成功しうる通知配信まで
  // 「push 失敗」と扱われてしまうため、通知配信とバッジ対応可否を結合させない
  if (typeof data.badgeCount === 'number' && 'setAppBadge' in self.navigator) {
    const badgePromise = data.badgeCount > 0
      ? self.navigator.setAppBadge(data.badgeCount)
      : self.navigator.clearAppBadge();
    tasks.push(Promise.resolve(badgePromise).catch(() => {}));
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/chats';
  event.waitUntil(
    (async () => {
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      // 既存ウィンドウがあればフォーカスして通知の URL へ遷移させる
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(url); } catch { /* クロスオリジン等で失敗しても focus 済み */ }
          }
          return;
        }
      }
      if (clients.openWindow) await clients.openWindow(url);
    })()
  );
});
