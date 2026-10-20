# 운영 런북

설계 근거는 `docs/DESIGN.md`. 이 문서는 **손으로 하는 절차**만 적는다. 복사용 명령 블록에는 `#` 주석을 넣지 않는다(zsh `interactive_comments`).

---

## 1. 첫 로컬 셋업 (한 번)

```
git clone <repo> && cd Real-Fear-Greed-Index
npm install
npm run doctor
cd proxy && npm ci && cp .env.example .env && cd ..
```

`proxy/.env` 에 `FRED_API_KEY`·`YAHOO_PROXY_URL` 을 채운다(야후는 직접 접속이 429 라 프록시가 있어야 동작). 키는 채팅·스크린샷에 붙이지 않는다. 확인은 `npm run check-config`.

---

## 2. M2 0번 작업 — 외부 응답 형태 확정 [검증 필요 해소]

이 코드는 네트워크가 차단된 환경에서 "알려진 형태"를 가정해 작성됐다. 로컬에서 아래를 **한 번** 돌려 형태를 확정한다. FRED 키가 없으면 CNN·Stooq·Yahoo 3개만 먼저 돌려도 된다.

### 2-1. 실행

```
cd proxy
node scripts/inspect.mjs --source cnn --save
node scripts/inspect.mjs --source fred --symbol SPX --save
node scripts/inspect.mjs --source stooq --symbol SPX --save
node scripts/inspect.mjs --source yahoo --symbol SPX --save
node scripts/inspect.mjs --source fred --symbol NDX --save
node scripts/inspect.mjs --source stooq --symbol NDX --save
node scripts/inspect.mjs --source yahoo --symbol NDX --save
```

각 명령은 `status=200 ...` 으로 시작하는 형태 요약을 출력하고 `--save` 가 붙으면 `test/fixtures/` 에 실응답 파일을 저장한다.

### 2-2. 소스별 확인 체크리스트

#### CNN

출력 예시:

```
status=200 content-type=application/json bytes=...
fear_and_greed keys: score, rating, timestamp, ...
timestamp → NY date 2026-10-10
historical points: ~365
  x=... utcMidnight=true utcDate=2025-... nyDate=2025-...
```

| # | 확인 | 맞으면 | 다르면 |
|---|---|---|---|
| 1 | `historical.data[].x` 의 `utcMidnight=true` 이고 `utcDate == nyDate` | `cnnEpochToDate` 그대로 | `src/sources/cnn.ts` 의 `cnnEpochToDate` 규칙을 실측에 맞게 바꾸고 `test/sources.test.ts` 갱신 |
| 2 | `fear_and_greed.timestamp` 존재 | 그대로 | 없으면 `fg-date-mismatch` 검사가 자동으로 건너뜀(문제 없음) |
| 3 | `timestamp → NY date` 가 직전 거래일 | 그대로 | 날짜가 다르면 기록해두기(파서 수정은 불필요) |

#### FRED

출력 예시:

```
status=200 content-type=application/json bytes=...
shape: { ... observations: array(N) of { date: string, value: string } }
observations: 2400+, first: 2015-01-02, last: 2026-10-10, dots: 몇 개
```

| # | 확인 | 맞으면 | 다르면 |
|---|---|---|---|
| 1 | `last` 날짜가 전일 거래일 (SP500 은 ≈ 00:00Z, NASDAQ100 은 ≈ 03:37Z 전이면 하루 더 전) | 그대로 | 그 시각이 지나도 하루 늦으면 FRED 쪽 지연 — collect 의 `wait-for-fred` 잡 로그 확인 |
| 2 | `dots` 가 0 이상 | 그대로(`.` 제거 로직 존재) | — |

#### Stooq

출력 예시:

```
status=200 content-type=text/csv bytes=...
header: Date,Open,High,Low,Close,Volume
rows: 수천, first: 옛날, last: 2026-10-10
```

| # | 확인 | 맞으면 | 다르면 |
|---|---|---|---|
| 1 | 헤더가 `Date,Open,High,Low,Close,Volume` 정확히 이 순서 | 그대로 | `parseStooq` 컬럼 이름 수정 |
| 2 | `status=200` 이고 데이터 있음 (`No data` 가 아님) | 그대로 | 시간을 바꿔 재시도 |

