# Stock-Self-Evolving 요구사항 정의서

> **LLM이 자기반성과 오답/정답 노트를 통해 주식 예측 정확도가 자가 발전할 수 있는지 검증하는 프로젝트**

---

## 1. 프로젝트 개요

LLM Agent가 매일 지정된 종목의 다음 날 주가 방향(UP/DOWN/FLAT)을 예측하고, 예측 결과를 리뷰하여 오답/정답 노트를 스스로 작성·수정한다. 이 노트가 누적될수록 예측 정확도가 향상되는지를 추적·시각화하는 시스템.

---

## 2. Tech Stack

| 계층 | 기술 | 비고 |
|------|------|------|
| Frontend | React + TypeScript + Vite | 대시보드 UI |
| Backend | Fastify + TypeScript | API 서버 + 스케줄러 |
| Database | SQLite (better-sqlite3, WAL mode) | 단일 파일 DB, Docker 볼륨 마운트 |
| LLM Iteration Engine | TypeScript (Hanseol 패턴) | system prompt + tool call history 누적 방식 |
| Search Agent | Headless Chrome CDP | search_guide.md 기반, Chromium headless |
| Stock Data (KOSPI/KOSDAQ) | 한국투자증권 Open API | 한국 시장 종목 |
| Stock Data (해외) | Yahoo Finance (yahoo-finance2) | 미국/글로벌 종목 |
| Scheduler | node-cron | KST 기준 00:00, 20:00 스케줄링 |
| Deployment | Docker Compose | DS720+ NAS 배포 |
| Port | **4001** | 기존 2290(땅콩패밀리) 회피 |

---

## 3. 핵심 기능 상세

### 3.1 예측 Agent (Prediction Agent) — 매일 KST 00:00

#### 호출 방식
- KST 00:00부터 등록된 종목을 **순서대로** 하나씩 호출
- 각 종목마다 독립적인 LLM iteration 세션 실행
- **종목 추가 시 첫 예측은 즉시 trigger**

#### Agent Tools (4가지)
| Tool | 파라미터 | 설명 |
|------|----------|------|
| `search` | `{ query: string, question: string }` | Search Sub-Agent 호출. 검색어와 내용 기반 질문 전달 |
| `predict` | `{ direction: "UP"\|"DOWN"\|"FLAT", reasoning: string }` | 최종 예측 제출. 호출 시 iteration 종료 |
| `read_notes` | `{}` | 현재 오답/정답 노트 1~50 전체 조회 |
| `search_history` | `{ query: string }` | 과거 예측 기록 검색 (선택적) |

#### Iteration 로직
- `predict` tool을 호출할 때까지 **무한 iteration** (search → 분석 → search → ... → predict)
- 매 iteration마다: system prompt + 이전 모든 tool call history (요청+응답) 시간순 제공
- **최대 토큰 도달 시** iteration 종료 → 해당일 "예측불가"로 기록
- Hanseol(main-dev)의 `chatCompletionWithTools()` 패턴 적용:
  - `rebuildMessages` 콜백으로 매 iteration마다 메시지 재구성
  - 70% 컨텍스트 도달 시 auto-compact
  - tool_choice: 'required' 아닌 자유 선택 (predict를 부를 타이밍은 LLM 판단)

