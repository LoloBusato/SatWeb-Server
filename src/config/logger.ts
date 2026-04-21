import pino from 'pino';
import { env } from './env';

const usePretty = env.NODE_ENV === 'development';
const defaultLevel = env.NODE_ENV === 'production' ? 'info' : 'debug';
const level = process.env.LOG_LEVEL ?? defaultLevel;

export const logger = pino({
  level,
  ...(usePretty && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
    },
  }),
});
