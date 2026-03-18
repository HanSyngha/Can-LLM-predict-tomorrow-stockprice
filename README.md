# Stock Self-Evolving

**Can LLMs improve stock prediction accuracy through self-reflection?**

An experimental system where LLM agents predict daily stock price direction (UP/DOWN/FLAT) and review their results to maintain self-reflection notes. The hypothesis: as notes accumulate, prediction accuracy improves over time.

## Key Features

- **Daily Predictions**: LLM agents predict next trading day's closing price direction relative to the last close
- **Multi-LLM Comparison**: Run up to 5 LLMs simultaneously on the same stocks and compare accuracy
- **Self-Reflection Notes**: Each LLM maintains 50 note slots, updated daily based on prediction results
- **Search Sub-Agent**: Headless Chrome CDP-based autonomous web research for market analysis
- **Smart Stock Search**: LLM-assisted ticker lookup for non-English stock names
- **Real-time Dashboard**: iOS-style responsive UI with light/dark mode and Korean/English i18n
- **Translation Support**: Optional translate LLM for viewing English LLM outputs in Korean

## Important Notes

- **Sequential Processing**: Predictions run sequentially (stock by stock, LLM by LLM) because the search sub-agent uses a single headless Chrome instance
- **No Search API Costs**: All web research is done via headless Chrome (CDP) — no paid search APIs required. This means zero external API costs for research, but predictions take longer (~2-5 min per stock per LLM)
- **LLM API Costs**: The only external API cost is the LLM inference itself (chat completions API)

## Architecture

```
┌─ Daily Schedule (KST) ─────────────────────────┐
│ 00:00  Prediction Cycle                         │
│   For each stock × each LLM:                    │
│   1. Build context (prices, history, notes)      │
│   2. LLM iterates: search → analyze → predict   │
│   3. Save prediction to DB                       │
│                                                  │
│ 20:00  Review Cycle                              │
│   1. Fetch closing prices from Yahoo Finance     │
│   2. Judge predictions (UP/DOWN/FLAT ±0.3%)      │
│   3. For each stock × each LLM:                  │
│      Review agent updates self-reflection notes   │
│   4. Record accuracy snapshots                   │
└──────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | Fastify + TypeScript |
| Database | SQLite (better-sqlite3, WAL mode) |
| Stock Data | Yahoo Finance (direct API, no key required) |
| Search Agent | Headless Chrome via CDP |
| Scheduler | node-cron (Asia/Seoul timezone) |
| Deployment | Docker Compose |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-repo/stock-self-evolving.git
cd stock-self-evolving

# Run with Docker
docker compose up -d

# Open dashboard
open http://localhost:4001
```

## Setup

### 1. Add LLM Providers

Navigate to **Settings** → **LLM Configurations** and add your LLM provider(s):

- Supports OpenAI, Anthropic, Google Gemini, DeepSeek, Z.AI, Ollama, LM Studio, or any OpenAI-compatible endpoint
- Up to 5 LLMs for comparison predictions
- Each LLM can use a different API key for rate limit distribution

### 2. Add Stocks

Navigate to **Add Stock** and search by name or ticker:

- Supports KOSPI, KOSDAQ, NASDAQ, NYSE, and global markets via Yahoo Finance
- Korean stocks: search by English name or ticker number (e.g., "samsung" or "005930")
- LLM-assisted search for non-English queries (requires Search LLM configured)
- Enter optional Korean name for KOSPI/KOSDAQ stocks

### 3. Optional: Configure Translate LLM

In **Settings** → **Translate LLM**, configure an LLM for translating English predictions/notes to Korean. This enables the EN/KO toggle on reasoning text and notes.

## Dashboard

### Main View
- Overall accuracy across all LLMs and stocks
- LLM comparison chart showing accuracy bars for each model
- Stock cards with current price, change rate, and last prediction

### Stock Detail
- 30-day price chart with prediction markers per LLM (color-coded)
- LLM comparison table showing all models' predictions side-by-side per date
- Win rate evolution chart
- Per-LLM filtering

### Notes Page
- View self-reflection notes per LLM (50 slots each)
- EN/KO translation toggle (requires Translate LLM)

## Prediction Logic

- **Baseline**: Last available closing price
- **Target**: Next trading day's closing price
- **UP**: Close > +0.3% above baseline
- **DOWN**: Close < -0.3% below baseline
- **FLAT**: Close within ±0.3% of baseline
- **Weekends**: Friday's close → Monday's close

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/dashboard/summary` | Overall stats + LLM accuracies |
| `GET /api/dashboard/stock-summary` | Stock cards with prices |
| `GET /api/stocks/search?q=` | Search tickers (Yahoo + LLM fallback) |
| `POST /api/stocks` | Add stock |
| `GET /api/predictions/:ticker/all-llms` | Multi-LLM comparison by date |
| `GET /api/notes?llm_id=` | Self-reflection notes per LLM |
| `POST /api/translate` | Translate text via configured LLM |
| `GET/POST/PUT/DELETE /api/settings/llms` | LLM configuration CRUD |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4001` | Server port |
| `DB_PATH` | `./data/stock-evolving.db` | SQLite database path |
| `TZ` | `Asia/Seoul` | Timezone for scheduler |
| `DEBUG` | - | Enable verbose logging |

## Development

```bash
npm install
npm run dev          # Backend (port 4001, auto-reload)
npm run dev:client   # Frontend (port 5173, proxy to 4001)
npm run build        # Production build
npm start            # Production server
```

## Docker

```bash
docker compose up -d          # Start
docker compose down           # Stop
docker logs -f stock-self-evolving-app-1  # Logs
```

The SQLite database is persisted in `./data/` via Docker volume mount.

## License

MIT