#### System Prompt 구조
```
너는 무조건 내일 이 종목이 오를지(UP), 내릴지(DOWN), 보합일지(FLAT)를
결정해야 하는 벼랑 끝 프로 주식 트레이더다.

너는 search tool과 너가 그동안 쓴 오답/정답 노트를 기반으로
내일 이 종목의 방향을 정확히 예측해야 한다.

[종목 정보]
- 티커: {ticker}
- 종목명: {name}
- 시장: {market} (KOSPI/NASDAQ/...)
- 현재가: {current_price}

[첫 예측이 아닌 경우에만 제공]
현재까지 너의 이 종목에 대한 종합 정답률은 {accuracy}%다.

최근 30일간 예측 vs 실제 변동:
| 날짜 | 예측 | 실제방향 | 실제변동률 | 종가 | 정답여부 |
|------|------|----------|-----------|------|----------|
| 2026-03-16 | UP | DOWN | -1.2% | 72,300 | ✗ |
| 2026-03-15 | DOWN | DOWN | -0.8% | 73,200 | ✓ |
| ... | | | | | |
| 2026-03-01 | 예측 시작 이전 | UP | +0.5% | 74,500 | - |

※ 예측이 없는 날(종목 추가 전)은 "예측 시작 이전"으로 표시되며,
  해당 날의 실제 변동값과 종가만 제공됩니다.
[/첫 예측이 아닌 경우에만 제공]

[첫 예측인 경우]
이 종목의 최근 30일간 가격 변동:
| 날짜 | 변동률 | 종가 |
|------|--------|------|
| 2026-03-16 | -1.2% | 72,300 |
| ... | | |
[/첫 예측인 경우]

[오답/정답 노트]
{notes 1~50 중 내용이 있는 것만}
[/오답/정답 노트]

원하는 만큼 search를 수행하고, 충분한 근거가 모이면 predict tool을 호출하라.
```

#### 예측 기준 (FLAT 판정)
- **UP**: 전일 종가 대비 당일 종가 > +0.3%
- **DOWN**: 전일 종가 대비 당일 종가 < -0.3%
- **FLAT**: 전일 종가 대비 당일 종가 ±0.3% 이내

---

### 3.2 Search Sub-Agent

#### 아키텍처
```
Prediction Agent
  ↓ tool_call: search({ query, question })
  ↓
SearchSubAgent
  ├── Headless Chrome 실행 (CDP)
  ├── Sub-Agent iteration loop (최대 30회)
  │   ├── browser_navigate, browser_execute_script, ...
  │   └── complete tool 호출 → 보고서 반환
  ↓
보고서를 Prediction Agent에 tool result로 반환
```

#### 검색 소스 가이드 (search_guide.md 기반)
LLM에게 아래 소스 위주로 검색하라고 가이드하되, 최종 선택은 sub agent 자율:
- **한국**: Naver, 네이버페이 증권, DART(전자공시), 연합인포맥스, 매일경제, 한국경제
- **글로벌**: Yahoo Finance, Reddit, Bloomberg, Reuters, Finviz, CNBC, Investing.com
- **검색 엔진**: Naver 우선 → Google secondary (CAPTCHA 회피)

#### 구현 참조
- `search_guide.md`의 BrowserSubAgent + SubAgent 패턴
- CDP 포트 9223 (전용)
- maxIterations: 30
- temperature: 0.3

---

### 3.3 오답/정답 노트 시스템

#### 구조
- **총 50개 슬롯** (1번~50번)
- **전 종목 공유** — 종목A 리뷰에서 작성한 노트를 종목B 예측에서도 참조
- 내용이 비어있는 슬롯은 빈칸으로 유지
- 덮어쓰기 가능 (번호 + 새 내용)
- 50을 초과하는 새 슬롯 추가 불가

#### 저장 형태 (DB)
```sql
CREATE TABLE notes (
  slot_number INTEGER PRIMARY KEY CHECK(slot_number BETWEEN 1 AND 50),
  content TEXT,
  last_updated_at DATETIME,
  last_updated_by TEXT  -- 어떤 종목 리뷰에서 수정했는지
);
```

---

### 3.4 노트 수정 Agent (Review Agent) — 매일 KST 20:00

#### 호출 방식
- KST 20:00에 등록된 **종목별로 각각** 호출
- 순서대로 실행 (노트가 공유되므로 앞 종목 리뷰 결과가 뒤 종목에 반영)

#### Agent Tools (2가지)
| Tool | 파라미터 | 설명 |
|------|----------|------|
| `edit_note` | `{ slot_number: 1-50, content: string }` | 노트 슬롯에 내용 작성/덮어쓰기 |
| `complete` | `{}` | 리뷰 완료. 호출 시 iteration 종료 |

#### Iteration 로직
- `complete` tool 호출 또는 **최대 15 iteration**까지 동작
- 매 iteration마다: system prompt + 이전 tool call history 제공

