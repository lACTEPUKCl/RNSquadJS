import WebSocket from 'ws';

type BridgeLogger = {
  log: (message: string) => unknown;
  warn?: (message: string) => unknown;
  error: (message: string) => unknown;
};

type BridgeEvent = Record<string, unknown> & {
  eventId: string;
  seq: number;
  protocol: number;
};

type Options = {
  url?: string;
  token?: string;
  serverKey: string;
  logger: BridgeLogger;
};

const MAX_QUEUE = 2_000;
const BATCH_SIZE = 100;

export function createActivityBridgeClient({
  url,
  token,
  serverKey,
  logger,
}: Options) {
  const endpoint = String(url || '').trim();
  const secret = String(token || '').trim();
  const enabled = Boolean(endpoint && secret && serverKey);
  const queue: BridgeEvent[] = [];
  let socket: WebSocket | null = null;
  let inFlight: BridgeEvent[] | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let flushTimer: NodeJS.Timeout | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let reconnectMs = 1_000;
  let stopped = false;

  const scheduleFlush = () => {
    if (flushTimer || stopped) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 100);
    flushTimer.unref?.();
  };

  const flush = () => {
    if (
      !enabled ||
      inFlight ||
      !queue.length ||
      socket?.readyState !== WebSocket.OPEN
    )
      return;
    inFlight = queue.slice(0, BATCH_SIZE);
    try {
      socket.send(
        JSON.stringify({ type: 'events', protocol: 1, events: inFlight }),
      );
    } catch {
      inFlight = null;
      socket.close();
    }
  };

  const scheduleReconnect = () => {
    if (!enabled || stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectMs);
    reconnectTimer.unref?.();
    reconnectMs = Math.min(30_000, reconnectMs * 2);
  };

  const connect = () => {
    if (
      !enabled ||
      stopped ||
      socket?.readyState === WebSocket.OPEN ||
      socket?.readyState === WebSocket.CONNECTING
    )
      return;
    try {
      socket = new WebSocket(endpoint, {
        perMessageDeflate: false,
        handshakeTimeout: 10_000,
        headers: {
          Authorization: `Bearer ${secret}`,
          'X-RNS-Server-Key': serverKey,
        },
      });
      socket.on('open', () => {
        reconnectMs = 1_000;
        logger.log(`[ActivityBridge] connected: ${serverKey}`);
        clearInterval(heartbeatTimer as NodeJS.Timeout);
        heartbeatTimer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping', at: Date.now() }));
          }
        }, 15_000);
        heartbeatTimer.unref?.();
        flush();
      });
      socket.on('message', (raw) => {
        let payload: { type?: string } | null = null;
        try {
          payload = JSON.parse(raw.toString()) as { type?: string };
        } catch {
          return;
        }
        if (payload?.type === 'ack' && inFlight) {
          queue.splice(0, inFlight.length);
          inFlight = null;
          scheduleFlush();
        }
      });
      socket.on('close', () => {
        inFlight = null;
        clearInterval(heartbeatTimer as NodeJS.Timeout);
        heartbeatTimer = null;
        scheduleReconnect();
      });
      socket.on('error', (error) => {
        logger.warn?.(`[ActivityBridge] ${serverKey}: ${error.message}`);
      });
    } catch (error) {
      logger.warn?.(`[ActivityBridge] connect failed: ${String(error)}`);
      scheduleReconnect();
    }
  };

  if (enabled) connect();

  return {
    enabled,
    enqueue(event: BridgeEvent) {
      if (!enabled || stopped) return;
      queue.push(event);
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      scheduleFlush();
      connect();
    },
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (flushTimer) clearTimeout(flushTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      socket?.close();
      socket = null;
    },
  };
}
