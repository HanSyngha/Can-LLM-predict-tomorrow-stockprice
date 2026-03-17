# Hanseol Search Agent - 동작 방식 상세 가이드

## 개요

Hanseol의 search agent는 **외부 API(Tavily, Google API 등) 없이** headless Chrome을 직접 제어하여 Google/Naver에서 정보를 수집하는 방식입니다. LLM이 브라우저 도구를 반복 호출하면서 자율적으로 검색 → 페이지 방문 → 정보 추출 → 합성을 수행합니다.

---

## 아키텍처

```
User Query
  ↓
Main Agent (Execution LLM)
  ↓ tool_call: search_request({ instruction: "..." })
  ↓
SearchRequestTool (LLMAgentTool)
  ├── 오늘 날짜 주입: [Today's Date: 2026-03-17]
  ↓
BrowserSubAgent
  ├── 1. Chrome headless 실행 (CDP 포트 9223)
  ├── 2. Browser tools를 SubAgent에 바인딩
  ↓
SubAgent (반복 루프, 최대 30 iterations)
  ├── LLM에게 system prompt + instruction 전달
  ├── LLM이 browser tool 선택 → 실행 → 결과 받음
  ├── 반복... (navigate → extract → navigate → extract)
  ├── LLM이 "complete" tool 호출 → 최종 답변 반환
  ↓
Main Agent가 결과를 사용자에게 전달
```

---

## 핵심 컴포넌트

### 1. SearchRequestTool (`search-agent.ts`)

```typescript
execute: async (args, llmClient) => {
  const today = new Date().toISOString().split('T')[0];
  const instruction = `[Today's Date: ${today}]\n\n${rawInstruction}`;

  const agent = new BrowserSubAgent(
    llmClient, 'search', BROWSER_SUB_AGENT_TOOLS, SEARCH_SYSTEM_PROMPT,
    { requiresAuth: false, serviceType: 'search', maxIterations: 30 }
  );
  return agent.run(instruction);
}
```

- `LLMAgentTool` 타입: Main Agent가 tool_call로 호출, 내부에서 Sub-LLM 사용
- 오늘 날짜를 자동 주입하여 최신 정보 판단 가능
- `maxIterations: 30` — 최대 30번의 도구 호출 허용

### 2. BrowserSubAgent (`browser-sub-agent.ts`)

```
run(instruction) {
  1. Chrome headless 실행 (launchSubAgentBrowser)
  2. CDP 포트 9223으로 BrowserClient 싱글톤 연결
  3. browser tools에 BrowserClient 바인딩 (도구별 execute 함수 교체)
  4. SubAgent 생성 + 실행
}
```

- 브라우저 생명주기 관리 (시작/인증/종료)
- 서브에이전트용 전용 CDP 포트 (9223) — 일반 브라우저 도구(9222)와 분리
- 영구 프로필 디렉토리 사용 (로그인 상태 유지, search에는 불필요)

### 3. SubAgent (`sub-agent.ts`)

LLM + Tools 반복 루프의 핵심 엔진:

```
while (iterations < maxIterations) {
  1. LLM에 [system prompt + user instruction + 이전 도구 결과] 전달
  2. LLM이 tool_call 반환 (예: browser_navigate, browser_execute_script)
  3. 해당 도구 실행 → 결과 수집
  4. LLM이 "complete" tool 호출하면 → 최종 답변으로 반환
  5. iteration 남은 개수에 따라 경고 주입 (30% 이하: ⚠️, 15% 이하: 🚨)
}
```

- **Plan Mode**: planningPrompt가 있으면 매 iteration마다 메시지 재구성 (search에는 미사용)
- **Simple Mode**: 메시지 누적 방식 (search가 사용)
- temperature: 0.3 (안정적 도구 선택)

### 4. BrowserClient (`browser-client.ts`)

Chrome DevTools Protocol(CDP) 직접 제어:

```
플랫폼별 브라우저 실행:
- native-windows: spawn(chrome.exe, --remote-debugging-port=9223, --headless=new)
- wsl: powershell.exe → Start-Process chrome.exe
- native-linux: spawn(/usr/bin/google-chrome, --headless=new)