#### System Prompt 구조
```
너는 어제 {종목명}({ticker})에 대해 {prediction}(이)라고 예측했고,
실제 변동은 {actual_direction} ({actual_change}%)였다.
결과: {correct/incorrect}

너가 어제 search agent로 검색한 내용:
{search_queries_and_reports}

이를 통해:
- 잘해서 다음번에도 같은 행동을 해야 하는 내용
- 잘못해서 다음번에 같은 실수를 하면 안 되는 내용
을 note에 적어라.

[현재 노트 상태 1~50 - 빈칸 포함 전체 표시]
| 번호 | 내용 |
|------|------|
| 1 | 삼성전자는 반도체 실적 발표 전후 변동성 큼... |
| 2 | (빈칸) |
| ... |
| 50 | (빈칸) |

edit_note tool로 번호와 내용을 지정하여 노트를 작성/수정하라.
기존 내용이 있으면 덮어쓰기된다.
작업이 끝나면 complete tool을 호출하라.
```

---

### 3.5 주식 데이터 수집

#### API 라우팅 규칙
| 시장 | API | 비고 |
|------|-----|------|
| KOSPI / KOSDAQ | 한국투자증권 Open API | 한국 시장 종목 |
| 그 외 (NASDAQ, NYSE 등) | Yahoo Finance (yahoo-finance2) | 미국/글로벌 |

#### 데이터 수집 시점
- **KST 20:00**: 각 종목의 당일 종가/변동률 수집 → DB 저장 → Review Agent prompt에 반영
- **종목 추가 시**: 최근 30일 일봉 데이터 일괄 수집

#### DB 캐싱 정책
- 한 번 조회한 (날짜, 종목, 가격) 데이터는 DB에 저장
- 이후 동일 날짜+종목 조회 시 **DB 우선 조회**, API 재호출 하지 않음
- 당일 데이터만 API에서 신규 fetch

```sql
CREATE TABLE stock_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,        -- 'YYYY-MM-DD'
  open_price REAL,
  close_price REAL,
  high_price REAL,
  low_price REAL,
  volume INTEGER,
  change_rate REAL,          -- 전일 대비 변동률 (%)
  fetched_at DATETIME,
  UNIQUE(ticker, date)
);
```

#### 티커 검색
- 한투 API / Yahoo Finance API로 종목명 → 티커 검색
- 사용자가 이름으로 검색 → 후보 목록 표시 → 선택

---

### 3.6 스케줄러

```
┌─ KST 00:00 ─────────────────────────────────────┐
│ 등록 종목 순서대로:                                │
│   1. 종목의 최근 30일 가격 데이터 준비 (DB 캐시)    │
│   2. 과거 예측 기록 조회                           │
│   3. 노트 조회                                    │
│   4. Prediction Agent 호출 (iteration loop)       │
│   5. 예측 결과 DB 저장                            │
│   → 다음 종목으로                                  │
└──────────────────────────────────────────────────┘

┌─ KST 20:00 ─────────────────────────────────────┐
│ 1. 각 종목의 당일 종가/변동 수집 (API → DB 캐시)   │
│ 2. 어제 예측과 오늘 실제 결과 비교                  │
│ 3. 등록 종목 순서대로:                             │
│    - Review Agent 호출 (노트 수정)                 │
│    → 다음 종목으로                                 │
└──────────────────────────────────────────────────┘

┌─ 종목 추가 시 (즉시) ───────────────────────────┐
│ 1. 최근 30일 가격 데이터 수집 → DB 저장            │
│ 2. Prediction Agent 즉시 호출 (첫 예측)           │
└──────────────────────────────────────────────────┘
```

---

## 4. Dashboard UI

### 4.0 디자인 시스템 & 다국어

#### iOS-Style 디자인
- **design.md** 참조: Tailwind CSS + Chart.js 기반
- **Light Mode**: 흰색/slate 배경, 깔끔한 카드 레이아웃 (design.md 기본)
- **Dark Mode**: 트루 블랙/다크 그레이 배경, iOS 다크 모드 스타일
- **Light/Dark 토글**: 헤더에 토글 스위치, localStorage 저장, system preference 감지
- **iOS 스타일 요소**:
  - 둥근 카드 (rounded-xl), 미세한 그림자 (shadow-sm)
  - SF-like 시스템 폰트 (-apple-system, BlinkMacSystemFont)
  - 반투명/블러 효과 (backdrop-blur) 헤더
  - 매끄러운 transition/animation
  - 미니멀한 아이콘, 깨끗한 타이포그래피

