export interface ApplicationEvents {
  'supplier-order.created': { barcode: string; orderId: number; received: boolean };
  'supplier-order.received': { barcode: string; orderId: number; itemCount: number };
  'supplier-order.item-updated': { barcode: string; orderId: number; itemId: number };
  'supplier-order.item-deleted': { barcode: string; orderId: number; itemId: number };
}

type EventHandler<T> = (payload: T) => void | Promise<void>;

export class ApplicationEventBus {
  private readonly handlers = new Map<keyof ApplicationEvents, Array<EventHandler<never>>>();

  constructor(private readonly reportError: (event: keyof ApplicationEvents, error: unknown) => void) {}

  on<K extends keyof ApplicationEvents>(event: K, handler: EventHandler<ApplicationEvents[K]>): void {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler as EventHandler<never>);
    this.handlers.set(event, handlers);
  }

  publish<K extends keyof ApplicationEvents>(event: K, payload: ApplicationEvents[K]): void {
    queueMicrotask(() => {
      for (const handler of this.handlers.get(event) ?? []) {
        try {
          const result = handler(payload as never);
          void Promise.resolve(result).catch((error: unknown) => this.reportError(event, error));
        } catch (error) {
          this.reportError(event, error);
        }
      }
    });
  }
}
