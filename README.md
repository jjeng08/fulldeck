# FullDeck Casino

A multi-game casino application built with React Native (Expo) frontend and Node.js WebSocket backend.

## Games Available

- **Blackjack** - Single-player mode (timer-based multiplayer mode available but hidden from UI)
- **Poker** - Coming Soon
- **Baccarat** - Coming Soon

## Features

- JWT authentication with automatic token refresh
- Real-time WebSocket communication
- Single master timer system for all game timing
- Configuration-driven game availability
- Casino-themed UI with velvet red lobby and green felt game tables
- Secure user registration and login
- Balance tracking and updates
- Multi-environment support (dev, qa, stage, production)

## Architecture

- **Backend**: Node.js WebSocket server with Prisma ORM, PostgreSQL
- **Frontend**: Expo (React Native) with JavaScript
- **Database**: PostgreSQL (all environments)
- **Environments**: Development, QA, Stage, Production

## Environment Setup

FullDeck supports four environments: **development**, **qa**, **stage**, and **production**. All environments use PostgreSQL for consistency.

### 1. Database Setup

Create PostgreSQL databases for each environment:
```sql
-- In PostgreSQL (psql or pgAdmin)
CREATE DATABASE fulldeck_dev;
CREATE DATABASE fulldeck_qa;
CREATE DATABASE fulldeck_stage;
CREATE DATABASE fulldeck_production;

-- Create user (optional, or use existing user)
CREATE USER fulldeck_user WITH PASSWORD 'fulldeck_password';
GRANT ALL PRIVILEGES ON DATABASE fulldeck_dev TO fulldeck_user;
GRANT ALL PRIVILEGES ON DATABASE fulldeck_qa TO fulldeck_user;
GRANT ALL PRIVILEGES ON DATABASE fulldeck_stage TO fulldeck_user;
GRANT ALL PRIVILEGES ON DATABASE fulldeck_production TO fulldeck_user;
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies (includes dotenv for environment config)
npm install

# Copy environment template and configure for your setup
cp .env.example .env.dev

# Generate Prisma client
npm run db:generate

# Run database migrations for development
npm run db:migrate:dev

# Start development WebSocket server
npm run dev:websocket
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm start
```

## Environment Commands

### Backend WebSocket Server
- **Development**: `npm run dev:websocket`
- **QA**: `npm run qa:websocket`
- **Stage**: `npm run stage:websocket`
- **Production**: `npm run prod:websocket`

### Database Migrations
- **Development**: `npm run db:migrate:dev`
- **QA**: `npm run db:migrate:qa`
- **Stage**: `npm run db:migrate:stage`
- **Production**: `npm run db:migrate:prod`

## Environment Configuration

### Backend Environment Files
- `.env.dev` - Development configuration
- `.env.qa` - QA environment configuration
- `.env.stage` - Stage environment configuration
- `.env.production` - Production environment configuration

### Frontend Environment Detection
The frontend automatically detects the environment and uses appropriate WebSocket URLs and API endpoints based on the build configuration.

## Development

- **Backend WebSocket**: ws://localhost:8080 (development)
- **Frontend**: http://localhost:8081 (Expo port 420)
- **Database**: PostgreSQL on localhost:5432

## Game Configuration

Games are managed through the configuration file at `/frontend/shared/gameConfig.js`. To enable/disable games, modify the `available` property for each game.

## Project Structure

```
/backend
  /src
    /games          # Game-specific logic (Blackjack, Poker, Baccarat)
    /shared         # Shared base classes and utilities
    /websocket      # WebSocket message handlers
    /core           # Core managers and systems

/frontend
  /pages           # Screen components (Lobby, BlackjackTable, etc.)
  /components      # Reusable UI components
  /shared          # Shared utilities and configurations
  /assets          # Game logos and images
```

## WebSocket Messages

### Authentication
- `login` - User login
- `register` - User registration
- `refreshToken` - Refresh JWT access token

### Game Management
- `joinBlackjackTable` - Join blackjack table
- `leaveBlackjackTable` - Leave blackjack table
- `placeBet` - Place a bet
- `hit` - Draw a card
- `stand` - End player turn

## Development Notes

- All game timing runs off a single master timer to prevent desynchronization
- Form data is automatically cleared on navigation and cancellation events
- Game modes: single-player (action-based) vs multiplayer (timer-based)
- Only defensive security tasks are supported