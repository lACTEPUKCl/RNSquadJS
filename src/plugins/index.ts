import {
  adaptLegacyPlugin,
  PluginManager,
  RegisteredPlugin,
} from '../core/plugin';
import { getServersState } from '../serversState';
import { legacyManifest, nativeManifest } from './registry';

const pluginManagers = new Map<number, PluginManager>();

export const getPluginManager = (id: number): PluginManager | undefined =>
  pluginManagers.get(id);

export const initPlugins = async (id: number): Promise<PluginManager> => {
  const state = getServersState(id);
  const manager = new PluginManager(state, state.logger);

  const legacy: RegisteredPlugin[] = legacyManifest.map(({ name, plugin }) => {
    const cfg = state.plugins.find((p) => p.name === name);
    return {
      descriptor: adaptLegacyPlugin(name, plugin),
      enabled: Boolean(cfg && cfg.enabled),
      rawOptions: (cfg?.options ?? {}) as Record<string, unknown>,
    };
  });

  const native: RegisteredPlugin[] = nativeManifest.map((descriptor) => {
    const cfg = state.plugins.find((p) => p.name === descriptor.name);
    return {
      descriptor,
      enabled: Boolean(cfg && cfg.enabled),
      rawOptions: (cfg?.options ?? {}) as Record<string, unknown>,
    };
  });

  await manager.init([...legacy, ...native]);
  pluginManagers.set(id, manager);
  return manager;
};
