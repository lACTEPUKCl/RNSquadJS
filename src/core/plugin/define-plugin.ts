import { z } from 'zod';
import { PluginDefinition, SquadPlugin } from './types';

export function definePlugin<S extends z.ZodTypeAny>(
  def: PluginDefinition<S>,
): SquadPlugin {
  return def as unknown as SquadPlugin;
}
