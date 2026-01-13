import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as bcrypt from 'bcrypt';

config();

const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'evoa',
});

async function seed() {
    try {
        await dataSource.initialize();
        console.log('Database connected');

        // Create sample users
        const passwordHash = await bcrypt.hash('Password123!', 10);

        const users = [
            {
                email: 'viewer@evoa.com',
                password_hash: passwordHash,
                full_name: 'John Viewer',
                role: 'viewer',
                bio: 'Passionate about startups and innovation',
            },
            {
                email: 'founder@evoa.com',
                password_hash: passwordHash,
                full_name: 'Sarah Founder',
                role: 'founder',
                bio: 'Building the next big thing in AI',
                company: 'AI Innovations Inc',
            },
            {
                email: 'investor@evoa.com',
                password_hash: passwordHash,
                full_name: 'Michael Investor',
                role: 'investor',
                bio: 'Seed stage investor focused on SaaS and AI',
                company: 'Venture Capital Partners',
            },
            {
                email: 'incubator@evoa.com',
                password_hash: passwordHash,
                full_name: 'Lisa Incubator',
                role: 'incubator',
                bio: 'Helping startups grow and scale',
                company: 'TechHub Incubator',
            },
        ];

        console.log('Creating users...');
        for (const user of users) {
            await dataSource.query(
                `INSERT INTO users (email, password_hash, full_name, role, bio, company) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO NOTHING`,
                [user.email, user.password_hash, user.full_name, user.role, user.bio, user.company || null],
            );
        }

        // Get founder user
        const [founder] = await dataSource.query(
            `SELECT id FROM users WHERE email = 'founder@evoa.com'`,
        );

        if (founder) {
            // Create sample startups
            const startups = [
                {
                    founder_id: founder.id,
                    name: 'AI Assistant Pro',
                    tagline: 'Your intelligent productivity companion',
                    description: 'AI-powered assistant that helps teams collaborate and work smarter',
                    industry: 'AI/ML',
                    stage: 'seed',
                    raising_amount: 500000,
                    equity_percentage: 10,
                    revenue: 50000,
                },
                {
                    founder_id: founder.id,
                    name: 'EcoTrack',
                    tagline: 'Sustainability tracking made simple',
                    description: 'Platform for businesses to track and reduce their carbon footprint',
                    industry: 'Climate Tech',
                    stage: 'pre-seed',
                    raising_amount: 250000,
                    equity_percentage: 15,
                    revenue: 10000,
                },
                {
                    founder_id: founder.id,
                    name: 'HealthHub',
                    tagline: 'Personalized health insights',
                    description: 'AI-driven health monitoring and personalized wellness recommendations',
                    industry: 'HealthTech',
                    stage: 'seed',
                    raising_amount: 750000,
                    equity_percentage: 12,
                    revenue: 100000,
                },
            ];

            console.log('Creating startups...');
            for (const startup of startups) {
                const [result] = await dataSource.query(
                    `INSERT INTO startups (founder_id, name, tagline, description, industry, stage, raising_amount, equity_percentage, revenue)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
                    [
                        startup.founder_id,
                        startup.name,
                        startup.tagline,
                        startup.description,
                        startup.industry,
                        startup.stage,
                        startup.raising_amount,
                        startup.equity_percentage,
                        startup.revenue,
                    ],
                );

                // Create sample reel for each startup
                await dataSource.query(
                    `INSERT INTO reels (startup_id, title, description, video_url, thumbnail_url, hashtags, is_featured)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        result.id,
                        `${startup.name} Pitch`,
                        `Watch our pitch for ${startup.name}`,
                        'https://example.com/video.mp4',
                        'https://example.com/thumbnail.jpg',
                        [startup.industry.toLowerCase(), 'startup', 'pitch'],
                        Math.random() > 0.5,
                    ],
                );
            }
        }

        // Create sample hashtags
        const hashtags = [
            { tag: 'ai', usage_count: 150 },
            { tag: 'saas', usage_count: 120 },
            { tag: 'climatetech', usage_count: 80 },
            { tag: 'healthtech', usage_count: 90 },
            { tag: 'fintech', usage_count: 110 },
            { tag: 'startup', usage_count: 200 },
            { tag: 'pitch', usage_count: 180 },
            { tag: 'innovation', usage_count: 95 },
        ];

        console.log('Creating hashtags...');
        for (const hashtag of hashtags) {
            await dataSource.query(
                `INSERT INTO hashtags (tag, usage_count)
         VALUES ($1, $2)
         ON CONFLICT (tag) DO NOTHING`,
                [hashtag.tag, hashtag.usage_count],
            );
        }

        console.log('✅ Seed data created successfully!');
        console.log('\nTest Accounts:');
        console.log('- Viewer: viewer@evoa.com / Password123!');
        console.log('- Founder: founder@evoa.com / Password123!');
        console.log('- Investor: investor@evoa.com / Password123!');
        console.log('- Incubator: incubator@evoa.com / Password123!');

        await dataSource.destroy();
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seed();
