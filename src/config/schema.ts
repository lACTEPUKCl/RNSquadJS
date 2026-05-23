import { z } from 'zod';

export const pluginRefSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(false),
  options: z.record(z.unknown()).default({}),
});

export const serverConfigSchema = z.object({
  host: z.string().min(1),
  password: z.string().min(1),
  port: z.coerce.number().int().positive(),
  logFilePath: z.string().min(1),
  adminsFilePath: z.string().min(1),
  mapsName: z.string().min(1),
  db: z.string().optional(),
  database: z.string().optional(),
  mapsRegExp: z.string().optional(),
  ftp: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional(),
  plugins: z.array(pluginRefSchema).default([]),
});

export type PluginRef = z.infer<typeof pluginRefSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
