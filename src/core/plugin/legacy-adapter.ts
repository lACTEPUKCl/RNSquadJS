import { TPluginOptions, TPluginProps } from '../../types';
import { SquadPlugin } from './types';

export function adaptLegacyPlugin(
  name: string,
  fn: TPluginProps,
  meta: { description?: string; version?: string } = {},
): SquadPlugin {
  return {
    name,
    description: meta.description,
    version: meta.version,
    setup(ctx) {
      fn(ctx.state, ctx.options as unknown as TPluginOptions);
    },
  };
}
