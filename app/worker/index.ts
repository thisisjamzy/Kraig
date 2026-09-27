// Custom service-worker code, bundled into the generated sw.js by
// @ducanh2912/next-pwa. Insights notifications (src/shared/insights/
// notify.ts) carry the page to open in `data.url`; tapping one focuses an
// open window on it, or opens a new one.
//
// The few service-worker types used are declared here — the app's own
// TypeScript setup only includes the DOM ones.

interface ClickEvent {
  notification: { close(): void; data: unknown };
  waitUntil(promise: Promise<unknown>): void;
}
interface WindowClientLike {
  focus?: () => Promise<unknown>;
  navigate?: (url: string) => Promise<unknown>;
}
declare const self: {
  addEventListener(type: 'notificationclick', listener: (event: ClickEvent) => void): void;
  clients: {
    matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<WindowClientLike[]>;
    openWindow(url: string): Promise<unknown>;
  };
};

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/projects/insights';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => client.focus);
      if (open) {
        await open.navigate?.(url).catch(() => undefined);
        return open.focus?.();
      }
      return self.clients.openWindow(url);
    })()
  );
});

export {};
