# StaffBot — AI Employee Support Platform

Multi-tenant SaaS platform for AI-powered employee support via WhatsApp and Telegram.

## Architecture

```
staffbot/
├── backend/          Node.js + Express + TypeScript — REST API + webhooks
├── frontend/         Next.js 14 — dashboard for super_admin & company_admin
├── rag-engine/       Python FastAPI — document indexing + RAG query (Claude + Qdrant)
├── worker/           Background job processor (BullMQ + Redis)
└── ecosystem.config.js   PM2 process config
```

## Tech Stack

| Layer | Tech |
|---|---|
| API | Node.js, Express, TypeScript, Drizzle ORM |
| Frontend | Next.js 14, React Query, TypeScript |
| AI | Anthropic Claude Sonnet 4.6, OpenAI embeddings |
| Vector DB | Qdrant |
| Database | PostgreSQL 15 |
| Cache/Queue | Redis, BullMQ |
| Messaging | WaSender (WhatsApp), Telegram Bot API |
| Storage | MinIO (S3-compatible) |
| Reverse proxy | Nginx + Let's Encrypt |
| Process manager | PM2 |

## Features

- **Multi-tenant**: Isolated data per company, super_admin oversight
- **RAG pipeline**: Index PDFs/DOCX/TXT → chunk → embed → query with Claude
- **Multimedia**: Extract and send images/videos from documents via messaging
- **WhatsApp & Telegram**: Employees ask questions in their preferred channel
- **Billing dashboard**: Token usage tracking with configurable margin (super_admin)
- **Welcome messages**: Auto-send onboarding message when employee is created
- **Impersonation**: Super admin can view any tenant's dashboard

## Setup

### Prerequisites
- Node.js 20+
- Python 3.11+
- PostgreSQL 15
- Redis 7
- Qdrant (Docker recommended)
- MinIO (Docker recommended)

### Quick start

```bash
# 1. Clone
git clone <repo-url>
cd staffbot

# 2. Configure environment
cp backend/.env.example backend/.env
cp rag-engine/.env.example rag-engine/.env
cp frontend/.env.example frontend/.env
# Edit each .env with your real values

# 3. Install dependencies
cd backend && npm install
cd ../frontend && npm install
cd ../rag-engine && pip install -r requirements.txt
cd ../worker && npm install

# 4. Run DB migrations
cd backend && npm run db:push

# 5. Start with PM2
cd .. && pm2 start ecosystem.config.js
```

## API Endpoints (key)

| Method | Path | Description |
|---|---|---|
| POST | /api/auth/login | Authenticate |
| GET | /api/dashboard/stats | Dashboard KPIs |
| GET/POST | /api/employees | Employee CRUD |
| GET/POST | /api/profiles | Position profiles |
| GET/POST | /api/documents | Document upload + indexing |
| GET | /api/conversations | Conversation history |
| GET | /api/tokens/summary | Token usage & costs |
| PUT | /api/tokens/pricing | Update pricing/margin (super_admin) |
| POST | /webhooks/wasender | WaSender WhatsApp webhook |
| POST | /webhooks/telegram | Telegram webhook |

## License

Private — All rights reserved.
