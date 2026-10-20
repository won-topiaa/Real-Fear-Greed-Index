# 실질 공포·탐욕 지수 (Realized Fear & Greed Index)

CNN 공포·탐욕 지수(심리)에 S&P 500 · 나스닥 100 의 **실제 가격 훼손**(1년 고점 대비 낙폭 · 200일선 이격도 · 변동성)을 더해,
시장이 실제로 얼마나 무서워하는지 0(극단적 공포) ~ 100(극단적 탐욕)으로 보여주는 지수다. 미국 장 마감 뒤 하루 한 번 갱신된다.

**웹: https://won-topiaa.github.io/Real-Fear-Greed-Index/**

매수·매도 신호가 아니라 지수를 보여준다. 투자 조언이 아니다.

설계의 단일 진실은 **`docs/DESIGN.md`** 다. 코드와 다르면 문서를 먼저 고친다. 엔진을 고른 근거는 **`research/README.md`**.

## CNN 공포·탐욕 지수와 다른 점

| | CNN | 이 지수 (RFG) |
|---|---|---|
| 실제 바닥은 공포·고점은 탐욕으로 가르는 정확도(AUC, 1 이 만점) | 0.88–0.92 | **0.99** |
| VIX(옵션 시장 공포)와의 일치 | 0.44–0.48 | **0.69–0.71** |
| 하루 평균 변화 | 3.2 | 3.4–3.5 |
| 지수별 | S&P 500 하나 | **S&P 500 · 나스닥 100 따로** |

2020-07 이후 실제 CNN 값으로 잰 값이다(`research/README.md` §6). 심리만 보는 CNN 과 달리 공포가 실제 가격에도 나타났는지를 함께 본다 —
예: 2026-03 의 −7% 조정에서 CNN 8 / RFG 17(둘 다 극단적 공포지만 가격 훼손이 크지 않아 덜 극단적), 2024-12 사상 최고가에서 CNN 52(중립) / RFG 66(탐욕).
대신 심리 급반전에는 한 박자 늦고, 미래 수익률을 더 잘 맞히는 지표는 아니다.

## 계산 (엔진 v2)

```
P_t   = 0.5·pct(−DD252)_t + 0.3·pct(−DISP200)_t + 0.2·pct(RV20)_t     각 pct 는 1260거래일(약 5년) 롤링 백분위
RFG_t = 0.6·FG_t + 0.4·(100 − P_t)                                    FG = CNN 공포·탐욕 지수. 다듬지 않는다(2026-10-20)
```

- 점수는 항상 화면의 두 구성 요소(심리 · 실질 가격)로 바로 계산된다. 3일 지수이동평균으로 다듬던 것은 2026-10-20 뺐다 — 심리와 가격이 둘 다 오른 날에도 점수가 내리는 날이 한 달에 한 번꼴 생겨서다. 정확도는 같고, 하루 출렁임은 CNN 수준(하루 평균 3.4–3.5)이 됐다(`research/README.md` §6.1).

- 구간(웹 게이지): 극단적 공포 0–24 · 공포 25–44 · 중립 45–55 · 탐욕 56–75 · 극단적 탐욕 76–100
- 모든 숫자·문턱은 `src/core/constants.ts`, 문구는 `src/text/copy.ts` 한 곳에서만 나온다.
- 1977–2026 나스닥 종합·닛케이·나스닥 100·S&P 500 에서 가격 구조 25,344개, 결합·평활 1,120개를 비교해 골랐다(`research/`).

## 웹 화면

- **홈**: 고른 지수 하나(S&P 500 / 나스닥 100)의 원호 게이지와 구간, 상태 띠(최신·지연·오래됨, CNN 값이 늦으면 '심리 지수는 M/D 값'), 요약(심리 · 실질 가격 · 전일 대비), 1개월 변화 카드, 자세히 보기 타일
- **추이**: 과거 값(전일 · 1주 · 1개월 · 1년 전), 1년 · 3년 · 5년 · 최대 차트, '두 지수 함께 보기'(기본은 한 지수씩), 툴팁, 표 보기
- **주요 사건**: 2020-07 이후 세계적 사건 14건(SVB 파산, 상호관세 충격 등) 때의 당일 · 1주 뒤 · 1개월 뒤 지수, 차트에 표시
- **구성 요소**: 심리 · 실질 가격 · 낙폭 · 이격도 · 변동성을 같은 방향(0 공포 ~ 100 탐욕) 막대로
- **계산 방법**: 산식 · 출처 · 면책
- 라이트 · 다크, 휴대폰 너비 지원. 색은 빨강(공포) — 회색(중립) — 파랑(탐욕), 색 안내를 항상 같이 보여준다.