#### 다국어 지원 (i18n)
- **지원 언어**: 한국어 (ko), English (en)
- **기본 언어**: 브라우저 언어 감지 → 없으면 ko
- **언어 전환**: 헤더에 언어 토글 (KO/EN), localStorage 저장
- **적용 범위**: 모든 UI 텍스트, 라벨, 버튼, 에러메시지, 차트 라벨, 테이블 헤더, 설정 페이지 등
- **구현**: i18n JSON 파일 기반 (src/client/locales/ko.json, en.json)
- **LLM 출력 (reasoning, 검색 보고서 등)은 번역하지 않음** — 원문 그대로 표시

### 4.1 메인 대시보드 (/)
- **최상단**: 전체 종합 승률 (전 종목 통합)
- **누적 승률 변화 그래프**: 일자별 종합 누적 승률 추이 line chart (승률이 올라가는지 내려가는지 한눈에 확인)
- **종목 카드 리스트**:
  - 종목명 + 티커
  - 현재가 + 오늘 변동률
  - 해당 종목 승률
  - 최근 예측 결과 (UP/DOWN/FLAT + 정답여부)
  - 클릭 → 종목 상세 페이지

### 4.2 종목 상세 페이지 (/stock/:ticker)
- **상단 요약**: 종목명, 현재가, 누적 승률, 예측 횟수
- **예측 기록 테이블**:
  | 날짜 | 예측 | 실제 | 변동률 | 종가 | 정답 | 근거(펼치기) |
  |------|------|------|--------|------|------|-------------|
  - "근거" 컬럼: 펼치면 해당일 LLM의 reasoning + search 보고서 전문
- **승률 추이 그래프**: 일자별 누적 승률 line chart
- **가격 차트**: 종가 추이 + 예측 방향 마커 (맞으면 초록, 틀리면 빨강)
- **노트 뷰어**: 현재 오답/정답 노트 1~50 열람 (편집 불가, LLM만 수정)

### 4.3 종목 추가 (/stock/add)
- 검색 입력 → 한투/Yahoo API로 티커 검색
- 결과 리스트에서 선택 → 종목 등록
- 등록 즉시 최근 30일 데이터 수집 + 첫 예측 trigger

### 4.4 설정 페이지 (/settings)
- **LLM Provider 설정** (Hanseol local-cli-git 패턴 참조):
  - Provider 선택 (OpenAI, Anthropic, Gemini, DeepSeek, Ollama, LM Studio, 커스텀 등)
  - Base URL, API Key, Model 설정
  - 연결 테스트 버튼
  - provider별 capability 플래그 자동 적용
- **한국투자증권 API 설정**:
  - App Key, App Secret, 계좌번호
  - 연결 테스트
- **Yahoo Finance**: 별도 키 불필요 (무료)
- **일반 설정**:
  - 예측 스케줄 시간 조정 (기본 00:00 / 20:00)
  - FLAT 판정 기준치 조정 (기본 ±0.3%)

---

## 5. 데이터 모델

### stocks (등록 종목)
```sql
CREATE TABLE stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL UNIQUE,     -- '005930.KS', 'AAPL'
  name TEXT NOT NULL,              -- '삼성전자', 'Apple Inc.'
  market TEXT NOT NULL,            -- 'KOSPI', 'NASDAQ', 'NYSE', ...
  api_source TEXT NOT NULL,        -- 'KIS' | 'YAHOO'
  added_at DATETIME NOT NULL,
  is_active INTEGER DEFAULT 1
);
```

### stock_prices (가격 캐시)
```sql
CREATE TABLE stock_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  open_price REAL,
  close_price REAL,
  high_price REAL,
  low_price REAL,
  volume INTEGER,
  change_rate REAL,
  fetched_at DATETIME NOT NULL,
  UNIQUE(ticker, date)
);
```