#### Yahoo

출력 예시:

```
status=200 content-type=application/json bytes=...
shape: { chart: { result: array(1) of { ... timestamp: array(N) ... }, error: null } }
timestamps: ~22, first → NY ..., last → NY 2026-10-10
```

| # | 확인 | 맞으면 | 다르면 |
|---|---|---|---|
| 1 | `timestamp` 가 초 단위(10자리 숫자) | 그대로 | 밀리초(13자리)면 `normalizeYahoo` 에서 `*1000` 제거 |
| 2 | `close` 배열에 null 포함 가능 | 그대로(제거 로직 존재) | — |

### 2-3. 확인 후 처리

**형태가 모두 맞으면:**

```
ls test/fixtures/
```

`cnn.SPX.recorded.json`, `fred.SPX.recorded.json`, `stooq.SPX.recorded.csv`, `yahoo.SPX.recorded.json` 등 7개 파일이 있어야 한다. CNN 히스토리는 30일로 잘려 저장된다(라이선스 최소화).

```
cd ..
git add proxy/test/fixtures/
git commit -m "chore: add recorded API response fixtures from inspect"
git push
```

이후 `test/sources.test.ts` 에서 합성 픽스처를 recorded 파일로 교체하고 `[검증 필요]` 를 제거한다.

**형태가 다르면:** 어느 소스의 어떤 필드가 다른지 기록하고 파서를 실측에 맞게 고친 뒤 테스트를 갱신한다.

---

## 3. 파이프라인 로컬 실행

```
cd proxy
npm run collect
cat public/v1/status.json
npm run serve
```

- `status.result` 가 `ok` 여야 정상. `partial` 이면 `sources[]` 에서 어느 소스가 `date_lag`/`failed` 인지 본다.
- 주말·휴장일에는 `published.unchanged: true` 가 정상이다.
- 폰(샌드박스)에서 보려면 평문 HTTP 대신 HTTPS 터널을 쓴다:

```
cloudflared tunnel --url http://localhost:8787
```

나온 `https://….trycloudflare.com` 을 `src/config.local.ts` 의 `apiBaseUrl` 에 넣는다(끝에 슬래시 없음).

---

## 4. 샌드박스 확인 순서 (막히면 콘솔부터)

1. `npm run doctor` 통과
2. `npm run dev`
3. 맥과 폰을 같은 Wi-Fi 에(핫스팟 불가). `ifconfig | grep "inet "` 로 맥 IP
4. 앱스토어 "앱인토스 샌드박스" → 로컬 네트워크 권한 허용 → 서버 주소에 맥 IP
5. `intoss://real-fear-greed-index`
6. dev 서버 창에서 `j` → DevTools 콘솔. **흰 화면이면 번들·버전·설정을 뒤지기 전에 여기부터 본다.**

첫 실행은 **목 모드**(apiBaseUrl 비움). 확인 항목:
- 홈: 게이지·축 막대·사분면 격자·문장·스파크라인이 그려지는가, "샘플 데이터" 배지가 보이는가
- 지수 토글 SPX↔NDX, 당겨서 새로고침
- `mockScenario` 를 `stale`, `fg_missing`, `capitulation` 으로 바꿔 상태별 화면
- 정보 화면(`계산 방식과 출처 ›`)과 뒤로가기(호스트 내비바)

두 번째 실행은 **실데이터**(§3 의 HTTPS URL). 미니앱에서 외부 도메인 fetch 가 막히면 앱인토스 콘솔의 네트워크 정책을 확인한다(DESIGN §3.7).

`EADDRINUSE` 는 dev 서버가 이미 떠 있다는 뜻 — 새 창을 열지 말고 원래 창에서 `Ctrl+C`.

---

## 5. GitHub Pages + GitHub Actions 셋업 (한 번)

게시는 **GitHub Pages**다(`https://won-topiaa.github.io/Real-Fear-Greed-Index/`). collect 워크플로가 `proxy/public`(수집 결과 + 웹 화면)을
`actions/upload-pages-artifact` → `actions/deploy-pages` 로 올린다. (2026-10-15 하루 동안 쓴 Cloudflare Workers 는 계정 하위 도메인에 실명이 들어가 내렸다.)