CDP 연결:
- http://localhost:9223/json → 타겟(탭) 목록 조회
- WebSocket으로 CDP 연결 → 명령 전송/응답 수신
```

- **외부 의존성 없음** (Playwright, Puppeteer 사용 안 함)
- 순수 Node.js `ws` WebSocket + `child_process` spawn
- CDP 포트로 Chrome을 직접 제어

### 5. Browser Tools (13개)

SubAgent가 사용할 수 있는 도구 목록:

| 도구 | 용도 |
|------|------|
| `browser_navigate` | URL 이동 |
| `browser_execute_script` | JavaScript 실행 (DOM 쿼리, 데이터 추출) |
| `browser_get_text` | 페이지/요소 텍스트 추출 |
| `browser_get_html` | 페이지 HTML 조회 |
| `browser_get_page_info` | 현재 URL, title 확인 |
| `browser_click` | CSS 셀렉터로 요소 클릭 |
| `browser_fill` | 입력 필드에 값 입력 |
| `browser_type` | 문자별 타이핑 |
| `browser_press_key` | 키보드 키 입력 |
| `browser_wait` | CSS 셀렉터 요소 대기 |
| `browser_screenshot` | 스크린샷 캡처 |
| `browser_focus` | 브라우저 윈도우 포커스 |
| `browser_send` | Raw CDP 명령 전송 |

### 6. SEARCH_SYSTEM_PROMPT (`prompts.ts`)

LLM에게 검색 전략을 지시하는 시스템 프롬프트. 핵심 섹션:

- **CORE PRINCIPLES**: Naver 우선, 소스 페이지 필수 방문, 교차 검증
- **BLOCKED DOMAINS**: Cloudflare 차단 사이트 목록 (openai.com, anthropic.com 등)
- **SEARCH ENGINES**: Naver/Google/StackOverflow/Wikipedia 셀렉터 + 추출 스크립트
- **RESEARCH WORKFLOW**: 7단계 (분석→Naver검색→방문→Google검색→방문→심층→합성)
- **NUMERICAL DATA VERIFICATION**: 수치 정보 2개 이상 소스 교차검증
- **EFFICIENCY RULES**: iteration 예산 배분 (1-4: 검색, 5-15: 방문, 20+: 합성 필수)

---

## 실행 흐름 예시

사용자: "GPT-4o와 Claude 3.5 Sonnet API 가격 비교해줘"

```
[Iteration 1] browser_navigate → https://search.naver.com/search.naver?where=web&query=GPT-4o+Claude+3.5+Sonnet+API+가격+비교+2025
[Iteration 2] browser_execute_script → Naver 검색 결과 JSON 추출 (8개 링크)
[Iteration 3] browser_navigate → https://deepdaive.com/openai-api (블로그)
[Iteration 4] browser_execute_script → 페이지 본문 추출 (GPT-4o: $2.50/$10.00)
[Iteration 5] browser_navigate → https://aijeong.com/claude-api-비용 (블로그)
[Iteration 6] browser_execute_script → 페이지 본문 추출 (Claude 3.5: $3.00/$15.00)
[Iteration 7] browser_navigate → https://www.google.com/search?q=... (CAPTCHA → 스킵)
[Iteration 8-10] 추가 소스 방문 + 교차 검증
[Iteration 11] complete → "GPT-4o $2.50/$10.00, Claude $3.00/$15.00. 월 5000만+1000만 토큰 시 GPT-4o $225, Claude $300. 차이 $75(25%)"
```

---

## Synology DS720+ (Docker) 배포 시 핵심

### 필요 조건

```
1. Node.js 20+ (LTS)
2. Chromium headless (apt install chromium)
3. ws 패키지 (npm, WebSocket for CDP)
4. OpenAI 호환 LLM endpoint (sub-agent용)
```

### 핵심 코드 의존성 (search agent만 추출 시)

```
src/
├── agents/
│   ├── browser/
│   │   ├── search-agent.ts          # search_request 도구 정의
│   │   ├── browser-sub-agent.ts     # 브라우저 생명주기 + SubAgent 위임
│   │   ├── browser-profile-manager.ts # 브라우저 프로필/인증 관리
│   │   └── prompts.ts               # SEARCH_SYSTEM_PROMPT
│   └── common/
│       ├── sub-agent.ts             # LLM + Tools 반복 루프 엔진
│       └── complete-tool.ts         # "complete" 도구 정의
├── tools/
│   └── browser/
│       ├── browser-client.ts        # CDP 직접 제어 (Chrome 실행+WebSocket)
│       └── browser-tools.ts         # 13개 브라우저 도구 정의
├── core/
│   └── llm/
│       └── llm-client.ts            # OpenAI 호환 API 클라이언트
└── utils/
    ├── platform-utils.ts            # 플랫폼 감지 (linux/wsl/windows)
    └── wsl-utils.ts                 # WSL 전용 유틸