### predictions (예측 기록)
```sql
CREATE TABLE predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  prediction_date TEXT NOT NULL,    -- 예측 대상 날짜 (내일)
  created_at DATETIME NOT NULL,     -- 예측 수행 시각
  direction TEXT NOT NULL,          -- 'UP' | 'DOWN' | 'FLAT' | 'UNABLE'
  reasoning TEXT,                   -- LLM의 예측 근거
  search_queries TEXT,              -- JSON: 사용한 검색어 목록
  search_reports TEXT,              -- JSON: search agent 보고서들
  tool_call_history TEXT,           -- JSON: 전체 iteration tool call 기록
  actual_direction TEXT,            -- 실제 결과 (20:00에 채워짐)
  actual_change_rate REAL,          -- 실제 변동률
  actual_close_price REAL,          -- 실제 종가
  is_correct INTEGER,              -- 1: 정답, 0: 오답, NULL: 미확인
  UNIQUE(ticker, prediction_date)
);
```

### notes (오답/정답 노트)
```sql
CREATE TABLE notes (
  slot_number INTEGER PRIMARY KEY CHECK(slot_number BETWEEN 1 AND 50),
  content TEXT,
  last_updated_at DATETIME,
  last_updated_by TEXT              -- 'REVIEW:{ticker}:{date}'
);
```

### accuracy_history (일자별 누적 승률 기록)
```sql
CREATE TABLE accuracy_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,           -- 'YYYY-MM-DD'
  total_predictions INTEGER NOT NULL,  -- 누적 유효 예측 수
  total_correct INTEGER NOT NULL,      -- 누적 정답 수
  accuracy_rate REAL NOT NULL,         -- 누적 승률 (%)
  recorded_at DATETIME NOT NULL
);
```
- 매일 20:00 리뷰 완료 후 해당일 누적 승률 스냅샷 저장
- 대시보드 메인의 "누적 승률 변화 그래프" 데이터 소스

### settings (사용자 설정)
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                -- JSON string
);
-- Keys: 'llm_provider', 'kis_api', 'schedule', 'flat_threshold', ...
```

---

## 6. LLM Iteration Engine 구조

### Hanseol 패턴 적용 (chatCompletionWithTools)
```
┌─ Iteration Loop ─────────────────────────────────────┐
│                                                       │
│  1. rebuildMessages():                                │
│     [system prompt] + [user content with context]     │
│                                                       │
│  2. LLM API 호출 (tools 제공)                         │
│                                                       │
│  3. Response 파싱:                                    │
│     - tool_call 있으면 → 도구 실행 → 결과 수집         │
│     - predict/complete 호출이면 → Loop 종료            │
│     - tool_call 없으면 → 재시도 (최대 3회)             │
│                                                       │
│  4. tool call + result를 history에 추가               │
│                                                       │
│  5. 컨텍스트 70% 도달 시 auto-compact                  │
│                                                       │
│  6. 최대 토큰 초과 시 → "예측불가" 기록 후 종료         │
│                                                       │
└───────────────────────── Loop ────────────────────────┘
```

### 메시지 구조 (매 iteration 재구성)
```json
[
  { "role": "system", "content": "시스템 프롬프트 (고정)" },
  { "role": "user", "content": "컨텍스트 + 지시사항" },
  { "role": "assistant", "content": "", "tool_calls": [...] },
  { "role": "tool", "content": "tool 결과", "tool_call_id": "..." },
  { "role": "assistant", "content": "", "tool_calls": [...] },
  { "role": "tool", "content": "tool 결과", "tool_call_id": "..." },
  ...
]
```

---

## 7. Search Sub-Agent 구조

### search_guide.md 기반 구현
```
SearchSubAgent
  ├── Chrome headless 실행 (CDP 포트 9223)
  ├── Browser tools 바인딩 (13개)
  │   ├── browser_navigate
  │   ├── browser_execute_script
  │   ├── browser_get_text
  │   ├── browser_click
  │   ├── browser_fill
  │   └── ... (search_guide.md 참조)
  ├── Sub-Agent iteration loop (최대 30회)
  │   ├── system prompt: 검색 전략 가이드
  │   ├── LLM이 browser tool 선택 → 실행
  │   └── complete tool 호출 시 보고서 반환
  └── 결과: 정리된 보고서 텍스트
