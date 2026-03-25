# StaffBot — AI Employee Support Platform

Multi-tenant SaaS platform for AI-powered employee support via WhatsApp and Telegram.

## Stack

- **Backend**: Node.js, Express, TypeScript, Drizzle ORM, PostgreSQL 16 + pgvector
- **Frontend**: Next.js 14, React Query, TypeScript
- **RAG Engine**: Python, FastAPI, LangChain, OpenAI Embeddings, Qdrant
- **Messaging**: WaSender (WhatsApp), Telegram Bot API
- **Storage**: MinIO (S3-compatible), Redis, Qdrant
- **Infrastructure**: Ubuntu 22.04 VPS, nginx, PM2, Docker

## Features

- Multi-tenant architecture (companies, profiles, employees)
- WhatsApp & Telegram bot integration
- RAG pipeline with PDF/DOCX ingestion
- Multimedia support (images extracted from documents)
- Token usage tracking & billing per employee
- Telegram group per profile assignment
- Welcome messages, verification codes, Telegram linking

## Setup

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/staffbot.git
cd staffbot

# 2. Backend
cd backend
npm install
cp .env.example .env
# Edit .env with your values
npm run dev

# 3. Frontend
cd ../frontend
npm install
npm run dev

# 4. RAG Engine
cd ../rag-engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

## Environment Variables

See `backend/.env.example` for all required variables.

## License

Private — All rights reserved
