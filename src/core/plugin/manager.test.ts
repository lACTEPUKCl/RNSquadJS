import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createFakeState } from '../../test/fakes';
import { definePlugin } from './define-plugin';
import { PluginManager, RegisteredPlugin } from './manager';

const makeManager = () => {
  const { state } = createFakeState();
  return new PluginManager(state, state.logger);
};

const reg = (
  descriptor: RegisteredPlugin['descriptor'],
  enabled = true,
  rawOptions: Record<string, unknown> = {},
): RegisteredPlugin => ({ descriptor, enabled, rawOptions });

describe('PluginManager', () => {
  it('applies zod defaults to options before calling setup', async () => {
    let received: Record<string, unknown> | undefined;
    const plugin = definePlugin({
      name: 'opt',
      optionsSchema: z.object({
        needVotes: z.number().default(15),
        label: z.string().default('x'),
      }),
      setup(ctx) {
        received = ctx.options as Record<string, unknown>;
      },
    });

    await makeManager().init([reg(plugin)]);

    expect(received).toEqual({ needVotes: 15, label: 'x' });
  });

  it('cleans up disposables and calls destroy on destroyAll', async () => {
    const dispose = vi.fn();
    const destroy = vi.fn();
    const plugin = definePlugin({
      name: 'life',
      optionsSchema: z.object({}),
      setup(ctx) {
        ctx.registerDisposable(dispose);
        return { destroy };
      },
    });

    const mgr = makeManager();
    await mgr.init([reg(plugin)]);
    expect(mgr.loadedCount).toBe(1);

    await mgr.destroyAll();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(mgr.loadedCount).toBe(0);
  });

  it('isolates a failing plugin so others still load', async () => {
    const good = vi.fn();
    const bad = definePlugin({
      name: 'bad',
      optionsSchema: z.object({}),
      setup() {
        throw new Error('boom');
      },
    });
    const ok = definePlugin({
      name: 'ok',
      optionsSchema: z.object({}),
      setup() {
        good();
      },
    });

    const mgr = makeManager();
    await mgr.init([reg(bad), reg(ok)]);

    expect(good).toHaveBeenCalledTimes(1);
    expect(mgr.loadedCount).toBe(1);
  });

  it('does not initialize a disabled plugin', async () => {
    const setup = vi.fn();
    const plugin = definePlugin({
      name: 'dis',
      optionsSchema: z.object({}),
      setup,
    });

    const mgr = makeManager();
    await mgr.init([reg(plugin, false)]);

    expect(setup).not.toHaveBeenCalled();
    expect(mgr.loadedCount).toBe(0);
  });

  it('skips a plugin whose options fail validation', async () => {
    const strictSetup = vi.fn();
    const okSetup = vi.fn();
    const strict = definePlugin({
      name: 'strict',
      optionsSchema: z.object({ n: z.number() }),
      setup: strictSetup,
    });
    const ok = definePlugin({
      name: 'ok',
      optionsSchema: z.object({}),
      setup: okSetup,
    });

    const mgr = makeManager();
    await mgr.init([reg(strict, true, { n: 'nope' }), reg(ok)]);

    expect(strictSetup).not.toHaveBeenCalled();
    expect(okSetup).toHaveBeenCalledTimes(1);
    expect(mgr.loadedCount).toBe(1);
  });
});
