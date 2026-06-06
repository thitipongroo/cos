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

  stream(userId: string): Observable<SseMessageEvent> {
    if (!this.streams.has(userId)) {
      this.streams.set(userId, new Subject<SseMessageEvent>());
    }
    return this.streams.get(userId)!.asObservable();
  }

  push(userId: string, notification: NotificationRow): void {
    this.streams.get(userId)?.next({ data: notification });
  }

  onModuleDestroy(): void {
    for (const subject of this.streams.values()) {
      subject.complete();
    }
    this.streams.clear();
  }
}
