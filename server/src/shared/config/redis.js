const Redis = require('ioredis');

const host = process.env.REDIS_HOST || 'localhost';
const isTLS = host.includes('upstash.io') || process.env.REDIS_TLS === 'true';

const redisClient = new Redis({
  host: host,
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  ...(isTLS && { tls: {} }),
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redisClient.on('connect', () => {
  console.log('Redis connected successfully');
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

module.exports = redisClient;
