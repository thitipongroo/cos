// Unit tests — NotificationSseService (Phase 20)

import { NotificationSseService } from '../notification.sse.service';
import type { NotificationRow } from '../notification.repository';

const notif: NotificationRow = {
  notification_id: 'n1',
  tenant_id: 'tenant-001',
  recipient_id: 'user-001',
  channel: 'IN_APP',
  event_type: 'site.inspection.failed.v1',
  subject: 'Alert',
  body: 'Inspection failed',
  status: 'PENDING',
  sent_at: null,
  read_at: null,
  created_at: new Date(),
};

describe('NotificationSseService', () => {
  let svc: NotificationSseService;

  beforeEach(() => {
    svc = new NotificationSseService();
  });

  afterEach(() => {
    svc.onModuleDestroy();
  });

  describe('stream', () => {
    it('returns an Observable for a new user', () => {
      const obs = svc.stream('user-1');
      expect(obs).toBeDefined();
      expect(typeof obs.subscribe).toBe('function');
    });

    it('returns the same Observable for an existing user', () => {
      const obs1 = svc.stream('user-1');
      const obs2 = svc.stream('user-1');
      // Both should be from the same underlying Subject (subscribe both)
      const results: string[] = [];
      obs1.subscribe({ next: (e) => results.push('obs1:' + e.data.notification_id) });
      obs2.subscribe({ next: (e) => results.push('obs2:' + e.data.notification_id) });
      svc.push('user-1', notif);
      expect(results).toContain('obs1:n1');
      expect(results).toContain('obs2:n1');
    });
  });

  describe('push', () => {
    it('emits notification to subscribed user stream', (done) => {
      const obs = svc.stream('user-1');
      obs.subscribe({
        next: (event) => {
          expect(event.data.notification_id).toBe('n1');
          done();
        },
      });
      svc.push('user-1', notif);
    });

    it('is a no-op when user has no active stream', () => {
      expect(() => svc.push('unknown-user', notif)).not.toThrow();
    });
  });

  // The Subject map used to grow forever: every userId that ever opened a stream left one behind.
  describe('subscriber lifecycle', () => {
    const liveStreams = (s: NotificationSseService) =>
      (s as unknown as { streams: Map<string, unknown> }).streams.size;

    it('holds nothing for an Observable that is never subscribed', () => {
      svc.stream('user-1');
      expect(liveStreams(svc)).toBe(0);
    });

    it('drops the subject when the last subscriber disconnects', () => {
      const sub = svc.stream('user-1').subscribe();
      expect(liveStreams(svc)).toBe(1);

      sub.unsubscribe();
      expect(liveStreams(svc)).toBe(0);
    });

    it('keeps the subject while another subscriber is still connected', () => {
      const a = svc.stream('user-1').subscribe();
      const b = svc.stream('user-1').subscribe();

      a.unsubscribe();
      expect(liveStreams(svc)).toBe(1);

      b.unsubscribe();
      expect(liveStreams(svc)).toBe(0);
    });

    it('a reconnecting user gets a working stream again', () => {
      svc.stream('user-1').subscribe().unsubscribe();

      const received: string[] = [];
      svc.stream('user-1').subscribe({ next: (e) => received.push(e.data.notification_id) });
      svc.push('user-1', notif);

      expect(received).toEqual(['n1']);
    });
  });

  describe('onModuleDestroy', () => {
    it('completes all subjects without throwing', () => {
      svc.stream('user-a');
      svc.stream('user-b');
      expect(() => svc.onModuleDestroy()).not.toThrow();
    });

    it('clears all streams (push is no-op after destroy)', () => {
      svc.stream('user-a');
      svc.onModuleDestroy();
      // After destroy, push should be a no-op (stream map is cleared)
      expect(() => svc.push('user-a', notif)).not.toThrow();
    });
  });
});
