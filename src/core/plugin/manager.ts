import { TLogger, TState } from '../../types';
import { PluginContext, PluginInstance, SquadPlugin } from './types';

export interface RegisteredPlugin {
  descriptor: SquadPlugin;
  enabled: boolean;
  rawOptions: Record<string, unknown>;
}

interface LoadedInstance {
  name: string;
  instance: PluginInstance;
  disposables: Array<() => void>;
}

export class PluginManager {
  private loaded: LoadedInstance[] = [];

  constructor(
    private readonly state: TState,
    private readonly logger: TLogger,
  ) {}

  async init(registry: RegisteredPlugin[]): Promise<void> {
    for (const reg of registry) {
      const { name } = reg.descriptor;
      this.logger.log(`Initializing plugin: ${name}`);

      if (!reg.enabled) {
        this.logger.warn(`Disabled plugin: ${name}`);
        continue;
      }

      try {
        const options = this.resolveOptions(reg);
        if (options === undefined) continue;

        const disposables: Array<() => void> = [];
        const ctx: PluginContext = {
          state: this.state,
          options,
          logger: this.logger,
          registerDisposable: (d) =>
            disposables.push(typeof d === 'function' ? d : () => d.dispose()),
        };

        const result: unknown = await reg.descriptor.setup(ctx);
        const instance: PluginInstance =
          result && typeof result === 'object'
            ? (result as PluginInstance)
            : {};
        this.loaded.push({ name, instance, disposables });
        this.logger.log(`Initialized plugin: ${name}`);
      } catch (e) {
        this.logger.error(
          `Plugin "${name}" failed to initialize: ${String(e)}`,
        );
      }
    }
  }

  private resolveOptions(
    reg: RegisteredPlugin,
  ): Record<string, unknown> | undefined {
    if (!reg.descriptor.optionsSchema) return reg.rawOptions;

    const parsed = reg.descriptor.optionsSchema.safeParse(reg.rawOptions);
    if (!parsed.success) {
      this.logger.error(
        `Plugin "${reg.descriptor.name}" has invalid options: ${parsed.error.message}`,
      );
      return undefined;
    }
    return parsed.data as Record<string, unknown>;
  }

  async destroyAll(): Promise<void> {
    for (const item of [...this.loaded].reverse()) {
      for (const dispose of item.disposables) {
        try {
          dispose();
        } catch (e) {
          this.logger.error(`Dispose error in "${item.name}": ${String(e)}`);
        }
      }
      try {
        await item.instance.destroy?.();
      } catch (e) {
        this.logger.error(`Destroy error in "${item.name}": ${String(e)}`);
      }
    }
    this.loaded = [];
  }

  get loadedCount(): number {
    return this.loaded.length;
  }
}