## 데이터와 갱신

| 데이터 | 출처 | 비고 |
|---|---|---|
| 심리 | CNN Fear & Greed (비공식 경로) | `graphdata/<날짜>` 로 2020-07-15 부터 받을 수 있다 |
| 종가 | FRED `SP500`(10년) · `NASDAQ100`(13년 조회) | FRED 가 늦는 날(나스닥 100 은 매일)은 Yahoo(Cloudflare 프록시 경유)로 채운다. Stooq 는 막혀 있다 |

- 지수 계산 시작: **나스닥 100 2020-07-15**, **S&P 500 2022-10 중순** (FRED SP500 은 최근 10년만 줘서 5년 백분위 워밍업을 빼면 이때부터다. 시작일은 날마다 하루씩 뒤로 간다)
- CNN 은 그날 값을 다음 날까지 계속 고친다. 가장 최근 하루는 잠정치이고, 이후 수집에서 CNN 의 최신 값으로 바뀐다(그래서 지난 점수가 1점쯤 바뀔 수 있다).
- 게시 파일(GitHub Pages): `v1/snapshot.json`(오늘 값과 최근 60거래일) · `v1/status.json`(수집 상태) · `v1/history.json`(RFG · P 이력과 세부 지표). CNN 원값의 장기 이력은 공개하지 않는다.

### 매일 갱신 — 끊기지 않게 겹겹이

GitHub Actions `collect` 가 수집 → 계산 → 웹 빌드 → GitHub Pages 게시를 한 번에 한다(30초 남짓, 같은 날 여러 번 돌아도 결과가 같다).
평소에는 미국 장 마감 뒤 첫 실행(한국 시간 오전 8~10시쯤)에 그날 값이 올라간다.

| 끊기는 곳 | 대비 |
|---|---|
| GitHub 예약 실행이 2~7시간 늦거나 건너뜀 | 정각을 피한 하루 8번(22:23·23:53·00:37·01:23·03:53·05:37·07:23·10:07 UTC) |
| GitHub 예약 실행이 통째로 멈춤 | **감시 워커**(`proxy/watchdog/`, Cloudflare cron 매시 17분): 게시본이 종가 2.5시간 뒤에도 늦으면 수집을 직접 돌린다. 이미 도는 실행·110분 안의 실행이 있으면 기다리고, 하루 4번까지만 |
| FRED 가 늦음(나스닥 100 은 매일 ≈ 12:37 KST) | Yahoo(전용 Cloudflare 프록시 `proxy/yahoo-proxy/` → 예비 프록시)로 채운다. 그것도 안 되면 `wait-for-fred` 잡이 FRED 를 10분마다 보다가 올라오면 다시 돌린다 |
| CNN(비공식 경로)이 러너를 막음 | 같은 주소를 Cloudflare 프록시로 다시 받는다. 그래도 안 되면 마지막 CNN 값(5일까지)으로 계산하고 화면에 '심리 지수는 M/D 값'을 띄운다 |
| 한 지수만 실패 | 그 지수는 어제 값을 유지하고, 다른 지수는 오늘 값으로 게시(스냅샷·이력 모두 지수별) |
| Pages 배포 일시 오류 | 1분 뒤 한 번 더 |
| 그래도 늦음 | 매 실행 끝의 게시 점검이 종가 12시간 뒤(17:00 KST)에도 늦은 지수가 있으면 실패 → GitHub 실패 메일 |
| 공개 레포 60일 비활성으로 예약 실행 꺼짐 | 마지막 커밋이 50일을 넘으면 빈 커밋(keepalive) |