```

### Docker Compose 예시 (DS720+)

```yaml
services:
  search-agent:
    image: node:20-slim
    command: >
      sh -c "
        apt-get update && apt-get install -y chromium --no-install-recommends &&
        rm -rf /var/lib/apt/lists/* &&
        node /app/dist/search-runner.js
      "
    environment:
      - LLM_ENDPOINT=http://your-llm-endpoint:8080/v1
      - LLM_API_KEY=your-key
      - LLM_MODEL=your-model
      - CHROME_PATH=/usr/bin/chromium
    volumes:
      - ./app:/app
      - chrome-profile:/tmp/chrome-profile
    ports:
      - "3000:3000"
    deploy:
      resources:
        limits:
          memory: 2G

volumes:
  chrome-profile:
```

### 메모리 예산 (DS720+ 8GB 기준)

| 프로세스 | 메모리 |
|----------|--------|
| Chromium headless | ~300-500MB |
| Node.js (search agent) | ~100-200MB |
| LLM API 호출 대기 | ~50MB |
| **합계** | **~500MB-700MB** |

8GB 중 ~700MB 사용 → 충분한 여유

---

## 핵심 설계 결정 및 교훈 (v1→v6 개선 과정)

### 1. Naver 우선 전략 (v2)
- **문제**: Google이 headless Chrome에 CAPTCHA 차단
- **해결**: Naver를 primary 엔진으로, Google은 secondary (차단 시 스킵)
- **효과**: 검색 성공률 90%+ → iteration 낭비 감소

### 2. Cloudflare 차단 도메인 목록 (v3)
- **문제**: openai.com, anthropic.com 등 직접 방문 시 Cloudflare challenge로 빈 페이지
- **해결**: 차단 도메인 목록을 프롬프트에 명시, "블로그/비교 사이트 경유" 전략
- **효과**: 2-5 iteration 절약 (차단 사이트 재시도 방지)

### 3. Iteration 예산 관리 (v5)
- **문제**: 40 iterations * 25초/iteration = 16분 → timeout 초과
- **해결**: maxIterations 30으로 축소, "20 iteration 이후 반드시 complete" 규칙
- **효과**: 대부분 15-25 iteration에서 완료, timeout 문제 해소

### 4. 수치 교차 검증 (v4)
- **문제**: 블로그마다 다른 가격/스펙 정보 (구버전 vs 최신)
- **해결**: "2개 이상 소스에서 동일 수치 확인" 규칙, 불일치 시 범위로 표시
- **효과**: 정확도 향상 (92→97점)

### 5. NSIS differentialPackage 비활성화
- **문제**: Electron auto-update가 blockmap 차등 패치로 app.asar를 불완전하게 교체 → 구 프롬프트 실행
- **해결**: `differentialPackage: false` (전체 installer 다운로드)
- **효과**: auto-update 후에도 최신 코드 보장

---

## 성능 벤치마크 (30개 시나리오)

| 지표 | 수치 |
|------|------|
| 평균 점수 (15개 정상 테스트) | **96.3/100** |
| 95점 이상 통과율 | **13/15 (86.7%)** |
| 평균 iteration | ~22 |
| 평균 소요 시간 | ~8분 |
| 소스 페이지 평균 방문 수 | 3-5개 |

### 채점 기준
- Accuracy (40점): 핵심 사실/수치의 정확성
- Completeness (30점): 질문의 모든 측면에 대한 답변 포함
- Sources (15점): 실제 소스 페이지 방문 + 인용
- Recency (15점): 최신 정보 반영 (날짜 기반)
