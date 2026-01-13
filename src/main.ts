import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import compression from 'compression';
import helmet from 'helmet';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Security
    app.use(helmet());

    // CORS
    app.enableCors({
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        credentials: true,
    });

    // Compression
    app.use(compression());

    // Global validation pipe
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    // Swagger API Documentation
    const config = new DocumentBuilder()
        .setTitle('EVOA API')
        .setDescription('Production-ready backend for EVOA - Startup Discovery & Pitch Platform')
        .setVersion('1.0')
        .addBearerAuth()
        .addTag('Authentication', 'User authentication and authorization')
        .addTag('Reels', 'Feed system and reel interactions')
        .addTag('Pitch', 'Pitch details and investor features')
        .addTag('Meetings', 'Investor-founder meeting scheduling')
        .addTag('Startups', 'Startup management and following')
        .addTag('Explore', 'Search, trending, and discovery')
        .addTag('Notifications', 'User notifications')
        .addTag('Users', 'User profile management')
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    // Health check endpoint
    app.getHttpAdapter().get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        });
    });

    const port = process.env.PORT || 3000;
    await app.listen(port);

    console.log(`
  🚀 EVOA Backend is running!
  
  📍 API: http://localhost:${port}
  📚 Swagger Docs: http://localhost:${port}/api
  ❤️  Health Check: http://localhost:${port}/health
  
  Environment: ${process.env.NODE_ENV || 'development'}
  `);
}

bootstrap();