1. 저장소 Pages 를 Actions 빌드로 켠다: `gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow`. GitHub **Variables** `PAGES_HOST=<owner>.github.io/<repo>`(이전 게시본을 내려받는 데 쓴다).
2. GitHub **Secrets**: `FRED_API_KEY`, `YAHOO_PROXY_URL`(야후 프록시 — Cloudflare Worker `https://<이름>.<계정>.workers.dev/`, `?url=<인코딩된 주소>` 를 받는다. 계정 하위 도메인에 실명이 있어 레포·로그에 남기지 않는다), `HEALTHCHECKS_PING_URL`(선택).
3. GitHub **Variables**(선택): `CNN_USER_AGENT`.
4. `.github/workflows/collect.yml` 을 **수동 실행(workflow_dispatch)** 해 `status-<run>` 아티팩트의 `status.json` 이 `ok` 인지 본다.
5. GitHub 는 **공개 레포가 60일간 저장소 활동(커밋 등)이 없으면 스케줄 워크플로를 끈다**(워크플로 실행은 활동이 아니다). collect.yml 의 마지막 단계(keepalive)가 마지막 커밋이 50일을 넘으면 빈 커밋을 push 한다 — 수동 실행에서 `keepalive_days=0` 으로 시험할 수 있다. 추가로 healthchecks.io 체크(주기 1일, 유예 12시간)의 핑 URL 을 Secrets 에 넣으면 "잡이 아예 안 돈" 경우도 알림을 받는다(선택).
6. 아이콘: 512×512 PNG 를 `proxy/public/static/icon.png` 로 같이 게시하고 `granite.config.ts` 의 `brand.icon` 에 `https://<PAGES_HOST>/static/icon.png` 를 적는다. (게시 산출물에 정적 파일을 포함하도록 collect.yml 의 배포 단계 전에 복사 스텝을 추가한다 — M5.)

Actions 러너 IP 가 CNN 봇 방어에 걸리면(`status.sources[cnn].error = http_403`), 수집기를 집 맥의 launchd 로 옮긴다:

```
cd proxy && npm run collect && npm run build-web && npm run serve
```

(로컬 확인용. 게시는 워크플로 수동 실행 `gh workflow run collect` 로 한다.)

코드는 같고 실행 위치만 다르다.

---

## 6. 릴리즈 절차 (키 있는 로컬 기계에서)

```
git pull
npm ci
npm run doctor
npm run typecheck && npm test
cd proxy && npm test && cd ..
npm run check-config
```

`check-config` 출력에서 앱이 **실데이터(프록시)** 모드인지, 프록시 키가 채워졌는지 본다(값은 안 보인다).

```
curl -s https://<PAGES_HOST>/v1/status.json
```

`result` 가 `ok` 또는 `partial` 이고 `expectedLatestTradingDate` 가 최근 거래일인지 본다.

```
npm run dev
```

샌드박스에서 실데이터 홈이 `ready`(배지 없음) 로 뜨는지, DevTools 콘솔 오류 0 인지 확인한 뒤:

```
npm run build
npm run deploy
```

- `npm run build` 는 `ait build`(= `.ait` 산출물). `granite build` 가 아니다.
- `npm run deploy` 전에 `predeploy` 가 자동으로 돈다: 목 모드·원격 세션(`CI`, `CODESPACES`, `SSH_CONNECTION`, `GITHUB_ACTIONS`, `CLAUDECODE`, `CLAUDE_CODE_*`)·아이콘 미기입이면 실패한다.
- 키 교체 시 `npx ait token remove` 먼저. 프로필에 옛 키가 남아 있으면 `--api-key` 가 조용히 무시된다.
- 배포 후 실제 토스 앱(Android ≥ 5.220.0 / iOS ≥ 5.221.0)에서 최종 확인. 그 미만 버전은 앱이 아예 그려지지 않는다.

스토어 등록: 아이콘 **URL**, 세로 636×1048 3장 이상, 가로 1504×741 1장 이상, 약관 체크박스 **두 개**. 그림은 손으로 그리지 않고 스크립트로 만든다(M5, `selectHomeViewModel` 공유).

---

## 7. 사고 대응