- 설정: Actions Secrets `FRED_API_KEY`, `YAHOO_PROXY_URL`(쉼표 목록 — 실명이 든 workers.dev 주소라 Secret 으로만), Variables `PAGES_HOST`. 감시 워커는 Worker 비밀값 `GH_DISPATCH_TOKEN`(이 저장소만, Actions 읽기·쓰기 fine-grained 토큰)이 있어야 돈다.
- 수동 게시: `gh workflow run collect`. 워커 배포: `cd proxy && npm run deploy-yahoo-proxy` · `npm run deploy-watchdog`. 감시 로그: `npx wrangler tail rfg-watchdog`.
- 장애 대응은 `docs/runbook.md` §7.

## 구조

```
src/core     순수 TS 수식·분류·달력·스냅샷/이력 계약·백테스트   (react/react-native/node import 금지)
src/text     포맷·문구·주요 사건 목록·홈 뷰모델 (순수 TS)
web/         웹 화면(홈 + 상세 화면). src/core·src/text 를 esbuild 로 번들해 public/ 에 낸다
proxy/       수집·검증·계산·게시 잡(Node 22). 웹 빌드(build-web), 로컬 서버(serve)
  yahoo-proxy/   Cloudflare Worker — 야후 chart · CNN graphdata 주소만 통과시키는 전용 프록시
  watchdog/      Cloudflare Worker(cron) — 게시본이 늦으면 collect 워크플로를 돌리는 감시
research/    엔진 백테스트(Python). 데이터는 받아서 쓰고 커밋하지 않는다
docs/        DESIGN.md(설계), runbook.md(운영 절차)
src/data · src/ui · src/screens · src/pages   토스 미니앱(React Native, 앱인토스) 화면 — 코드는 유지하지만 배포하지 않는다
scripts/     doctor · check-config · check-routes · check-pure-modules · predeploy · ensure-local-config
```

## 로컬에서

```
npm install
npm run typecheck && npm test

cd proxy && npm ci && cp .env.example .env     # .env 에 FRED_API_KEY
npm run collect                                # public/v1/*.json
npm run build-web                              # public/ 에 웹 화면(자산 주소에 내용 해시)
npm run serve                                  # http://localhost:8787
npm test
```

core 상수를 바꾸면 `npm run build-fixtures`(proxy)로 픽스처·골든을 다시 만든다. 자세한 내용은 `proxy/README.md`, 운영 절차는 `docs/runbook.md`.

## 검사

| 명령 | 하는 일 |
|---|---|
| `npm run doctor` | 파일·버전·비밀값 추적 여부·상수 정합성·휴장일·골든 계약·라우트·순수 모듈·금지 단어 검사 |
| `npm run check-config` | 비밀값을 **글자 수만** 출력(캡처해도 안전) |
| CI(`.github/workflows/ci.yml`) | 앱 타입 검사·테스트, 수집 코드 테스트, 웹 빌드 |

## 원칙

- 사용자에게 보이는 숫자·문턱·문구는 `src/core/constants.ts` 와 `src/text/copy.ts` 한 곳에서만 나온다.
- 화면과 판정은 같은 반올림 값을 쓴다. 오래되거나 결측인 데이터로는 값을 보여주지 않는다.
- 네트워크 실패를 샘플 데이터로 덮지 않는다.
- 투자 행동을 지시하는 문구는 쓰지 않는다(doctor 가 금지 단어를 검사한다). 면책은 화면에 있다.
- 비밀값은 `proxy/.env`·`src/config.local.ts`·GitHub Secrets 에만 둔다. 원시 종가와 CNN 원값 이력은 게시하지 않는다.

## 한계

- 지수의 60% 가 CNN 값이라, CNN 이 직접·프록시 경로 모두 5일 넘게 끊기면 지수를 보여주지 않는다(가격 부분만 남는다). 그 사이에는 마지막 CNN 값을 쓰고 화면에 그 날짜를 알린다.
- 실제 CNN 으로 검증한 기간은 2020-07 이후다. 그 이전(2020-03 코로나 폭락 등)은 계산할 수 없다.
- 백테스트의 정답지(1년 고점 대비 −10% 바닥 = 공포)는 하나의 정의다. 가격과 독립인 VIX 일치로 따로 확인했다.
