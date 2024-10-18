import { Client, GatewayIntentBits } from 'discord.js';
import { TPluginProps } from '../types';

export const discord: TPluginProps = (state, options) => {
  const { logger } = state;

  return new Promise(() => {
    if (typeof options !== 'object' || !options || !('token' in options)) {
      logger.error('[Discord] Token is missing in options.');
      return;
    }

    const { token } = options as { token: string };
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    client.once('ready', () => {
      logger.log(`[Discord] Logged in as ${client.user?.tag}`);

      state.discord = {
        sendMessage(channelId, text) {
          const channel = client.channels.cache.get(channelId);

          if (!channel) {
            logger.error(
              `[Discord] Failed to send message: Channel not found.`,
            );
            return;
          }

          if (channel.isTextBased()) {
            channel
              .send(text)
              .then(() =>
                logger.log(`[Discord] Message sent to channel ${channelId}.`),
              )
              .catch((err) =>
                logger.error(
                  `[Discord] Failed to send message: ${err.message}`,
                ),
              );
          } else {
            logger.error(`[Discord] Channel ${channelId} is not text-based.`);
          }
        },
      };
    });

    client.on('error', (error) => {
      logger.error(`[Discord] Error: ${error.message}`);
    });

    client.login(token).catch((error) => {
      logger.error(`[Discord] Failed to login: ${error.message}`);
    });
  });
};
