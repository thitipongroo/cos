// NotificationSseService — in-memory per-user SSE stream management.
// Singleton: one Subject per userId, shared across all requests on this process.
// MVP caveat: SSE state is process-local; horizontal scaling requires a pub/sub broker.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type { NotificationRow } from './notification.repository';

export interface SseMessageEvent {
  data: NotificationRow;
}

@Injectable()
export class NotificationSseService implements OnModuleDestroy {
  private readonly streams = new Map<string, Subject<SseMessageEvent>>();
  /** Live subscriber count per userId — a Subject is dropped when its last listener disconnects. */
  private readonly subscribers = new Map<string, number>();

  /**
   * Observable of notifications for one user.
   *
   * The Subject is reference-counted: created on first subscribe, completed and dropped when the
   * last subscriber disconnects. Without this the map only ever grew — every distinct userId that
   * ever opened an SSE connection left a Subject behind for the life of the process, connected or
   * not. Acquisition is deferred to subscribe time (rather than done here) so that merely obtaining
   * the Observable without subscribing does not itself pin an entry.
   */
  stream(userId: string): Observable<SseMessageEvent> {
    return new Observable<SseMessageEvent>((subscriber) => {
      const subject = this.acquire(userId);
      const inner = subject.subscribe(subscriber);
      return () => {
        inner.unsubscribe();
        this.release(userId);
      };
    });
  }

  /** Get-or-create this user's Subject and count one more subscriber against it. */
  private acquire(userId: string): Subject<SseMessageEvent> {
    let subject = this.streams.get(userId);
    if (!subject) {
      subject = new Subject<SseMessageEvent>();
      this.streams.set(userId, subject);
    }
    this.subscribers.set(userId, (this.subscribers.get(userId) ?? 0) + 1);
    return subject;
  }

  push(userId: string, notification: NotificationRow): void {
    this.streams.get(userId)?.next({ data: notification });
  }

  /** Drop one subscriber; complete and forget the Subject when none are left. */
  private release(userId: string): void {
    // The `?? 1` is unreachable and kept only as a guard. release() runs solely from the teardown in
    // stream(), which always follows an acquire() that set a count >= 1 — and on shutdown the
    // Subjects are completed BEFORE the maps are cleared, so those teardowns also see their counter.
    // Reaching it would mean a subtraction on undefined (NaN, so `NaN > 0` is false) silently
    // dropping a live Subject. Same idiom as audit.interceptor.ts / cidr-match.ts.
    const remaining = (this.subscribers.get(userId) ?? /* istanbul ignore next */ 1) - 1;
    if (remaining > 0) {
      this.subscribers.set(userId, remaining);
      return;
    }
    this.subscribers.delete(userId);
    const subject = this.streams.get(userId);
    this.streams.delete(userId);
    subject?.complete();
  }

  onModuleDestroy(): void {
    for (const subject of this.streams.values()) {
      subject.complete();
    }
    this.streams.clear();
    this.subscribers.clear();
  }
}
