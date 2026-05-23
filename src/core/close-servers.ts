export interface ClosableServer {
  id: number;
  rcon: { close: () => Promise<unknown> };
  logs: { close: () => Promise<void> };
}

export interface ShutdownHooks {
  destroyManager: (id: number) => Promise<void> | void;
  onError?: (scope: string, error: unknown) => void;
}

export const closeServers = async (
  servers: ClosableServer[],
  hooks: ShutdownHooks,
): Promise<void> => {
  for (const server of servers) {
    try {
      await hooks.destroyManager(server.id);
    } catch (e) {
      hooks.onError?.(`plugins[${server.id}]`, e);
    }
    try {
      await server.rcon.close();
    } catch (e) {
      hooks.onError?.(`rcon[${server.id}]`, e);
    }
    try {
      await server.logs.close();
    } catch (e) {
      hooks.onError?.(`logs[${server.id}]`, e);
    }
  }
};