```

### 검색 전략 시스템 프롬프트 핵심
- Naver 우선 전략 (Google CAPTCHA 회피)
- Cloudflare 차단 도메인 회피
- iteration 예산 관리 (1-4: 검색, 5-15: 방문, 20+: 합성 필수)
- 수치 교차 검증 (2개 이상 소스)
- 금융 특화 소스 우선 (네이버페이증권, DART, 연합인포맥스, Yahoo Finance 등)

---

## 8. 배포 (Docker Compose)

### 대상 환경
- **Synology DS720+** (8GB RAM)
- NAS 접속: `syngha.synology.me:7348` (SSH)
- Docker path: `/volume1/docker/stock-self-evolving/`
- **포트: 4001** (기존 2290 회피)

### docker-compose.yml 구조
```yaml
services:
  app:
    build: .
    ports:
      - "4001:4001"
    volumes:
      - ./data:/app/data          # SQLite DB + 기타 데이터
      - chrome-profile:/tmp/chrome-profile
    environment:
      - TZ=Asia/Seoul
      - PORT=4001
    restart: always
    deploy:
      resources:
        limits:
          memory: 2G

volumes:
  chrome-profile:
```

### Dockerfile 요구사항
- Base: `node:20-slim`
- 추가 패키지: `chromium` (headless browser용)
- 빌드: client (Vite) + server (esbuild/tsc)
- 엔트리: `node dist/server/index.js`

### 메모리 예산 (DS720+ 8GB)
| 프로세스 | 메모리 |
|----------|--------|
| Node.js (서버 + 스케줄러) | ~200MB |
| Chromium headless (검색 시) | ~300-500MB |
| SQLite | ~50MB |
| **합계** | **~550-750MB** |

---

## 9. 오픈소스 설치 가이드 (사용자 관점)

```bash
# 1. Clone
git clone https://github.com/your-repo/stock-self-evolving.git
cd stock-self-evolving

# 2. 실행
docker compose up -d

# 3. 대시보드 접속
# http://localhost:4001

