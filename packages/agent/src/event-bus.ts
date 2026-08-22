import { EventEmitter } from 'events';
import { ServerEvent } from '@ks-agent/types';

export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emit(event: ServerEvent) {
    this.emitter.emit('event', event);
  }

  on(handler: (event: ServerEvent) => void) {
    const wrapped = (e: ServerEvent) => handler(e);
    this.emitter.on('event', wrapped);
    return () => this.emitter.off('event', wrapped);
  }
}
