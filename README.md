# StaffBot

AI-powered staff assistant platform with WhatsApp/Telegram integrations, document RAG, and an admin panel.

## Project Structure

```
staffbot/
├── backend/          Node.js + Express + TypeScript REST API
├── frontend/         Next.js 14 admin panel (App Router + Tailwind)
├── rag-engine/       Python FastAPI + LangChain + Qdrant RAG service
├── worker/           BullMQ document-indexing queue worker (TypeScript)
└── docker/           Docker Compose infrastructure
```

## Services (docker-compose)

| Service   | Image                  | Port  | Purpose                     |
|-----------|------------------------|-------|-----------------------------|
| postgres  | pgvector/pgvector:pg16 | 5432  | Primary database + vectors  |
| redis     | redis:7-alpine         | 6379  | Cache + BullMQ queues       |
| qdrant    | qdrant/qdrant:latest   | 6333  | Vector search engine        |
| adminer   | adminer                | 8080  | Postgres web UI             |

## Quick Start

### 1. Clone & configure

```bash
cp .env.example .env
# Fill in your secrets in .env
```

### 2. Start infrastructure

```bash
cd docker
docker compose up -d
```

### 3. Backend

```bash
cd backend
npm install
npm run dev
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. RAG Engine

```bash
cd rag-engine
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 6. Worker

```bash
cd worker
npm install
npm run dev
```

## Environment Variables

See `.env.example` for all required variables with descriptions.

## Tech Stack

- **Backend**: Node.js 20, Express, TypeScript, Prisma
- **Frontend**: Next.js 14, React, Tailwind CSS, shadcn/ui
- **RAG Engine**: Python 3.11, FastAPI, LangChain, Qdrant
- **Worker**: BullMQ, IORedis
- **Database**: PostgreSQL 16 + pgvector
- **Cache / Queue**: Redis 7
- **Vector DB**: Qdrant
- **Messaging**: WhatsApp Cloud API, Telegram Bot API
- **Storage**: AWS S3
- **AI**: Anthropic Claude, OpenAI
