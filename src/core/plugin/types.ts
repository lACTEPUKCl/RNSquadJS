import { z } from 'zod';
import { TLogger, TState } from '../../types';

export interface Disposable {
  dispose(): void;
}

export interface PluginInstance {
  destroy?(): void | Promise<void>;
}

export interface PluginContext<O = Record<string, unknown>> {
  state: TState;
  options: O;
  logger: TLogger;
  registerDisposable(d: Disposable | (() => void)): void;
}

export interface PluginDefinition<S extends z.ZodTypeAny> {
  name: string;
  description?: string;
  version?: string;
  optionsSchema: S;

  dependsOn?: string[];
  setup(
    ctx: PluginContext<z.infer<S>>,
  ): PluginInstance | void | Promise<PluginInstance | void>;
}

export interface SquadPlugin {
  name: string;
  description?: string;
  version?: string;
  optionsSchema?: z.ZodTypeAny;
  dependsOn?: string[];
  setup(
    ctx: PluginContext,
  ): PluginInstance | void | Promise<PluginInstance | void>;
}