# 4. 초기 설정 (대시보드 Settings 페이지)
#    - LLM Provider 추가 (API Key, Model 등)
#    - 한국투자증권 API 키 설정 (한국 종목 사용 시)
#    - 종목 추가 → 자동 예측 시작
```

---

## 10. LLM Provider 설정 (Hanseol local-cli-git 패턴)

### 지원 Provider 목록
| Provider | Base URL (기본값) | 특이사항 |
|----------|-------------------|----------|
| OpenAI | https://api.openai.com/v1 | - |
| Anthropic | https://api.anthropic.com/v1 | - |
| Google Gemini | https://generativelanguage.googleapis.com/v1beta | - |
| DeepSeek | https://api.deepseek.com/v1 | - |
| Ollama | http://localhost:11434/v1 | 로컬 모델 |
| LM Studio | http://localhost:1234/v1 | 로컬 모델 |
| 커스텀 (OpenAI 호환) | 사용자 입력 | vLLM, text-gen-webui 등 |

### Provider별 Capability
```typescript
interface ProviderCapability {
  supportsParallelToolCalls: boolean;
  supportsToolChoiceRequired: boolean;
  supportsToolChoice: boolean;
}
```
- tool_choice 미지원 provider → 'auto'로 fallback
- parallel_tool_calls 미지원 → 파라미터 생략

### Settings UI 구성
- Provider 드롭다운 선택 → Base URL 자동 채움
- API Key 입력
- Model 입력 (또는 API로 모델 목록 조회)
- 연결 테스트 버튼
- Main Agent용 / Search Sub-Agent용 별도 설정 가능 (선택적)

---

## 11. 정답 판정 로직

```
예측: UP    → 실제 변동률 > +0.3%  → 정답 ✓
예측: UP    → 실제 변동률 ≤ +0.3%  → 오답 ✗
예측: DOWN  → 실제 변동률 < -0.3%  → 정답 ✓
예측: DOWN  → 실제 변동률 ≥ -0.3%  → 오답 ✗
예측: FLAT  → |실제 변동률| ≤ 0.3%  → 정답 ✓
예측: FLAT  → |실제 변동률| > 0.3%  → 오답 ✗
예측: UNABLE → 정답률 계산에서 제외
```

### 승률 계산
- **종목별 승률** = 정답 수 / (전체 예측 수 - UNABLE 수) × 100
- **종합 승률** = 전 종목 정답 수 합 / 전 종목 유효 예측 수 합 × 100

---

## 12. 프로젝트 디렉토리 구조

```
stock-self-evolving/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
├── vite.config.ts
├── search_guide.md
│
├── src/
│   ├── server/                    # Backend (Fastify)
│   │   ├── index.ts               # 서버 엔트리포인트
│   │   ├── routes/
│   │   │   ├── stocks.ts          # 종목 CRUD + 검색 API
│   │   │   ├── predictions.ts     # 예측 기록 조회 API
│   │   │   ├── notes.ts           # 노트 조회 API
│   │   │   ├── settings.ts        # 설정 CRUD API
│   │   │   └── dashboard.ts       # 대시보드 통계 API
│   │   ├── db/
│   │   │   ├── database.ts        # SQLite 초기화 + 마이그레이션
│   │   │   └── migrations/        # 스키마 마이그레이션
│   │   ├── services/
│   │   │   ├── stock-api.ts       # 한투/Yahoo API 래퍼 (캐싱 포함)
│   │   │   ├── scheduler.ts       # node-cron 스케줄러
│   │   │   └── accuracy.ts        # 승률 계산
│   │   ├── agents/
│   │   │   ├── prediction-agent.ts   # Prediction Agent 오케스트레이션
│   │   │   ├── review-agent.ts       # Review Agent 오케스트레이션
│   │   │   └── search/
│   │   │       ├── search-agent.ts       # Search Sub-Agent
│   │   │       ├── browser-client.ts     # CDP Chrome 제어
│   │   │       ├── browser-tools.ts      # 13개 브라우저 도구
│   │   │       └── prompts.ts            # 검색 시스템 프롬프트
│   │   ├── llm/
│   │   │   ├── llm-client.ts         # OpenAI 호환 API 클라이언트
│   │   │   ├── iteration-engine.ts   # chatCompletionWithTools 루프
│   │   │   └── providers.ts          # Provider 정의 + capability
│   │   └── prompts/
│   │       ├── prediction.ts         # Prediction Agent 프롬프트
│   │       └── review.ts             # Review Agent 프롬프트
│   │
│   └── client/                    # Frontend (React)
│       ├── App.tsx
│       ├── main.tsx
│       ├── pages/
│       │   ├── Dashboard.tsx         # 메인 대시보드
│       │   ├── StockDetail.tsx       # 종목 상세
│       │   ├── StockAdd.tsx          # 종목 추가
│       │   └── Settings.tsx          # 설정
│       ├── components/
│       │   ├── StockCard.tsx
│       │   ├── PredictionTable.tsx
│       │   ├── AccuracyChart.tsx
│       │   ├── PriceChart.tsx
│       │   ├── NoteViewer.tsx
│       │   └── LLMProviderForm.tsx
│       └── lib/
│           ├── api.ts                # Backend API 클라이언트
│           └── types.ts              # 공유 타입
│
└── data/                          # Docker 볼륨 마운트
    └── stock-evolving.db          # SQLite DB 파일
```

---

## 부록 A: 참조 프로젝트

| 참조 | 활용 내용 |
|------|-----------|
| `~/Project/Hanseol(main-dev)` | LLM iteration engine 구조, chatCompletionWithTools, rebuildMessages 패턴 |
| `~/Project/Hanseol(local-cli-git)` | LLM provider 설정 UI, multi-provider 지원, capability 플래그 |
| `~/땅콩패밀리` | Docker Compose 배포, DS720+ 환경, Fastify+React+SQLite 스택 |
| `search_guide.md` | Search Sub-Agent CDP 구조, 브라우저 도구, 검색 전략 |
