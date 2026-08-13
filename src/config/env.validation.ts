import { plainToClass } from 'class-transformer';
import { IsString, IsNumber, IsEnum, IsOptional, validateSync } from 'class-validator';

enum Environment {
    Development = 'development',
    Production = 'production',
    Test = 'test',
}

class EnvironmentVariables {
    @IsOptional()
    @IsEnum(Environment)
    NODE_ENV: Environment = Environment.Development;

    @IsOptional()
    @IsNumber()
    PORT: number = 3000;

    @IsString()
    JWT_SECRET: string;

    @IsOptional()
    @IsString()
    JWT_EXPIRATION: string = '7d';

    @IsOptional()
    @IsString()
    DATABASE_URL: string = '';

    @IsOptional()
    @IsString()
    DATABASE_USE_URL: string = '';

    @IsOptional()
    @IsString()
    DATABASE_SSL: string = '';

    @IsOptional()
    @IsString()
    DATABASE_POOL_MAX: string = '';

    @IsOptional()
    @IsString()
    DATABASE_POOL_MIN: string = '';

    @IsOptional()
    @IsString()
    DATABASE_IDLE_TIMEOUT_MS: string = '';

    @IsOptional()
    @IsString()
    DATABASE_CONNECTION_TIMEOUT_MS: string = '';

    @IsOptional()
    @IsString()
    DATABASE_SLOW_QUERY_MS: string = '';

    @IsOptional()
    @IsString()
    TYPEORM_SYNCHRONIZE: string = '';

    @IsOptional()
    @IsString()
    SUPABASE_URL: string = '';

    @IsOptional()
    @IsString()
    SUPABASE_ANON_KEY: string = '';

    @IsOptional()
    @IsString()
    SUPABASE_SERVICE_ROLE_KEY: string = '';

    @IsOptional()
    @IsString()
    CORS_ORIGIN: string = 'http://localhost:5173';

    @IsOptional()
    @IsString()
    FRONTEND_URL: string = 'http://localhost:5173';

    @IsOptional()
    @IsString()
    RAZORPAY_KEY_ID: string = '';

    @IsOptional()
    @IsString()
    RAZORPAY_KEY_SECRET: string = '';

    @IsOptional()
    @IsString()
    REDIS_USE_URL: string = '';

    @IsOptional()
    @IsString()
    SMTP_HOST?: string;

    @IsOptional()
    @IsString()
    SMTP_PORT?: string;

    @IsOptional()
    @IsString()
    SMTP_SECURE?: string;

    @IsOptional()
    @IsString()
    SMTP_USER?: string;

    @IsOptional()
    @IsString()
    SMTP_PASS?: string;

    @IsOptional()
    @IsString()
    SMTP_FROM?: string;

    @IsOptional()
    @IsString()
    MAIL_HOST?: string;

    @IsOptional()
    @IsString()
    MAIL_PORT?: string;

    @IsOptional()
    @IsString()
    MAIL_USER?: string;

    @IsOptional()
    @IsString()
    MAIL_PASS?: string;

    @IsOptional()
    @IsString()
    MAIL_FROM?: string;
}

export function validate(config: Record<string, unknown>) {
    const validatedConfig = plainToClass(EnvironmentVariables, config, {
        enableImplicitConversion: true,
    });

    const errors = validateSync(validatedConfig, {
        skipMissingProperties: false,
    });

    if (errors.length > 0) {
        const errorMessages = errors.map(e =>
            `${e.property}: ${Object.values(e.constraints || {}).join(', ')}`
        ).join('\n');
        throw new Error(`Environment validation failed:\n${errorMessages}`);
    }

    return validatedConfig;
}
