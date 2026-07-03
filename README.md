# FIFA Clubes Pro — Stats Tracker

Full-stack web application that processes screenshots from **EA Sports FC Clubes Pro**, extracts match statistics using **OCR**, and visualizes them through interactive dashboards, rankings, and player comparisons.

> Built as a portfolio project demonstrating full-stack development, image processing, and data visualization.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express, PostgreSQL, SQLite |
| **Frontend** | Vanilla JavaScript, Chart.js, HTML5, CSS3 |
| **OCR** | Tesseract.js |
| **Image Processing** | Sharp |
| **Database** | PostgreSQL (production), SQLite (local development) |
| **Deployment** | Docker, Render |

---

## Features

- **OCR Pipeline** — Upload a screenshot; the app automatically extracts player stats (goals, assists, passes, rating, etc.)
- **Fuzzy Name Matching** — Automatically normalizes player names (e.g., `facundo` → `Facu`)
- **Interactive Dashboards** — Evolution charts (line), player profiles (radar), head-to-head comparisons (bar charts)
- **Rankings** — Sortable leaderboard with all players and stats
- **Match History** — Searchable log with season filters, editing, and CSV export
- **Player Profiles** — Individual stats, evolution, radar chart, and CSV export per player
- **Image Gallery** — View all uploaded screenshots per match
- **Dark / Light Mode**
- **Dual Database** — Switches automatically between PostgreSQL and SQLite based on environment

---

## Quick Start (Local)

```bash
# 1. Install dependencies
cd backend && npm install

# 2. Start the server
npm start

# The app is now running at:
# http://localhost:3001
```

No database setup is required — it uses SQLite automatically. For PostgreSQL, set `DATABASE_URL` in `backend/.env`.

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload screenshot → OCR → parsed stats |
| POST | `/api/save` | Save parsed player stats |
| POST | `/api/match` | Create a new match |
| GET | `/api/matches` | List matches (optional `?season=` filter) |
| GET | `/api/match/:id` | Match with player stats |
| GET | `/api/leaderboard` | Player ranking |
| GET | `/api/stats/player/:name` | Stats for a specific player |
| GET | `/api/team/summary` | Team performance per match |
| GET | `/api/health` | Health check |

Full API documentation is available in the source code at `backend/routes.js`.

---

## Project Structure

```
fifa-stats/
├── backend/
│   ├── server.js           → Express server (API + static frontend)
│   ├── routes.js           → REST endpoints
│   ├── db.js               → Auto-selects PostgreSQL or SQLite
│   ├── db-pg.js            → PostgreSQL implementation
│   ├── db-sqlite.js        → SQLite implementation (sql.js)
│   ├── ocr.js              → OCR processing (Tesseract.js)
│   ├── parser.js            → OCR text parsing + name normalization
│   ├── imageProcessor.js   → Image cropping with Sharp
│   ├── uploads/            → Uploaded match screenshots
│   └── .env                → Local environment variables
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js              → Client-side logic
├── Dockerfile              → Production build
├── render.yaml             → Render Blueprint config
└── .dockerignore
```

---

## Deployment

Designed for **Render** (Docker) with **PostgreSQL**. Database tables are created automatically on first request.

1. Push to GitHub
2. Create a PostgreSQL database (e.g., Neon, Supabase, Render)
3. Deploy on Render as a Docker Web Service
4. Set `DATABASE_URL` environment variable in Render dashboard

---

## What This Project Demonstrates

- **Full-stack development** with Node.js/Express and vanilla JS
- **Image processing pipeline** (OCR, cropping, parsing)
- **Dual database architecture** (SQLite locally, PostgreSQL in production)
- **RESTful API design**
- **Data visualization** with Chart.js
- **Docker containerization**
- **CI/CD-ready** (Render Blueprint deployment)

---

## Author

**Lucas Capocasa** — Full-stack Developer

[GitHub](https://github.com/lucascapocasa)

---

*Data shown in the app uses real match statistics from friendly games. Screenshots and player data are not shared publicly.*
