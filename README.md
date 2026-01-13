# EVOA Backend

Official repository of EVOA Technology Pvt Ltd.

This codebase is proprietary and confidential.

Founders:
- Abhishek Kumar – Co-Founder & CTO
- Aditya Narayan Singh – Co-Founder & CEO

Unauthorized copying, modification, or distribution is prohibited.

© 2026 EVOA Technology Pvt Ltd. All rights reserved.


Production-ready backend for **EVOA** - a startup discovery and pitch platform. Built with NestJS, PostgreSQL, Redis, and Supabase.

## 🚀 Features

- **High-Performance Feed System** - Sub-200ms response times with Redis caching
- **Role-Based Access Control** - Strict enforcement of user roles (viewer, founder, investor, incubator, admin)
- **AI-Powered Investor Insights** - Cached AI analysis for startups
- **Meeting Scheduling System** - Investor-founder meeting workflow
- **Real-time Notifications** - Categorized notification system
- **Comprehensive Search** - Search startups, investors, and hashtags
- **Production-Ready** - Docker support, health checks, API documentation

## 📋 Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Supabase account (for Auth and Storage)

## 🛠️ Installation

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Required Environment Variables:**

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=evoa

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Supabase (Create project at https://supabase.com)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# AI Service (Optional - for Investor AI)
OPENAI_API_KEY=your-openai-api-key

# Frontend
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

### 3. Database Setup

**Option A: Using Docker Compose (Recommended)**

```bash
docker-compose up -d postgres redis
```

**Option B: Local Installation**

Install PostgreSQL and Redis locally, then create the database:

```bash
psql -U postgres
CREATE DATABASE evoa;
```

### 4. Run Database Migrations

```bash
npm run migration:run
```

### 5. Seed Database (Optional)

```bash
npm run seed
```

## 🏃 Running the Application

### Development Mode

```bash
npm run start:dev
```

The API will be available at:
- **API**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/health

### Production Mode

```bash
npm run build
npm run start:prod
```

### Docker Deployment

```bash
docker-compose up --build
```

This will start:
- PostgreSQL on port 5432
- Redis on port 6379
- Backend API on port 3000

## 📚 API Documentation

Once the application is running, visit **http://localhost:3000/api** for interactive Swagger documentation.

### Key Endpoints

#### Authentication
- `POST /auth/signup` - Register new user
- `POST /auth/login` - Login with email/password
- `POST /auth/google` - Google OAuth login
- `POST /auth/forgot-password` - Password reset

#### Feed System
- `GET /reels?type=for_you` - For You feed
- `GET /reels?type=following` - Following feed
- `POST /reels/:id/like` - Like a reel
- `POST /reels/:id/comment` - Comment on reel

#### Pitch & Investor Features
- `GET /pitch/:id` - Get pitch details
- `POST /pitch/:startupId/investor-ai` - AI analysis (Investor only)
- `POST /pitch/:startupId/schedule-meeting` - Schedule meeting (Investor only)

#### Explore
- `GET /search?q=query&type=startups` - Search
- `GET /hashtags/trending` - Trending hashtags
- `GET /startups/top` - Top startups
- `GET /battleground/live` - Live battleground

#### Meetings
- `GET /meetings` - Get user meetings
- `POST /meetings/:id/accept` - Accept meeting (Founder only)
- `POST /meetings/:id/reject` - Reject meeting (Founder only)

#### Notifications
- `GET /notifications?type=all` - Get notifications
- `POST /notifications/:id/read` - Mark as read

## 🔐 User Roles

The system enforces strict role-based access control:

- **viewer** - Can view content, like, comment, share
- **founder** - Can create startups and pitches, manage meetings
- **investor** - Can access AI insights, schedule meetings
- **incubator** - Same as investor
- **admin** - Full access

## ⚡ Performance Features

- **Redis Caching** - Feed results cached for 5 minutes, trending data for 15-30 minutes
- **Cursor-Based Pagination** - Efficient pagination without OFFSET
- **Denormalized Counters** - Like counts, follower counts stored for fast reads
- **Connection Pooling** - PostgreSQL pool size: 20 connections
- **Compression** - Response compression enabled

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📦 Project Structure

```
src/
├── auth/              # Authentication & authorization
├── users/             # User management
├── reels/             # Feed system
├── pitch/             # Pitch details
├── ai/                # AI service (investor insights)
├── meetings/          # Meeting scheduling
├── startups/          # Startup management
├── explore/           # Search & discovery
├── notifications/     # Notification system
├── config/            # Configuration files
└── main.ts            # Application entry point
```

## 🔧 Scripts

```bash
npm run start          # Start application
npm run start:dev      # Start in watch mode
npm run start:prod     # Start in production mode
npm run build          # Build for production
npm run lint           # Lint code
npm run format         # Format code with Prettier
npm run migration:run  # Run database migrations
npm run seed           # Seed database
```

## 🐳 Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop all services
docker-compose down

# Rebuild and restart
docker-compose up --build -d
```

## 🔒 Security Features

- JWT authentication with 7-day expiry
- Password hashing with bcrypt
- Rate limiting (100 requests/minute)
- Helmet.js security headers
- CORS configuration
- Input validation on all endpoints
- SQL injection prevention (TypeORM)

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-13T16:00:00.000Z",
  "uptime": 1234.56
}
```

## 🚀 Deployment

### Environment Variables for Production

Ensure these are set in your production environment:

- Set `NODE_ENV=production`
- Use strong `JWT_SECRET`
- Configure production database credentials
- Set proper `CORS_ORIGIN`
- Add production Supabase credentials
- Configure AI API keys if using Investor AI

### Recommended Hosting

- **Backend**: Railway, Render, AWS ECS, Google Cloud Run
- **Database**: Supabase, AWS RDS, Google Cloud SQL
- **Redis**: Upstash, Redis Cloud, AWS ElastiCache

## 🤝 Contributing

This is a production backend system. Follow these guidelines:

1. All endpoints must have Swagger documentation
2. Add validation to all DTOs
3. Write tests for new features
4. Follow NestJS best practices
5. Maintain sub-200ms response times for feed endpoints

## 📝 License

MIT

## 💬 Support

For issues or questions, please create an issue in the repository.

---

**Built with ❤️ for EVOA**
