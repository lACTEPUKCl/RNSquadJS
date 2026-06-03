import EventEmitter from 'events';

export interface TypedEmitter<M extends Record<string, unknown>> {
  on<K extends keyof M & string>(
    event: K,
    listener: (payload: M[K]) => void,
  ): this;
  off<K extends keyof M & string>(
    event: K,
    listener: (payload: M[K]) => void,
  ): this;
  once<K extends keyof M & string>(
    event: K,
    listener: (payload: M[K]) => void,
  ): this;
  emit<K extends keyof M & string>(event: K, payload: M[K]): boolean;
}

export const asTypedEmitter = <M extends Record<string, unknown>>(
  emitter: EventEmitter,
): TypedEmitter<M> => emitter as unknown as TypedEmitter<M>;
