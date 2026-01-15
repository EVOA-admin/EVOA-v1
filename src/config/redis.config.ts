// import { createClient } from 'redis';

// export const redisClientFactory = {
//     provide: 'REDIS_CLIENT',
//     useFactory: async () => {
//         const client = createClient({
//             socket: {
//                 host: process.env.REDIS_HOST || 'localhost',
//                 port: parseInt(process.env.REDIS_PORT || '6379', 10),
//             },
//             password: process.env.REDIS_PASSWORD || undefined,
//         });

//         client.on('error', (err) => console.error('Redis Client Error', err));
//         client.on('connect', () => console.log('Redis Client Connected'));

//         await client.connect();
//         return client;
//     },
// };

// export class RedisService {
//     constructor(private readonly client: any) { }

//     async get(key: string): Promise<string | null> {
//         return await this.client.get(key);
//     }

//     async set(key: string, value: string, ttl?: number): Promise<void> {
//         if (ttl) {
//             await this.client.setEx(key, ttl, value);
//         } else {
//             await this.client.set(key, value);
//         }
//     }

//     async del(key: string): Promise<void> {
//         await this.client.del(key);
//     }

//     async exists(key: string): Promise<boolean> {
//         return (await this.client.exists(key)) === 1;
//     }

//     async incr(key: string): Promise<number> {
//         return await this.client.incr(key);
//     }

//     async expire(key: string, seconds: number): Promise<void> {
//         await this.client.expire(key, seconds);
//     }
// }


import { createClient } from 'redis';

export const redisClientFactory = {
    provide: 'REDIS_CLIENT',
    useFactory: async () => {
        // 🚫 Redis not configured → disable gracefully
        if (!process.env.REDIS_HOST) {
            console.warn('⚠️ Redis is disabled (no REDIS_HOST)');
            return null;
        }

        const client = createClient({
            socket: {
                host: process.env.REDIS_HOST,
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
            },
            password: process.env.REDIS_PASSWORD || undefined,
        });

        client.on('error', (err) =>
            console.error('Redis Client Error', err),
        );
        client.on('connect', () =>
            console.log('✅ Redis Client Connected'),
        );

        await client.connect();
        return client;
    },
};

export class RedisService {
    constructor(private readonly client: any) { }

    private isDisabled() {
        return !this.client;
    }

    async get(key: string): Promise<string | null> {
        if (this.isDisabled()) return null;
        return this.client.get(key);
    }

    async set(key: string, value: string, ttl?: number): Promise<void> {
        if (this.isDisabled()) return;
        if (ttl) {
            await this.client.setEx(key, ttl, value);
        } else {
            await this.client.set(key, value);
        }
    }

    async del(key: string): Promise<void> {
        if (this.isDisabled()) return;
        await this.client.del(key);
    }

    async exists(key: string): Promise<boolean> {
        if (this.isDisabled()) return false;
        return (await this.client.exists(key)) === 1;
    }

    async incr(key: string): Promise<number> {
        if (this.isDisabled()) return 0;
        return this.client.incr(key);
    }

    async expire(key: string, seconds: number): Promise<void> {
        if (this.isDisabled()) return;
        await this.client.expire(key, seconds);
    }
}
