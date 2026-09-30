# Fitness Tracker App

A full-stack web application for tracking fitness activities and workouts. Built with modern web technologies including FastAPI backend, JavaScript frontend, and MySQL database.

## Overview

The Fitness Tracker App allows users to:
- Create and manage workout entries
- View workout history
- Edit existing workouts
- Delete workouts
- Manage user sessions and authentication

## Tech Stack

### Frontend
- **Framework**: JavaScript/Node.js
- **Server**: Python SimpleHTTPServer (with API proxy)
- **Testing**: Vitest

### Backend
- **Framework**: Python FastAPI
- **Database ORM**: SQLAlchemy
- **Authentication**: JWT with bcrypt
- **Server**: Uvicorn

### Database
- **MySQL 8**
- Containerized with Docker Compose

## Getting Started

### Quick Start

1. **Start the database:**
   ```bash
   docker-compose up -d
   ```

2. **Start the API (from `api/` directory):**
   ```bash
   cd api
   uv sync
   uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
   ```

3. **Start the frontend (from `web/` directory):**
   ```bash
   cd web
   python server.py
   ```

4. **Access the app:**
   - Application: http://localhost:3001
   - API Docs: http://localhost:8001/docs

For detailed instructions, see [GETTING_STARTED.md](./GETTING_STARTED.md)

## Project Structure

```
.
├── api/                 # FastAPI backend application
│   ├── app/            # Main API code
│   ├── tests/          # Backend tests
│   ├── pyproject.toml  # Python dependencies
│   └── uv.lock         # Dependency lock file
│
├── web/                # JavaScript frontend
│   ├── public/         # Static files
│   ├── tests/          # Frontend tests
│   ├── server.py       # Development server with API proxy
│   └── package.json    # Node dependencies
│
├── db/                 # Database initialization
│   └── init/          # SQL init scripts
│
├── design-system/      # Shared design system components
│
└── docker-compose.yml  # MySQL database configuration
```

## Development

### Prerequisites
- Node.js (v18+)
- Python (v3.11+)
- Docker & Docker Compose
- uv (Python package manager)

### Running Tests

**Frontend:**
```bash
cd web
npm test
```

**Backend:**
```bash
cd api
uv run pytest
```

## API Documentation

Once the API is running, visit `http://localhost:8001/docs` for interactive API documentation.

## Environment Variables

### Frontend (web/server.py)
- `ARC_WEB_PORT` - Web server port (default: 3001)
- `API_ORIGIN` - Backend API origin (default: http://localhost:8001)

### Backend
- Database connection details configured in API code

## Troubleshooting

For common issues and solutions, see the [Troubleshooting section in GETTING_STARTED.md](./GETTING_STARTED.md#troubleshooting)

## Architecture Decisions

For architectural decisions and design documentation, see the `docs/adr/` directory.

## Contributing

Maintain code quality by:
- Writing tests for new features
- Following the existing code style
- Running tests before committing changes
- Keeping documentation up to date

## License

[Add license information here]
