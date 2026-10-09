# PrepGenius

A lightweight AI study assistant prototype for personalized exam preparation.

## Features

- Login/profile flow for a student
- Dashboard with topic performance and weak area detection
- Automated explanations and practice questions by topic
- Generated revision schedule based on weak topics
- Practice quiz and feedback loop
- Fallback content when the OpenAI API key is not configured

## Tech stack

- Frontend: React + Vite + Recharts
- Backend: Express + Node.js
- AI integration: OpenAI-compatible API, with graceful fallback to static content

## Setup

1. Install dependencies:
   `npm install`
2. Start the app in development mode:
   `npm run dev`
3. Open the frontend at `http://localhost:5173`

The backend API runs on `http://localhost:5000`.

## Environment variables

Create `backend/.env` from `backend/.env.example`, then set the provider keys you use:

- `OPENAI_API_KEY=your_key_here`
- `OPENROUTER_API_KEY=your_openrouter_key_here`
- `OPENROUTER_MODEL=openai/gpt-4o-mini`
- `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
- `GEMINI_API_KEY=your_gemini_key_here`
- `GEMINI_MODEL=gemini-flash-latest`
- `PORT=5000`

OpenRouter is preferred when `OPENROUTER_API_KEY` is set; it takes priority over `OPENAI_API_KEY` and over Gemini for compatible text/image workflows. Override its model with `OPENROUTER_MODEL`. Gemini remains available as a fallback and is used for PDF assessment mark extraction. Keep keys in `backend/.env` only, never in frontend code or chat, and restart the backend after changing them. Without a provider key, local fallbacks are used where available.