| 증상 | 확인 | 조치 |
|---|---|---|
| GitHub 실패 메일 "collect" (Freshness check) | 실패한 실행의 요약(게시 점검 표·⚠️·❌) | `NDX 가 N거래일 늦다` 면 아래 줄. `수집 실패`면 Collect 로그. `NYSE_HOLIDAYS` 면 `src/core/calendar.ts` 에 다음 해 휴장일 추가 |
| 앱에 "N거래일 전 값이에요" 배지 | `status.json` 의 `sources[]` | FRED `date_lag` + yahoo `failed` 면 야후 프록시가 둘 다 막힌 것: `curl "$YAHOO_PROXY_URL?url=…"` 로 확인, 전용 프록시는 `cd proxy && npm run deploy-yahoo-proxy` 로 다시 배포. 그동안 `wait-for-fred` 잡이 FRED 를 기다리고(시한 종가 16시간 뒤) 다음 예약 실행이 다시 시도한다. 급하면 `gh workflow run collect` |
| 실행 요약에 `yahoo/…: 앞선 경로 실패 — 예비 경로로 받았다` | `status.json` 의 `sources[yahoo].fallbacks` | 전용 프록시(`rfg-yahoo-proxy`)가 실패 중. 위와 같이 확인·재배포 |
| 실행 요약에 `cnn: 앞선 경로 실패(#1 http_4xx) — 예비 경로로 받았다` | `status.json` 의 `sources[cnn].fallbacks` | CNN 이 러너 IP 의 직접 접속을 막아 Cloudflare 프록시로 받았다(값은 정상). 계속되면 CNN 응답 형태·차단을 `npm run inspect -- --source cnn` 으로 확인. 프록시까지 막히면 심리는 마지막 값(5일까지, 화면에 '심리 지수는 M/D 값')을 쓰다가 결측이 된다 |
| 앱이 지수를 `—` 로 막음(stale) | 잡이 3거래일 넘게 실패 | Actions 로그·healthchecks 확인. 러너 차단이면 §5 의 실행 위치 이동 |
| "심리 데이터를 아직 못 받았어요" | `sources[cnn].error` | `http_403`/`schema` 면 inspect 로 형태 재확인. 히스토리 마지막 값이 5달력일 안이면 자동 폴백 중 |
| 앱 "업데이트가 필요해요" | 스냅샷 `schemaVersion` 변경 | 의도한 변경이면 앱 재배포. 아니면 파이프라인 롤백 |
| 홈에 "샘플 데이터" 배지가 배포본에서 보임 | 목 모드로 배포됨 | 즉시 `apiBaseUrl` 채워 재배포. predeploy 를 우회했는지 확인 |
| 사이트가 하루 넘게 안 바뀌는데 실패 메일도 없음 | Actions 탭에 예약 실행이 없음 | GitHub 예약 실행이 멈춘 것. 감시 워커가 돌렸어야 한다: `cd proxy && npx wrangler tail rfg-watchdog` 로 매시 17분 로그(`no: …`·`dispatched: …`·`error: …`) 확인. `skip: GH_DISPATCH_TOKEN 없음` 이면 토큰을 넣는다(`cd proxy && npm run set-watchdog-token`), `error: 실행 목록 401` 이면 토큰 만료 → 새로 만들어 같은 명령. 토큰: GitHub Settings → Developer settings → Fine-grained tokens, 저장소 `Real-Fear-Greed-Index` 만, Repository permissions 의 Actions: Read and write. 급하면 `gh workflow run collect` |
| healthchecks 알림 | 잡이 안 돌았음 | Actions 스케줄 비활성(60일 비활성) 여부 → 수동 실행 후 레포에 커밋 1건. keepalive 단계 로그(`last commit N days ago`)와 push 경고 확인 |

---

## 8. 상수·파라미터를 바꿀 때

1. `src/core/constants.ts` 한 곳만 바꾼다.
2. `npm test` (핵심 수식 테스트가 새 값과 일치하는지; `MIN_CLOSES` 류는 doctor 가 재검사).
3. `cd proxy && npm run build-fixtures && npm test` — 목 픽스처와 골든이 다시 만들어진다. 시나리오가 의도한 국면을 못 만들면 스크립트가 실패한다(시드·레짐 조정).
4. 앱과 파이프라인을 **같이** 배포한다. 스냅샷에 `params` 가 실려 있어 다르면 정보 화면에 경고가 뜬다.
