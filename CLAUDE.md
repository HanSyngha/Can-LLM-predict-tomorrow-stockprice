# Stock-Self-Evolving

## 프로젝트 개요
LLM 자기반성을 통한 주식 예측 정확도 자가 발전 검증 프로젝트.

## Tech Stack
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Fastify + TypeScript
- Database: SQLite (better-sqlite3, WAL mode)
- Build: esbuild (server) + Vite (client)
- Deploy: Docker Compose

## 개발

```bash
npm install
npm run dev          # 백엔드 (tsx watch, port 4001)
npm run dev:client   # 프론트엔드 (vite, port 5173, proxy to 4001)
npm run build        # 프로덕션 빌드
npm start            # 프로덕션 서버
```

## NAS 배포 (DS720+)

### 접속 정보
- SSH: `ssh -i ~/.ssh/nas_key -p 7348 syngha_han@syngha.synology.me`
- Docker 경로: `/volume1/docker/stock-self-evolving/`
- 포트: 4001

### 배포 절차

```bash
# 1. 로컬에서 빌드 확인
npm run build

# 2. 배포 tarball 생성
cd /home/syngha/Stock-Self-Evolving
tar czf /tmp/stock-self-evolving-deploy.tar.gz \
  --exclude=node_modules --exclude=data --exclude=.git \
  --exclude=.env --exclude=.claude .

# 3. NAS에 업로드 (ssh pipe 방식 - scp/rsync 안됨)
ssh -i ~/.ssh/nas_key -p 7348 syngha_han@syngha.synology.me \
  "mkdir -p /volume1/docker/stock-self-evolving && cat > /volume1/docker/stock-self-evolving/deploy.tar.gz" \
  < /tmp/stock-self-evolving-deploy.tar.gz

# 4. NAS에서 압축해제 + Docker 빌드 + 실행
ssh -i ~/.ssh/nas_key -p 7348 syngha_han@syngha.synology.me "
  cd /volume1/docker/stock-self-evolving && \
  tar xzf deploy.tar.gz && rm deploy.tar.gz && \
  export PATH=/usr/local/bin:\$PATH && \
  docker compose down && \
  docker compose build --no-cache && \
  docker compose up -d
"

# 5. 배포 후 로그 확인
ssh -i ~/.ssh/nas_key -p 7348 syngha_han@syngha.synology.me \
  "docker logs --tail 30 stock-self-evolving-app-1"

# 6. 접속 확인
curl https://syngha.synology.me:4001/api/dashboard/summary
```

### 배포 후 초기 설정 (NAS 전용)

LLM 5개 모델 추가 (Z.AI):
```bash
BASE="http://localhost:4001/api"
KEY="aff0cf9669af4f45aa4e46f71a0759a3.xY48HZRlchIOuVnk"
URL="https://api.z.ai/api/coding/paas/v4/"

for model in glm-5 glm-5-turbo glm-4.7 glm-4.6 glm-4.5; do
  curl -X POST "$BASE/settings/llms" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"$model\",\"name\":\"${model^^}\",\"provider\":\"zai\",\"baseUrl\":\"$URL\",\"apiKey\":\"$KEY\",\"model\":\"$model\",\"isActive\":true}"
done

# Search LLM 설정 (glm-5-turbo)
curl -X PUT "$BASE/settings/search_llm" \
  -H "Content-Type: application/json" \
  -d "{\"value\":{\"provider\":\"zai\",\"baseUrl\":\"$URL\",\"apiKey\":\"$KEY\",\"model\":\"glm-5-turbo\"}}"
```

## 주의사항
- NAS에서 scp/rsync는 permission 문제로 안됨 → `ssh ... cat >` 파이프 방식 사용
- Docker data 볼륨 (`./data`)에 SQLite DB가 있으므로 절대 삭제 금지
- DB 스키마 변경 시 마이그레이션 파일 추가 (직접 reset 금지)
- API 키는 소스코드에 하드코딩 금지 → Settings UI 또는 API로만 설정
