# 실질 공포·탐욕 지수(RFG) 앱인토스 미니앱 — 초반 설계

> 이 문서는 구현의 **단일 진실**이다. 여기 적힌 상수·API·계약과 다른 선택을 하려면 이 문서를 먼저 고친다.
>
> 근거 자료: RFG 프레임워크 보고서(수식 원문), 앱인토스 미니앱 교훈 문서, 설치본으로 확인한 패키지 사실
> (`@granite-js/* 1.0.43`, `@apps-in-toss/framework 2.10.10`, `react-native 0.84.0`, `react 19.2.3`).
>
> 표기: **[검증 필요]** = 이 설계를 만든 환경에서 외부 네트워크(CNN·FRED·Stooq·Yahoo)가 차단되어 확인하지 못한 항목.
> 실기기/로컬에서 원본 응답을 녹화한 뒤 픽스처로 고정한다. 그 전까지 관련 파서 테스트는 "형태 가정" 픽스처로만 돈다.

---

## 0. 한 장 요약

| 결정 | 내용 |
|---|---|
| 계산 위치 | **파이프라인(`proxy/`, 스케줄 잡)에서 계산**하고 앱은 스냅샷 JSON을 검증해 **분류·포맷·표시만** 한다. 수식은 `src/core`(순수 TS)에 한 벌만 두고 파이프라인·앱·백테스트·스토어 그림 생성기가 같은 코드를 import 한다. |
| 호스팅 | **GitHub Actions cron → 정적 JSON → Cloudflare Pages**(대안 GitHub Pages). 항상 켜진 서버 없음. 잡이 실패하면 어제 JSON이 그대로 서빙되는 "온순한 실패". |
| 데이터 소스 | 심리: CNN Fear & Greed(비공식). 종가: FRED(공식, 키) → Stooq → Yahoo 순으로 **"기대 최신 거래일까지 있는 첫 소스"** 하나를 통째로 쓴다(한 창 한 소스). |
| 롤링 백분위 | 창 W=252, **자기 포함, 평균순위, 분모 W−1**. 최대 100·최소 0·전부 동률 50. 최소 종가 311개(스냅샷 히스토리 60일까지 370개). |
| 표시와 판정 | 화면에 보이는 값과 사분면·구간 판정은 **같은 반올림 값**을 쓴다(정수 점수, FRM 소수 2자리). "70으로 보이는데 패닉 투매가 아님" 같은 모순을 없앤다. |
| 신선도 | 벽시계가 아니라 **미국 거래일 차이**로 판정. 0일 fresh, 1~3일 delayed(배지만), 3일 초과 stale(RFG·사분면·FRM 표시 차단). |
| 상수 | `src/core/constants.ts` 한 파일. `RFG_PARAMS`(계산), `THRESHOLDS`(보고서 문턱 그대로), `DATA_GATES`(보고서에 없는 운영 결정, 각 항목에 "보고서 외" 표시). 점수(순서)와 문턱(차단)을 섞지 않는다. |
| 화면 v1 | `/`(홈), `/about`(정보·면책), `/_404`(필수). 시그널·매매 행동 문구는 화면에 내지 않는다. |
| 비밀값 | `proxy/.env`, `src/config.local.ts`, Actions Secrets 에만. `predeploy` 훅이 목 모드·원격 세션 배포를 차단한다. |

---

## 1. 목표와 범위

**목표.** "심리(CNN 공포·탐욕)가 실제 지수 가격 훼손으로 얼마나 전이됐는가"를 하루 한 번 계산해 토스 안에서 한 화면으로 보여준다.

### MVP(v1)에 들어가는 것

| 영역 | 내용 |
|---|---|
| 지수 | S&P 500(SPX), 나스닥 100(NDX) 두 기준 지수. 홈 기본은 SPX, 토글로 전환 |
| 계산 | 보고서 §2~§4 전부: Fear, DD, DISP, RV, Composite, P(롤링 백분위), RFG(모델 A), FRM(모델 B), 사분면. §5.1 시그널은 **계산만**(백테스트용) |
| 홈 화면 | 오늘의 RFG 값과 구간, 심리(Fear) vs 실질(P) 사분면, FRM 해석 문장(측정값 보간), DD/DISP/RV 요약, 기준일 문구, 신선도·샘플 배지, 면책 한 줄, 60거래일 RFG 스파크라인 |
| 정보 화면 | 무엇을 재는가, 계산 요약(상수 보간), 임계값 표, 출처(비공식 명시), 갱신 주기, 면책 전문, 앱 정보 |
| 파이프라인 | 수집 → 검증 → 계산 → 원자적 게시 → `status.json`. 픽스처로 end-to-end 테스트 |
| 목 모드 | `apiBaseUrl`이 비면 픽스처 스냅샷으로 동작 + "샘플 데이터" 배지 상시 표시 |
| 운영 안전장치 | `doctor`(체크리스트 자동 검사), `check-config`(글자 수만), `predeploy`(목/원격 배포 차단), `check-routes`(라우트 동기화) |

### v1에 넣지 않는 것(기각 이유)

| 항목 | 이유 |
|---|---|
| 히스토리 화면(범위·시리즈 토글) | 홈 스파크라인으로 충분. 차트 라이브러리 검증(react-native-svg 렌더)을 M3 이후로 미룸 |
| TDS 컴포넌트 전면 도입 | 데이터 문제와 UI 의존 문제를 분리해 디버깅하기 위해 RN 기본 컴포넌트로 시작. `src/ui/primitives.tsx` 한 곳만 바꾸면 되게 설계 |
| 장중 실시간 FG | 시점이 다른 두 값(장중 FG + 전일 종가 P)의 결합은 보고서 정의에 없음 |
| 자체 심리축(FG 대체) | RFG 정의 자체가 바뀜. CNN 중단 시의 대안으로 리스크 §10에만 기록 |
| 앱 토큰 강제 | 정적 호스팅에서는 검사 주체가 없고 번들에서 추출 가능. 식별자로만 취급 |
| 다크 모드 | 프레임워크가 `TDSProvider colorPreference="light"`를 고정(설치본 확인). 배경색을 명시해 깨짐만 막는다 |

---

## 2. 시스템 아키텍처

```
┌─ 스케줄 잡: GitHub Actions cron  22:30 UTC(07:30 KST) 본실행, 01:00 UTC 재시도 ──────────────┐
│  proxy/src/collect.ts                                                                      │
│   sources/cnn.ts    ─ FG 현재값(+historical 백필)  ─┐  각 어댑터: fetch → parse → validate   │
│   sources/fred.ts   ─ SP500, NASDAQ100 (키)        ├─ → normalize → DailySeries              │
│   sources/stooq.ts  ─ ^spx, ^ndx (폴백)            │                                        │
│   sources/yahoo.ts  ─ ^GSPC, ^NDX (폴백)           ┘                                        │
│   store/  fg/history.json(관측값 누적, append-only)  prices/{SYM}.{source}.json(소스별 캐시)   │
│   src/core/*  ← 같은 수식 모듈: computeRfgSeries → buildSnapshot                              │
│   publish/    public/v1/snapshot.json (검증 통과 시에만 교체)  public/v1/status.json (항상)     │
└──────────────────────────────┬─────────────────────────────────────────────────────────────┘
                               │  wrangler pages deploy (Cloudflare Pages)   healthchecks 핑
                               ▼
              https://<apiBaseUrl>/v1/snapshot.json   Cache-Control: max-age=600, s-w-r=86400
              https://<apiBaseUrl>/v1/status.json     https://<apiBaseUrl>/static/icon.png
                               │
┌─ 앱인토스 미니앱 (Granite / RN 0.84 / React 19.2.3) ─────────────────────────────────────────┐
│  src/data/client.ts     fetch(타임아웃·재시도) → core/snapshot.parseSnapshot 런타임 검증       │
│  src/data/cache.ts      마지막 정상 스냅샷·선택 지수 (native-modules Storage, 설치본 확인)      │
│  src/core/classify      반올림 값으로 사분면·구간·FRM 해석   src/core/freshness  거래일 기준     │
│  src/text/*             포맷·문구(순수 TS)  ─┐                                               │
│  src/pages/index.tsx    홈                   ├─ scripts(store-shots)가 같은 모듈을 import       │
│  src/pages/about.tsx    정보·면책             ┘                                               │
│  apiBaseUrl 비어 있음 → src/data/mock.ts (픽스처) + "샘플 데이터" 배지                          │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 계산 위치 — 파이프라인인 이유

| 기준 | 앱에서 계산 | **파이프라인에서 계산(채택)** |
|---|---|---|
| 입력 크기 | P 하나에 종가 311개, 스파크라인까지 370개를 폰이 매번 받음 | 폰은 결과 스냅샷(수 KB)만 받음 |
| 히스토리 축적 | 폰별 저장은 히스토리가 되지 않음 | FG 관측값을 매일 누적해 CNN 1년 제약을 벗어남 |
| 시간대 | Hermes `Intl` 지원 범위 불확실 | ET→UTC 변환을 잡에서 끝내고 앱은 UTC+9 산술만 |
| 동일 숫자 | 앱 버전마다 다를 수 있음 | 모든 사용자·스토어 그림이 같은 스냅샷 |
| 라이선스 | 원시 시계열을 폰에 재배포 | 파생값만 공개(§3.6) |
| 소스 장애 | 폰에서 직접 치면 차단 시 앱이 통째로 죽음 | 잡 실패 시 어제 스냅샷 유지 |

앱도 `src/core`를 import 한다: `classify`(상수 단일 출처), `freshness`, `parseSnapshot`, 목 모드의 픽스처 생성. **값은 다시 계산하지 않는다.**

### 2.2 호스팅 — 정적 JSON인 이유

| | 항상 켜진 서버 | **스케줄 잡 → 정적 JSON(채택)** | 서버리스 cron+KV |
|---|---|---|---|
| 월 비용 | 5~7달러 | 0 | 0 |
| 실패 시 사용자가 보는 것 | 아예 못 받음 | **어제 JSON + 지연 배지** | KV 옛값 |
| 키 보관 | 서버 env | Actions Secrets | Worker secrets |
| 운영 부담 | 패치·모니터 | 실패 메일 + 데드맨 핑 | 낮음 |

데이터는 하루 한 번만 바뀐다. 서버가 있을 이유가 없다. Node 서버(`proxy/src/serve.ts`)는 **로컬 개발용 정적 서빙**으로만 둔다.

---

## 3. 데이터 소스와 계약

### 3.1 소스 표

| 데이터 | 소스 | 공식 | 키 | 알려진 형태 | 우선순위 |
|---|---|---|---|---|---|
| FG 현재값·약 1년 히스토리 | CNN `https://production.dataviz.cnn.io/index/fearandgreed/graphdata` | **비공식** | 없음. 브라우저 User-Agent 필요 **[검증 필요]** | `fear_and_greed: {score, rating, timestamp?, previous_close?...}`, `fear_and_greed_historical.data: [{x: epoch ms, y, rating}]` **[검증 필요]** | 1 |
| FG | 자기 저장소 `fg/history.json` | — | — | CNN 실패 시 마지막 관측값(신선도 게이트 안에서만) | 폴백 |
| SPX/NDX 종가 | FRED `series/observations?series_id=SP500`(`NASDAQ100`), `file_type=json` | 공식 | `FRED_API_KEY` | `observations: [{date, value}]`, 휴장일 `value: "."`, 최근 10년 **[검증 필요: 전일 종가 반영 시각]** | 1 |
| 〃 | Stooq `https://stooq.com/q/d/l/?s=^spx&i=d`(`^ndx`) | 비공식 | 없음 | CSV `Date,Open,High,Low,Close,Volume`; 데이터 없으면 200 + `No data` **[검증 필요]** | 2 |
| 〃 | Yahoo `v8/finance/chart/^GSPC?range=10y&interval=1d`(`^NDX`) | 비공식 | 없음 | `chart.result[0].timestamp[]`, `indicators.quote[0].close[]`(null 포함) **[검증 필요]** | 3 |

모든 어댑터는 `fetch → parse → validate → normalize` 네 단계로 나누고 `fetchImpl`·`now`를 주입받는다. 결과는 공통 타입 `DailySeries`(ET 거래일 오름차순, 중복 없음, 휴장일 행 없음).

### 3.2 종가 소스 선택 규칙 — "한 창은 한 소스"

```
expected = expectedLatestTradingDate(now)          // §3.4
for source of [fred, stooq, yahoo]:
  series = fetch+parse+validate+normalize(source)   // 실패·타임아웃 → 다음
  if series.last.date !== expected → 'date_lag' 기록, 다음
  if issues.some(fatal) → 기록, 다음
  chosen = series                                    // 이 소스의 시계열을 통째로 사용
  break
if chosen 없음 → 새 스냅샷을 만들지 않는다(이전 유지). status.result = 'partial'. 01:00 UTC 재시도.
교차검증: 성공한 소스가 2개 이상이면 겹치는 최근 20거래일 종가 상대오차 > 0.1% 시 'source-mismatch' 경고(게시는 함, about에 표시 안 함, status에만).
```

소스를 섞어 병합하지 않는다. 소스 간 지수 값 차이가 롤링 백분위 순위를 경계에서 뒤집을 수 있기 때문이다. 매 실행 전체를 다시 받는다(FRED 10년 ≈ 2,500행, 수십 KB). 소스별 캐시 `prices/{SYM}.{source}.json`은 **모든 소스가 실패했을 때** 이전 스냅샷을 유지하기 위한 것이지 계산 입력이 아니다.

### 3.3 FG_t의 정의 — 표본 시각과 우선순위

CNN은 장중에도 값을 갱신하므로 "거래일 t의 FG_t"를 정의해야 한다.

| 규칙 | 내용 |
|---|---|
| 정의 | **FG_t = 거래일 t의 미국 정규장 마감(16:00 ET) 이후 잡이 처음 관측한 CNN 현재값.** 잡은 22:30 UTC(EDT 18:30 / EST 17:30)에 돈다 |
| 기록 | `fg/history.json`에 `{date: t, value, observedAtUtc, source: 'own'}` append. **한 날짜에 한 값, 첫 관측을 유지**(불변). 같은 날짜의 다른 값이 나중에 보이면 `revision` 경고만 |
| 백필 | 첫 실행과 결측 보충에만 `fear_and_greed_historical`을 쓴다. `x`(epoch ms)를 ET 날짜로 바꾼다. `x % 86_400_000 === 0`이면 UTC 자정 기준 날짜, 아니면 ET 변환 **[검증 필요: `proxy/scripts/inspect-cnn.mjs`가 앞 3개 x를 두 해석으로 나란히 찍는다]**. `source: 'cnn-historical'` |
| 우선순위 | `own` > `cnn-historical` > `seed`(외부 CSV, v1 미사용) |
| 교차 확인 | 응답에 `timestamp`가 있으면 그 ET 날짜가 t와 다를 때 `fg-date-mismatch` 플래그 **[검증 필요]** |
| 절차 | **M2의 0번 작업** = 로컬에서 inspect 스크립트 1회 실행 → 실응답의 필드 형태만 남기고 히스토리를 30일로 잘라 픽스처로 커밋(라이선스 최소화) |

### 3.4 달력·정렬·결측 규칙

- **마스터 달력 = 종가 시계열의 날짜 집합**(ET `YYYY-MM-DD`). 주말·미국 휴장일 행은 없다.
- FG는 마스터 달력에 **as-of 조인**한다. 거래일 d의 FG = `fgDate ≤ d`인 관측 중 최신. 단 `d − fgDate > DATA_GATES.FG_MAX_STALENESS_DAYS(5 달력일)`이면 결측.
- `expectedLatestTradingDate(nowUtc)`: 뉴욕 시각으로 16:00 이전이면 전 거래일, 이후면 당일; 주말·`NYSE_HOLIDAYS` 제외. DST는 `core/calendar.ts`가 **순수 산술**(3월 둘째 일요일 ~ 11월 첫째 일요일 02:00)로 판정한다. `Intl` 미사용 → 앱(Hermes)과 잡(Node)이 같은 코드를 쓴다. 휴장일 목록은 올해+내년을 `core/calendar.ts`에 두고 `doctor`가 11월부터 내년 목록 존재를 검사한다.

| 상황 | 처리 | 화면 |
|---|---|---|
| 종가 O, FG X(5일 이내 값도 없음) | P는 계산, `fg/fear/rfg/frm = null` | "심리 데이터를 아직 못 받았어요", 사분면·FRM 미표시 |
| 종가 X, FG O(주말·휴장일 관측) | 행을 만들지 않음. 관측은 저장소에만 | 다음 거래일에 as-of로 사용 |
| FG가 이전 날짜 값(`fgStaleDays ≥ 1`) | 값 사용, `fgStaleDays` 동봉 | "심리 지수는 9/11 값" 보조 문구 |
| 종가 < 370개 | 스냅샷 생성 거부(잡 실패) | 목 모드에서만 발생 가능 |
| 잡 시각에 오늘 종가가 아직 없음 | 새 스냅샷 없음, 이전 유지 | delayed 배지(§3.5) |

### 3.5 신선도 — 거래일 기준

스냅샷에 `expectedLatestTradingDate`와 `holidays`를 실어 보낸다. 앱은 `tradingDaysBetween(closeDate, expected, holidays)`로 판정한다.

| 등급 | 조건 | 화면 |
|---|---|---|
| `fresh` | 0 거래일 | — |
| `delayed` | 1 ~ `DATA_GATES.STALE_AFTER_TRADING_DAYS`(3) | 노란 배지 "N거래일 전 값이에요 · 갱신이 늦어지고 있어요" |
| `stale` | 3 초과 | RFG·사분면·FRM을 `—`로 **차단**(문턱), DD/DISP/RV와 기준일만 표시 |
| `unknown` | 파싱 불가 | 오류 상태 |

스냅샷 자체가 오래됐을 때(기기 시각 − `generatedAtUtc` > 48h)만 앱이 `expectedLatestTradingDate`를 기기 시각으로 다시 계산한다. 그 외에는 스냅샷 값이 기기 시계보다 우선이다(기기 시계 오류 방지).

### 3.6 공개 범위(라이선스 최소화)

- 스냅샷에는 **당일 FG 1개 + 60거래일 히스토리(rfg/p/fear만)** 를 싣는다. CNN 원문 히스토리 전체를 미러링·공개하지 않는다.
- **원시 종가(`close`)는 스냅샷에 싣지 않는다.** 앱은 DD/DISP/RV 파생값만 필요하다(S&P DJI 지수값 재배포 회피).
- 출처는 정보 화면에 "비공식 경로로 수집, 참고용"으로 명시한다. 숨기지 않는다.

### 3.7 샌드박스에서 데이터 붙이기 — M4 첫 실험

미니앱이 임의 도메인으로 fetch 할 수 있는지, 평문 HTTP가 허용되는지는 **[검증 필요]** 이며 이것이 실데이터 화면의 전제다. 순서를 못 박는다.

1. 샌드박스 첫 실행은 **목 모드**(네트워크 불필요).
2. 실데이터 첫 실험은 **HTTPS 공개 URL(Cloudflare Pages)** 로 한다. `http://<맥IP>:포트`는 ATS/평문 허용 여부가 불명이라 쓰지 않는다.
3. 로컬 파이프라인 출력을 폰에서 보려면 `cloudflared tunnel --url http://localhost:8787`로 HTTPS 임시 URL을 만들어 `apiBaseUrl`에 넣는다.
4. 여기서 막히면(도메인 화이트리스트 등) 앱인토스 콘솔의 네트워크 정책 항목을 확인한다.

---

## 4. 지수 계산 사양 → 코드 매핑

파라미터는 모두 `RFG_PARAMS`에서 온다. 배열은 오래된 → 최신, `closes[t]`가 거래일 t의 종가. 창 미달 구간은 `null`.

| 보고서 수식 | 함수 (`src/core/series.ts`, `rfg.ts`) | 세부 |
|---|---|---|
| $Fear_t = 100 - FG_t$ | `fearFromFg(fg)` | 입력 범위 [0,100] 밖이면 `validateFgSeries`가 거른다 |
| $DD_t = \dfrac{Close_t - \max_{i\in[0,N-1]}Close_{t-i}}{\max_{i\in[0,N-1]}Close_{t-i}}$ | `rollingDrawdown(closes, N)` | 현재 포함 N개 창. 고점이 현재면 0. `t < N−1`이면 null. 종가 기준(§5.1의 "고가"는 쓰지 않는다 — 수식 §2.2는 종가로 정의) |
| $SMA_{M,t} = \frac{1}{M}\sum_{k=0}^{M-1}Close_{t-k}$, $DISP_t = \dfrac{Close_t - SMA_{M,t}}{SMA_{M,t}}$ | `rollingSma(closes, M)`, `rollingDisparity(closes, M)` | |
| $r_t = \ln(Close_t/Close_{t-1})$, $RV_t = \sqrt{252}\sqrt{\frac{1}{K-1}\sum_{j=0}^{K-1}(r_{t-j}-\bar r)^2}$ | `computeLogReturns(closes)`, `rollingRealizedVol(closes, K, ANNUALIZATION_DAYS)` | **표본표준편차(K−1), 평균 차감.** 수익률 K개 → 종가 K+1개 필요. `t < K`이면 null. 252는 `ANNUALIZATION_DAYS`로 창 W와 **다른 상수** |
| $Composite\_Damage_t = \alpha(-DD_t)+\beta(-DISP_t)+\gamma RV_t$ | `compositeDamage(dd, disp, rv, params)` | 하나라도 null이면 null |
| $P_t = \mathrm{PercentileRank}_W(Composite\_Damage_t)\times 100$ | `rollingPercentileRank(values, W)` | §4.1 |
| $RFG_t = w_1 FG_t + w_2(100-P_t)$ | `rfgOf(fg, p, params)` | `assertParams`: $w_1+w_2=1$, 창 ≥ 2 |
| $FRM_t = \dfrac{P_t}{Fear_t+\epsilon}$ | `frmOf(p, fear, params)` | 값은 캡하지 않는다. 표시 게이트는 §4.4 |

### 4.1 롤링 백분위 — 확정 정의

보고서는 동률·자기 포함을 정의하지 않는다. 관례가 안마다 달랐으므로 하나로 못 박고 차이를 남긴다.

| 항목 | 결정 |
|---|---|
| 창 | `composite[t−W+1 .. t]`, **자기 자신 포함**, 길이 정확히 W. 창 안에 null이 하나라도 있으면 `P_t = null`(부분 창으로 값을 만들지 않는다) |
| 순위 | $P_t = \dfrac{\#\{x<v\} + 0.5\,(\#\{x=v\}-1)}{W-1}\times 100$, v = 현재값 |
| 성질 | 동률 없을 때 창 최대 → **100**, 최소 → **0**. 창 전체 동률(횡보) → **50** |
| 동률 판정 | IEEE 정확 동치 |
| W | 252 기본. 756은 파라미터만 바꾸면 됨(종가 815개 필요) |

다른 관례와의 차이(백테스트를 파이썬으로 교차검증할 때 참고):

| 관례 | 식 | 창 최대값 | 창 최소값 | 전부 동률 |
|---|---|---|---|---|
| **채택** midrank/(W−1) | (#less + 0.5(#eq−1))/(W−1) | 100 | 0 | 50 |
| midrank/W | (#less + 0.5#eq)/W | 100(W−0.5)/W ≈ 99.8 | 50/W ≈ 0.2 | 50 |
| pandas `rank(pct=True, method='average')` | rank/W | 100 | 100/W ≈ 0.4 | 50(W+1)/W |

### 4.2 워밍업 길이

- Composite 첫 정의 인덱스 = `max(N, M, K+1) − 1` = 59
- P 첫 정의 인덱스 = 59 + (W−1) = 310 → **최소 종가 311개** = `minClosesRequired(params) = max(N, M, K+1) + W − 1`
- 스냅샷 히스토리 60거래일 → **370개** = `minClosesForSnapshot(params, HISTORY_DAYS)`. 테스트가 `DATA_GATES.MIN_CLOSES_FOR_SNAPSHOT`과의 일치를 검사한다.
- FRED 10년 ≈ 2,500개이므로 운영에서는 여유가 크다. 백테스트에서 FG 1년(≈250 거래일)과 겹치려면 ≈ 561개.

### 4.3 표시 반올림과 판정의 일치

원시 float로 판정하고 반올림 정수를 보여주면 "P 69.6 → 화면 70, 사분면은 Q1 아님"이 생긴다. 규칙:

- `roundTo(v, digits)` 한 함수만 쓴다(`Math.round(v·10^d)/10^d`).
- 점수(FG, Fear, P, RFG)는 **정수**로, FRM은 **소수 2자리**로 반올림한 값을 **표시에도, 판정에도** 쓴다. `classify()`가 내부에서 같은 반올림을 적용한다.
- 스냅샷에는 원시 값을 싣고(백테스트·재현용), 화면과 `classify`는 반올림 값을 본다.
- 테스트: 경계 ±0.5 케이스(P=69.5 → 70 → Q1 조건 충족, P=69.49 → 69 → 미충족; FRM=1.495 → 1.50 → ALIGNED, 1.505 → 1.51 → HIDDEN_CRASH).

### 4.4 상수 테이블 (`src/core/constants.ts`)

```ts
/** 계산 파라미터 — 하나 바꾸면 파이프라인·앱·백테스트·스토어 그림이 함께 바뀐다. 보고서 §2 권장값. */
export const RFG_PARAMS = {
  DD_WINDOW_N: 60, SMA_WINDOW_M: 50, RV_WINDOW_K: 20,
  ANNUALIZATION_DAYS: 252, PERCENTILE_WINDOW_W: 252,
  ALPHA_DD: 0.5, BETA_DISP: 0.3, GAMMA_RV: 0.2,
  W1_SENTIMENT: 0.4, W2_PRICE: 0.6,
  EPSILON: 1e-5,
} as const;

/** 문턱 — 보고서 §3·§4·§5.1 값 그대로. 점수가 아니라 이름을 붙이거나 막는 경계. 부등호는 주석의 방향이 유일한 진실. */
export const THRESHOLDS = {
  RFG_CAPITULATION_MAX: 20,      // RFG ≤ 20 실질적 항복
  RFG_EUPHORIA_MIN: 80,          // RFG ≥ 80 실질적 과열
  FRM_FAKE_FEAR_MAX: 0.5,        // FRM < 0.5 가짜 공포(공포 과대평가)
  FRM_HIDDEN_CRASH_MIN: 1.5,     // FRM > 1.5 안일함의 붕괴(공포 과소평가); 0.5 ≤ FRM ≤ 1.5 일치
  Q1: { FEAR_MIN: 70, P_MIN: 70 },   // 패닉 투매   Fear ≥ 70 ∧ P ≥ 70
  Q2: { FEAR_MAX: 40, P_MIN: 60 },   // 은밀한 붕괴 Fear < 40 ∧ P ≥ 60
  Q3: { FEAR_MAX: 40, P_MAX: 40 },   // 건전한 상승 Fear < 40 ∧ P < 40
  Q4: { FEAR_MIN: 60, P_MAX: 40 },   // 가짜 공포   Fear ≥ 60 ∧ P < 40
  SIGNAL_BUY: { RFG_MAX: 20, FEAR_MIN: 65, P_MAX: 35 },   // RFG ≤ 20 ∨ (Fear ≥ 65 ∧ P ≤ 35)  — v1 화면 미노출
  SIGNAL_RISK: { FRM_MIN: 1.5, P_MIN: 60 },               // FRM ≥ 1.5 ∧ P ≥ 60 (모델 B의 '>1.5'와 별개 상수)
} as const;

/** 데이터 게이트 — 보고서에 없는 운영 결정. 이 조건을 못 넘으면 값을 깎는 게 아니라 "말하지 않는다". */
export const DATA_GATES = {
  FG_MAX_STALENESS_DAYS: 5,        // 보고서 외: FG as-of 조인 허용 달력일
  FRM_MIN_FEAR: 10,                // 보고서 외: Fear < 10 이면 FRM 표시·시그널 억제(분모 발산, 극단적 탐욕에선 '공포 전이'가 무의미)
  STALE_AFTER_TRADING_DAYS: 3,     // 보고서 외: 초과 시 RFG·사분면·FRM 표시 차단
  MAX_ABS_LOG_RETURN: 0.25,        // 보고서 외: 초과 시 소스 오염 의심 → 해당 소스 거부
  MAX_CALENDAR_GAP_DAYS: 5,        // 보고서 외: 거래일 사이 달력 간격 초과 시 경고
  HISTORY_DAYS: 60,                // 보고서 외: 스냅샷 히스토리 길이(거래일)
  MIN_CLOSES: 311,                 // = minClosesRequired(RFG_PARAMS) — 테스트가 일치 검사
  MIN_CLOSES_FOR_SNAPSHOT: 370,    // = MIN_CLOSES + HISTORY_DAYS − 1 — 테스트가 일치 검사
  SNAPSHOT_SELF_CLOCK_AFTER_HOURS: 48, // 보고서 외: 스냅샷이 이보다 오래되면 앱이 기기 시각으로 기대 거래일 재계산
} as const;

/** 표시 정밀도 — 판정도 같은 정밀도로 반올림한 값을 쓴다(§4.3). */
export const DISPLAY_DIGITS = { score: 0, ratioPercent: 1, frm: 2 } as const;
```

기각한 대안: FRM 표시 캡(5×) — 보고서에 없는 숫자를 화면에 만들어 낸다. 게이트는 값을 바꾸지 않고 표시만 막는다.

### 4.5 분류 규칙 (`classify`)

입력은 §4.3 반올림 값. 사분면 조건은 서로 겹치지 않고 빈 구간(예: Fear 40~59, P 40~59)이 있으므로 다섯 번째 상태를 둔다.

| quadrant | 조건 | 라벨 |
|---|---|---|
| `Q1` | Fear ≥ 70 ∧ P ≥ 70 | 패닉 투매 |
| `Q2` | Fear < 40 ∧ P ≥ 60 | 은밀한 붕괴 |
| `Q3` | Fear < 40 ∧ P < 40 | 건전한 상승 |
| `Q4` | Fear ≥ 60 ∧ P < 40 | 가짜 공포 |
| `NEUTRAL` | 그 외 | 뚜렷한 국면 아님 |
| `UNKNOWN` | 입력 결측 | (표시 안 함) |

| rfgZone | 조건 | frmZone | 조건 |
|---|---|---|---|
| `CAPITULATION` | RFG ≤ 20 | `FAKE_FEAR` | FRM < 0.5 |
| `MID` | 20 < RFG < 80 (라벨 "중간 구간", "중립" 해석 붙이지 않음) | `ALIGNED` | 0.5 ≤ FRM ≤ 1.5 |
| `EUPHORIA` | RFG ≥ 80 | `HIDDEN_CRASH` | FRM > 1.5 |
| `UNKNOWN` | 결측 | `SUPPRESSED` / `UNKNOWN` | Fear < `FRM_MIN_FEAR` / 결측 |

`signals`(BUY/RISK)는 `THRESHOLDS.SIGNAL_*`로 계산하되 `gates.frmOk`가 false면 RISK는 false. **v1 화면에는 내지 않는다.** 화면에는 국면 서술만 있고 "매수·헤지·현금 비중" 같은 행동 지시 문구는 없다(§8 doctor가 금지 단어 검사).

---

## 5. `src/core` 공개 API (확정)

순수 TypeScript. `react`, `react-native`, `node:*` import 금지(`check-pure-modules`가 검사). 구현은 이 시그니처를 그대로 따른다.

```ts
// ── constants.ts ──────────────────────────────────────────────────────────
export const RFG_PARAMS, THRESHOLDS, DATA_GATES, DISPLAY_DIGITS;            // §4.4
export type RfgParams = { -readonly [K in keyof typeof RFG_PARAMS]: number };
export function assertParams(p: RfgParams): void;                            // w1+w2=1, 창 ≥ 2, α+β+γ>0
export function minClosesRequired(p?: RfgParams): number;                    // max(N, M, K+1) + W − 1
export function minClosesForSnapshot(p?: RfgParams, historyDays?: number): number;

// ── types.ts ──────────────────────────────────────────────────────────────
export type IsoDate = string;                                                // 'YYYY-MM-DD' (ET 거래일)
export type IndexSymbol = 'SPX' | 'NDX';
export interface PricePoint { date: IsoDate; close: number }
export interface FgPoint { date: IsoDate; value: number; observedAtUtc?: string; source: 'own' | 'cnn-historical' | 'seed' }
export interface DamageRow { date: IsoDate; close: number; dd: number | null; disp: number | null; rv: number | null; composite: number | null; p: number | null }
export interface RfgRow extends DamageRow { fg: number | null; fgDate: IsoDate | null; fgStaleDays: number | null; fear: number | null; rfg: number | null; frm: number | null }
export interface Classification {
  quadrant: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'NEUTRAL' | 'UNKNOWN';
  rfgZone: 'CAPITULATION' | 'MID' | 'EUPHORIA' | 'UNKNOWN';
  frmZone: 'FAKE_FEAR' | 'ALIGNED' | 'HIDDEN_CRASH' | 'SUPPRESSED' | 'UNKNOWN';
  signals: { buy: boolean; risk: boolean };
  gates: { fgOk: boolean; pOk: boolean; frmOk: boolean };
  rounded: { fg: number | null; fear: number | null; p: number | null; rfg: number | null; frm: number | null }; // 판정에 쓴 값 = 표시 값
}
export interface ValidationIssue { code: 'unsorted' | 'duplicate-date' | 'non-finite' | 'non-positive' | 'out-of-range' | 'jump' | 'gap' | 'too-short' | 'source-mismatch'; index?: number; date?: IsoDate; fatal: boolean; detail?: string }

// ── round.ts ──────────────────────────────────────────────────────────────
export function roundTo(v: number, digits: number): number;
export function roundForDisplay(row: Pick<RfgRow, 'fg' | 'fear' | 'p' | 'rfg' | 'frm'>): Classification['rounded'];

// ── series.ts ─────────────────────────────────────────────────────────────
export function computeLogReturns(closes: readonly number[]): (number | null)[];             // [0]은 null
export function rollingDrawdown(closes: readonly number[], n: number): (number | null)[];
export function rollingSma(closes: readonly number[], m: number): (number | null)[];
export function rollingDisparity(closes: readonly number[], m: number): (number | null)[];
export function rollingRealizedVol(closes: readonly number[], k: number, annualizationDays: number): (number | null)[];
export function rollingPercentileRank(values: readonly (number | null)[], w: number): (number | null)[]; // §4.1

// ── damage.ts ─────────────────────────────────────────────────────────────
export function compositeDamage(dd: number | null, disp: number | null, rv: number | null, p?: RfgParams): number | null;
export function computePriceDamage(prices: readonly PricePoint[], p?: RfgParams): DamageRow[];

// ── align.ts ──────────────────────────────────────────────────────────────
export interface AlignedFg { fg: number | null; fgDate: IsoDate | null; fgStaleDays: number | null }
export function alignFgToTradingDays(tradingDates: readonly IsoDate[], fg: readonly FgPoint[], maxStalenessDays: number): AlignedFg[];
export function mergeFgHistory(existing: readonly FgPoint[], incoming: readonly FgPoint[]): FgPoint[]; // 날짜 유일, own > cnn-historical > seed, 기존 값 유지

// ── rfg.ts ────────────────────────────────────────────────────────────────
export function fearFromFg(fg: number): number;
export function rfgOf(fg: number, p: number, params?: RfgParams): number;
export function frmOf(p: number, fear: number, params?: RfgParams): number;
export function computeRfgSeries(prices: readonly PricePoint[], fg: readonly FgPoint[], params?: RfgParams, gates?: typeof DATA_GATES): RfgRow[];

// ── classify.ts ───────────────────────────────────────────────────────────
export function classify(row: Pick<RfgRow, 'fg' | 'fear' | 'p' | 'rfg' | 'frm'>, thresholds?: typeof THRESHOLDS, gates?: typeof DATA_GATES): Classification;

// ── validate.ts ───────────────────────────────────────────────────────────
export function validatePriceSeries(prices: readonly PricePoint[], gates?: typeof DATA_GATES): ValidationIssue[];
export function crossCheckPriceSeries(a: readonly PricePoint[], b: readonly PricePoint[], lastNDays: number, maxRelError: number): ValidationIssue[];
export function validateFgSeries(fg: readonly FgPoint[]): ValidationIssue[];

// ── calendar.ts (Intl 미사용, 순수 산술) ────────────────────────────────────
export const NYSE_HOLIDAYS: readonly IsoDate[];                              // 올해·내년
export function etOffsetMinutes(utcMs: number): number;                      // −240(EDT) | −300(EST)
export function nyDateOf(utcMs: number): IsoDate;
export function isTradingDay(date: IsoDate, holidays?: readonly IsoDate[]): boolean;
export function tradingDaysBetween(from: IsoDate, to: IsoDate, holidays?: readonly IsoDate[]): number; // from < to 이면 양수
export function expectedLatestTradingDate(nowUtcMs: number, holidays?: readonly IsoDate[]): IsoDate;   // 16:00 ET 이전이면 전 거래일
export function closeAtUtcOf(date: IsoDate): string;                         // 'YYYY-MM-DDT20:00:00.000Z' 또는 21:00
export function diffCalendarDays(a: IsoDate, b: IsoDate): number;
export function addCalendarDays(d: IsoDate, days: number): IsoDate;

// ── freshness.ts ──────────────────────────────────────────────────────────
export type Freshness = 'fresh' | 'delayed' | 'stale' | 'unknown';
export function assessFreshness(snapshot: RfgSnapshot, symbol: IndexSymbol, nowUtcMs: number, gates?: typeof DATA_GATES): { level: Freshness; tradingDaysBehind: number; expected: IsoDate }; // 지수별 closeDate 로 판정

// ── snapshot.ts ───────────────────────────────────────────────────────────
export interface MarketBlock {
  closeDate: IsoDate; closeAtUtc: string;
  latest: Omit<RfgRow, 'close'>;                                             // 원시 종가는 싣지 않는다
  history: Array<{ date: IsoDate; rfg: number | null; p: number | null; fear: number | null }>; // 최근 HISTORY_DAYS
  priceSource: 'fred' | 'stooq' | 'yahoo';
  flags: Array<'fg-stale' | 'fg-missing' | 'gap-warning' | 'source-mismatch' | 'fg-date-mismatch'>;
}
export interface RfgSnapshot {
  schemaVersion: 1;
  generatedAtUtc: string;
  expectedLatestTradingDate: IsoDate;
  holidays: readonly IsoDate[];
  params: RfgParams;
  disclaimerVersion: number;
  fgSource: 'cnn' | 'own-history';
  markets: Record<IndexSymbol, MarketBlock>;
}
export interface BuildSnapshotInput {
  rows: Record<IndexSymbol, readonly RfgRow[]>;
  priceSource: Record<IndexSymbol, MarketBlock['priceSource']>;
  flags: Record<IndexSymbol, MarketBlock['flags']>;
  generatedAtUtc: string; expectedLatestTradingDate: IsoDate; holidays: readonly IsoDate[];
  fgSource: RfgSnapshot['fgSource']; disclaimerVersion: number;
  params?: RfgParams; historyDays?: number;
}
export function buildSnapshot(input: BuildSnapshotInput): RfgSnapshot;                     // closeAtUtc 는 closeAtUtcOf(closeDate)
export type SchemaError = { path: string; code: 'missing' | 'type' | 'range' | 'version' };
export function parseSnapshot(input: unknown): { ok: true; value: RfgSnapshot } | { ok: false; error: SchemaError }; // 의존성 없는 런타임 검증

// ── backtest.ts (보고서 §5.2) ──────────────────────────────────────────────
export function forwardReturns(closes: readonly number[], horizon: number): (number | null)[];      // ln(close[t+h]/close[t])
export interface BacktestReport {
  horizons: number[];
  strategies: Record<'rfg-buy' | 'cnn-only-fear65' | 'q4-bear-trap' | 'q1-capitulation' | 'risk', {
    count: number; meanReturn: number[]; medianReturn: number[]; winRate: number[]; maxUnderwater: number; signalsPerYear: number;
  }>;
  fgCoverage: { from: IsoDate | null; to: IsoDate | null; rowsWithFg: number };          // FG 소스 구간은 파이프라인 status 가 보고
}
export function evaluateSignals(rows: readonly RfgRow[], opts?: { horizons?: number[]; thresholds?: typeof THRESHOLDS; tradingDaysPerYear?: number }): BacktestReport;
```

`src/text`(순수 TS, RN 의존 없음 — 스토어 그림 스크립트가 그대로 import):

```ts
// ── src/text/format.ts ────────────────────────────────────────────────────
export function formatScore(v: number | null): string;                      // 63.4 → '63', null → '—'  (DISPLAY_DIGITS.score)
export function formatPercent(ratio: number | null, opts?: { signed?: boolean }): string; // −0.0431 → '−4.3%' (U+2212)
export function formatFrm(v: number | null): string;                        // 0.53 → '0.53배'
export function formatKst(utcIso: string): { date: IsoDate; time: string }; // UTC+9 고정 산술
export function formatTradingDate(d: IsoDate, style?: 'long' | 'short'): string; // '9월 11일(목)' | '9/11'
export function formatBasisLine(m: MarketBlock): string;                    // '미국 9/11(목) 마감 기준 · 한국 9/12 05:00'
export function formatTradingDaysAgo(n: number): string;

// ── src/text/copy.ts ──────────────────────────────────────────────────────
export const DISCLAIMER: { version: number; short: string; full: string };
export const LABELS: { quadrant: Record<Classification['quadrant'], string>; rfgZone: ...; frmZone: ...; index: Record<IndexSymbol, string> };
export const COPY: {
  frmSentence(fear: string, p: string, frm: string): string;                 // 측정값 보간
  frmMeaning: Record<Classification['frmZone'], string>;                     // 상태 서술만
  freshness(level: Freshness, tradingDaysBehind: number): string;
  gaugeLegend(): string;                                                     // THRESHOLDS 보간: '20 이하 실질적 항복 · 80 이상 실질적 과열'
  describeIndicators(): { dd: string; disp: string; rv: string; p: string }; // RFG_PARAMS 보간
  thresholdTable(): Array<{ key: string; rule: string }>;
  mockBadge: string; sourcesNotice: string; /* ... */
};

// ── src/text/viewmodel.ts ─────────────────────────────────────────────────
export interface HomeViewModel { /* 화면이 그리는 모든 문자열·수치·상태 */ }
export function selectHomeViewModel(snapshot: RfgSnapshot | null, index: IndexSymbol, nowUtcMs: number, state: DataState): HomeViewModel;
```

---

## 6. 앱 구조

### 6.1 파일 트리

```
index.ts, require.context.ts, granite.config.ts, babel.config.js, react-native.config.js   (있음)
pages/                       라우터가 스캔. 한 줄 재수출만:  export { Route } from 'pages/<name>';
  _404.tsx  index.tsx  about.tsx
src/
  _app.tsx                   AppsInToss.registerApp(AppContainer, { context })  (있음)
  router.gen.ts              수동 유지 — 라우트 추가 시 import 1줄 + Input/Screen 각 1줄
  config.ts / config.local.ts(gitignore) / config.local.example.ts            (있음)
  core/                      §5 (순수 TS)
  text/                      format.ts, copy.ts, viewmodel.ts (순수 TS)
  data/
    contract.ts              re-export RfgSnapshot 등 (파이프라인과 공유)
    client.ts                RfgClient 인터페이스, createClient(config)
    httpClient.ts            fetch + AbortController 타임아웃 + 재시도 + 스키마 검증
    mockClient.ts            픽스처 시나리오(normal/capitulation/bear-trap/complacency/euphoria/delayed/stale/fg-missing)
    cache.ts                 native-modules Storage: 마지막 정상 스냅샷, 선택 지수
    policy.ts                RETRY, REFRESH 상수
    useRfgSnapshot.ts        상태 머신 훅
    fixtures/                scripts(build-fixtures)가 core로 생성한 JSON — 손으로 편집 금지
  ui/
    primitives.tsx           Txt/Pressable 래퍼 — TDS로 바꿀 때 유일하게 건드리는 곳
    Screen.tsx Gauge.tsx AxisBars.tsx QuadrantBadge.tsx FrmCard.tsx BasisLine.tsx FreshnessBadge.tsx
    IndexSwitch.tsx Sparkline.tsx DetailRow.tsx ErrorState.tsx LoadingState.tsx Disclaimer.tsx
    theme.ts                 색·간격·타이포 토큰 (라이트 고정)
  pages/
    _404.tsx  index.tsx(홈)  about.tsx
scripts/                     Node ESM(.mjs)만 — 앱 tsconfig에 잡히지 않게 TS를 두지 않는다
  ensure-local-config.mjs check-config.mjs doctor.mjs (있음)
  check-routes.mjs check-pure-modules.mjs predeploy.mjs
proxy/                       §7 (별도 패키지; 백테스트·픽스처 생성·스토어 그림 스크립트도 여기)
docs/DESIGN.md, docs/runbook.md
```

### 6.2 라우팅 규칙 (설치본으로 확인)

- `appsInToss()`는 `@granite-js/plugin-router`의 `router()`를 포함하지 않는다. plugin-router는 `_`로 시작하는 페이지를 제외하므로 자동 생성하면 `'/_404'`가 빠지고, `createRoute(path: keyof RegisterScreenInput)` 타입 때문에 `createRoute('/_404')`가 `tsc`에서 깨진다.
- 따라서 **`src/router.gen.ts`는 수동 유지**한다. 라우트 추가 시 세 곳을 함께 고친다: `pages/<name>.tsx`(재수출), `src/pages/<name>.tsx`(`createRoute`), `src/router.gen.ts`.
- `scripts/check-routes.mjs`가 (a) `pages/*.tsx`가 동명 `src/pages` 파일을 재수출하는지, (b) `src/pages/*.tsx`의 `createRoute('<path>')` 집합 = `router.gen.ts` 키 집합(`/_404` 포함)인지 검사한다. `doctor`에 연결.
- `src/pages/_404.tsx`는 절대 지우지 않는다(라우터가 첫 렌더에서 throw → 흰 화면; ErrorBoundary로 못 잡는다).

### 6.3 화면

**홈 `/`** (세로 스크롤 한 화면, 상단 내비게이션은 호스트가 그림)

```
┌────────────────────────────────────────────┐
│ 실질 공포탐욕지수              [S&P500 | 나스닥100]  │ IndexSwitch
│ 미국 9/11(목) 마감 기준 · 한국 9/12 05:00   [배지]  │ BasisLine + FreshnessBadge/샘플 배지
├────────────────────────────────────────────┤
│                 63                             │ Gauge: formatScore(rfg), 눈금 0·20·80·100(THRESHOLDS)
│        실질적 항복 ◀────●────▶ 실질적 과열          │ rfgZone 라벨 "중간 구간"
├────────────────────────────────────────────┤
│ 심리 공포도 59  │ 실질 훼손도 31  │ 전이 0.53배      │ AxisBars(Fear, P) + FRM
├────────────────────────────────────────────┤
│ 심리 vs 실질:  뚜렷한 국면 아님                     │ QuadrantBadge (Q1~Q4/NEUTRAL, 경계선 값은 THRESHOLDS)
│ 심리 공포도 59, 실질 훼손도 31 → 전이 0.53배.        │ FrmCard: 측정값 보간 문장 + frmZone 서술
│ 심리와 지수 낙폭이 대체로 같은 보폭이에요.             │
├────────────────────────────────────────────┤
│ 60일 고점 대비 −4.3% · 50일선 대비 −1.2% · 20일 변동성 18.4% │ DetailRow (문구의 60/50/20은 RFG_PARAMS 보간)
│ ▁▂▃▅▆▅▃▂▃▅  최근 60거래일                          │ Sparkline(rfg history)
├────────────────────────────────────────────┤
│ [계산 방식과 출처 ›]                                │ → /about
│ 이 지수는 투자 조언이 아니에요.                       │ DISCLAIMER.short
└────────────────────────────────────────────┘
```

**정보 `/about`**: 무엇을 재는가 → 계산 요약(`COPY.describeIndicators`, 상수 보간) → 임계값 표(`COPY.thresholdTable`) → 데이터 출처(비공식 명시, 갱신 주기, 기준 시각 정의) → 면책 전문(`DISCLAIMER.full`) → 앱 정보(`env.getAppName()`, `env.getDeploymentId()`). 스냅샷 `params`가 앱 `RFG_PARAMS`와 다르면 "서버 기준 값" 경고 줄. 정보 화면을 5회 탭하면 `status`용 플래그 원문 표시(개발용, 값 노출 없음).

**홈 상태표**

| 상태 | 조건 | 화면 |
|---|---|---|
| `mock` | `config.isMock` | 전체 UI + 회색 배지 "샘플 데이터"(항상) |
| `loading` | 첫 요청 중, 캐시 없음 | 스켈레톤 |
| `ready` | 파싱 OK, `fresh` | 전체 |
| `delayed` | 1~3 거래일 뒤 | 전체 + 노란 배지(문구는 `COPY.freshness`) |
| `stale` | 3 거래일 초과 | RFG·사분면·FRM `—`, DD/DISP/RV·기준일만 + 안내 |
| `fg-missing` | `latest.fg === null` | 게이지·사분면·FRM 대신 "심리 데이터를 아직 못 받았어요", P 축만 |
| `error+cache` | 요청 실패, 캐시 있음 | 이전 스냅샷 표시 + 빨간 배너 "새 값을 못 받았어요 · 마지막 {거래일} 값" + [다시 시도] |
| `error` | 요청 실패, 캐시 없음 | 오류 화면 + [다시 시도]. **목 데이터로 대체하지 않는다** |
| `offline` | `getNetworkStatus() === 'OFFLINE'` | error 규칙과 같되 "인터넷 연결을 확인해 주세요" |
| `outdated` | `schemaVersion` 불일치 | "앱 업데이트가 필요해요"(표시 차단) |

### 6.4 데이터 계층

```ts
export interface RfgClient { readonly kind: 'http' | 'mock'; getSnapshot(opts?: { signal?: AbortSignal }): Promise<RfgSnapshot> }
export function createClient(config: AppConfig): RfgClient;                  // isMock ? mock : http
export function createHttpClient(cfg: { baseUrl: string; timeoutMs: number; fetchImpl?: typeof fetch }): RfgClient;
export function createMockClient(opts?: { scenario?: MockScenario; delayMs?: number; failTimes?: number }): RfgClient;

export type DataState =
  | { status: 'loading'; cached?: RfgSnapshot }
  | { status: 'success'; data: RfgSnapshot; fromCache: boolean }
  | { status: 'error'; error: { code: 'timeout' | 'network' | 'http' | 'schema' | 'offline' | 'outdated'; message: string }; cached?: RfgSnapshot };
export function useRfgSnapshot(): DataState & { refresh: () => void; isRefreshing: boolean };

export const RETRY = { attempts: 2, backoffMs: [800, 2400] } as const;      // 총 3회. 네트워크·타임아웃·5xx만. 4xx는 즉시 실패
export const REFRESH = { minIntervalMs: 10 * 60_000 } as const;            // useVisibility 복귀 시 경과했으면 자동 갱신
```

흐름: 마운트 → `cache.read()` 있으면 즉시 `success(fromCache)`로 그림 → 요청 → 성공 시 캐시 갱신 → 실패 시 `error+cached`. 스냅샷 하나에 두 지수가 있어 지수 토글은 요청 없이 즉시. 마지막 선택 지수는 `Storage`에 저장.

### 6.5 원칙

- **JSX에 사용자 노출 숫자 리터럴을 쓰지 않는다.** 문구는 `src/text/copy.ts`가 상수를 보간해 만든다. `check-pure-modules.mjs`가 `src/pages`·`src/ui`의 문자열 리터럴에서 `20|80|40|60|70|0.5|1.5`를 찾으면 실패(`StyleSheet.create` 블록과 `// numbers-ok` 표시 줄은 허용).
- `src/core`·`src/text`에 `react`/`react-native`/`node:` import 금지(같은 스크립트가 검사).
- `selectHomeViewModel`은 홈 페이지와 스토어 그림 스크립트가 **같이** 호출한다. 그림의 숫자·문구가 화면과 어긋날 수 없다.
- 시각적 요소: 게이지·축 막대·스파크라인은 `@granite-js/native/react-native-svg`(타입 제공 확인)로 그리되 **M3 첫 샌드박스에서 렌더 확인**, 실패 시 `View` 기반 폴백 prop.
- 접근성: 게이지·사분면에 문장형 `accessibilityLabel`("실질 공포탐욕지수 63, 중간 구간"), 색만으로 상태를 전하지 않고 라벨 병기, 터치 44pt.
- `registerApp`이 이미 `TDSProvider(light, primary=brand)`로 감싼다. Provider를 추가하지 않는다. 배경색을 명시한다.

---

## 7. 파이프라인 구조 (`proxy/`)

이름은 교훈 문서·`.gitignore`·`check-config`와 맞추기 위해 `proxy/`를 유지한다(실체는 수집·계산·게시 잡).

```
proxy/
  package.json          Node 22. 런타임 의존 없음(내장 fetch/fs). dev: typescript, tsx, @types/node
  tsconfig.json         include: src, scripts, test, ../src/core, ../src/text  (상대경로 import)
  .env.example          FRED_API_KEY=  CLOUDFLARE_API_TOKEN=  CLOUDFLARE_ACCOUNT_ID=  PAGES_PROJECT=rfg-data  HEALTHCHECKS_PING_URL=  CNN_USER_AGENT=  PORT=8787
  src/
    collect.ts          collect({ outDir, now?, fetchImpl?, env }) → { result: 'ok'|'partial'|'failed', status }
    sources/{cnn,fred,stooq,yahoo}.ts   fetch → parse → validate → normalize
    sources/price.ts    §3.2 선택 규칙 + 교차검증
    store/FileStore.ts  fg/history.json (append-only), prices/{SYM}.{source}.json, raw/{date}/*.json (30일 보관)
    publish.ts          임시 파일 → rename 원자적 쓰기; snapshot은 parseSnapshot 자기검증 통과 시에만 교체; status.json은 항상
    serve.ts            로컬 개발용 정적 서버(public/) — 배포에는 쓰지 않음
    log.ts              URL 로그 시 api_key= 뒤 마스킹(테스트로 고정)
  scripts/
    inspect-cnn.mjs / inspect-fred.mjs / inspect-stooq.mjs   원본 응답 형태만 출력(값·키 미출력) → 픽스처 저장 도우미
    build-fixtures.ts   합성 종가·FG(결정적 시드) → core.computeRfgSeries → src/data/fixtures/*.json + proxy/test/golden/snapshot.json
    backtest.ts         §5.2 리포트 → docs/backtest/{date}.md (+json)
    store-shots.ts      Playwright로 HTML 복제 레이아웃 렌더(636×1048 ×3, 1504×741 ×1). 값·문구는 src/text·core import
  test/                 node --import tsx --test
    fixtures/           cnn.graphdata.sample.json(형태 가정, 30일), fred.sp500.sample.json, stooq.spx.sample.csv, yahoo.gspc.sample.json
    golden/             snapshot.json (계약 테스트: 앱 parseSnapshot이 그대로 통과해야 함)
  public/               게시 산출물(gitignore)
.github/workflows/
  collect.yml           cron '30 22 * * *' + '0 1 * * *' (매일; 주말은 unchanged로 정상 종료). secrets: FRED_API_KEY, CLOUDFLARE_*, HEALTHCHECKS_PING_URL
  ci.yml                doctor → typecheck → jest → proxy test
```

### 7.1 게시 계약

| 경로 | 내용 | 캐시 |
|---|---|---|
| `GET /v1/snapshot.json` | `RfgSnapshot`(§5). 두 지수 포함, 요청 1회 | `public, max-age=600, stale-while-revalidate=86400` |
| `GET /v1/status.json` | 아래 | `max-age=60` |
| `GET /static/icon.png` | 앱 아이콘 512×512 (`brand.icon` URL) | 길게 |

`status.json`:

```json
{ "runAtUtc": "2026-09-12T22:31:04Z", "runId": "gha-1234", "result": "ok",
  "sources": [ { "id": "cnn", "status": "ok", "okAtUtc": "...", "asOf": "2026-09-11", "error": null },
               { "id": "fred", "status": "date_lag", "okAtUtc": "...", "asOf": "2026-09-10", "error": "date_lag" },
               { "id": "stooq", "status": "ok", "asOf": "2026-09-11", "error": null } ],
  "published": { "generatedAtUtc": "...", "unchanged": false },
  "checks": { "spxCrossCheckRelErr": 0.0002, "closesAvailable": { "SPX": 2503, "NDX": 2503 } } }
```

`snapshot.json` 예시(발췌):

```json
{ "schemaVersion": 1, "generatedAtUtc": "2026-09-12T22:31:04Z", "expectedLatestTradingDate": "2026-09-11",
  "holidays": ["2026-11-26", "2026-12-25", "2027-01-01"], "params": { "DD_WINDOW_N": 60, "...": 0 }, "disclaimerVersion": 1, "fgSource": "cnn",
  "markets": { "SPX": { "closeDate": "2026-09-11", "closeAtUtc": "2026-09-11T20:00:00.000Z", "priceSource": "stooq", "flags": [],
                        "latest": { "date": "2026-09-11", "dd": -0.0431, "disp": -0.0120, "rv": 0.184, "composite": 0.0619, "p": 31.4,
                                    "fg": 41, "fgDate": "2026-09-11", "fgStaleDays": 0, "fear": 59, "rfg": 57.6, "frm": 0.532 },
                        "history": [ { "date": "2026-06-18", "rfg": 61.2, "p": 28.0, "fear": 55 }, "..." ] },
               "NDX": { "...": 0 } } }
```

### 7.2 잡 흐름과 실패 모드

```
collect:
  1. expected = expectedLatestTradingDate(now)
  2. cnn ← fetch/parse/validate → fg 관측 append(첫 관측 유지) → 실패 시 history 마지막 값(신선도 게이트 안) → 그래도 없으면 fg=null
  3. 지수별: price.select() (§3.2) → 없으면 그 지수는 이전 스냅샷 유지, result='partial'
  4. rows = computeRfgSeries(prices, fgHistory) ; 검증: 종가 ≥ 370, 마지막 행 date == expected
  5. snapshot = buildSnapshot(...) ; parseSnapshot(snapshot).ok 아니면 게시 중단(버그)
  6. publish: 임시 파일 → rename. status.json 항상 갱신. healthchecks 핑(성공 /, 실패 /fail)
```

- 주말·휴장일: `expected`가 이전과 같으면 `unchanged: true`로 정상 종료.
- 재시도: 01:00 UTC 두 번째 실행이 같은 로직을 돈다(FRED 반영 지연 대비).
- Actions 러너 IP가 CNN 봇 방어에 걸리면 **[검증 필요]** 수집기는 `node proxy/dist/collect.js --out ./public` 한 줄이라 집 맥의 launchd에서 같은 명령을 돌리고 `wrangler pages deploy`로 올린다. 실행 위치만 바뀌고 코드는 같다.
- GitHub는 공개 레포가 60일간 비활성이면 스케줄 워크플로를 끈다 → healthchecks 데드맨 핑이 "잡이 아예 안 돈" 상황을 잡는 유일한 수단.
- 로그에 헤더·쿼리스트링을 찍지 않는다. `log.ts`가 `api_key=` 뒤를 마스킹한다(테스트).

---

## 8. 설정·비밀값·배포·샌드박스 절차

### 8.1 비밀값 위치

| 값 | 위치 | 비고 |
|---|---|---|
| `FRED_API_KEY` | `proxy/.env`(로컬), Actions Secrets(잡) | 없으면 FRED 어댑터 `disabled`, Stooq부터 |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | 〃 | Pages 배포 전용 최소 권한 |
| `HEALTHCHECKS_PING_URL` | 〃 | 유출돼도 핑만 가능 |
| `apiBaseUrl` | `src/config.local.ts` | 비밀은 아니지만 목/실데이터 분기 근거라 같은 파일 |
| `appToken` | `src/config.local.ts` | v1 미사용. 번들에 들어가므로 비밀 아님 |
| 앱인토스 배포 키 | `~/.ait/credentials` | 프로필에 옛 키가 있으면 `--api-key`가 조용히 무시됨 → 교체 시 `npx ait token remove` 먼저 |

예시 파일(`proxy/.env.example`, `src/config.local.example.ts`)만 커밋. `postinstall`이 로컬 파일을 만든다(있음). `npm run check-config`는 글자 수만 찍는다(있음). 키 입력은 가려진 입력(`proxy/scripts/set-secret.mjs`)으로. 채팅·스크린샷에 값 금지.

### 8.2 doctor에 추가할 검사

| 구분 | 검사 | 막는 사고 |
|---|---|---|
| 라우트 | `check-routes`: pages ↔ src/pages ↔ router.gen.ts 동기화, `/_404` 포함 | 타입 오류·흰 화면 |
| 계층 | `check-pure-modules`: `src/core`·`src/text`에 react/react-native/node import 없음; `src/pages`·`src/ui` 문자열에 문턱 숫자 리터럴 없음 | 상수 이중화 |
| 설정 | `brand.icon`이 `https://`로 시작(비어 있으면 **경고**, `predeploy`에서는 **실패**) | 스토어 아이콘 안 뜸 |
| 설정 | `permissions: []`이고 소스에 `useGeolocation`/`Contacts`/`Clipboard`/광고(`InlineAd`, `loadFullScreenAd`) import 없음 | 심사 선언 불일치 |
| 문구 | `src/pages`·`src/ui`·`src/text`에 금지 단어(매수, 매도, 헤지, 수익 실현, 추천, 청산) 없음 | 투자 권유 오인 |
| 문구 | `DISCLAIMER.version` == 스냅샷 골든의 `disclaimerVersion` | 앱·스토어 텍스트 불일치 |
| 데이터 | `NYSE_HOLIDAYS`에 내년 목록 존재(11월부터) | 신선도 오판 |
| 데이터 | `DATA_GATES.MIN_CLOSES == minClosesRequired()`, `MIN_CLOSES_FOR_SNAPSHOT` 일치 | 상수 표류 |
| 계약 | `proxy/test/golden/snapshot.json`이 `parseSnapshot` 통과, `params` == `RFG_PARAMS` | 계약 깨짐 |
| 빌드 | `.ait` 안 두 런타임 번들 해시가 서로 다름 | `target` 오염 |

### 8.3 `predeploy` (npm `predeploy` 훅, `ait deploy` 전에 자동 실행)

1. `doctor` 통과. 2. `apiBaseUrl`이 `https://`이고 `/`로 끝나지 않음(목 모드 배포 차단). 3. `CI`, `CLAUDE_CODE`, `CODESPACES`, `SSH_CONNECTION` 중 하나라도 있으면 `ALLOW_REMOTE_DEPLOY=1` 없이는 실패(교훈 §6 "원격 세션에서 배포하면 목 앱이 올라간다"). 4. dirty tree면 경고. 5. `~/.ait/credentials` 프로필이 2개 이상이면 경고.

### 8.4 릴리즈 절차 (`docs/runbook.md`로 옮겨 유지)

```
1. 키 있는 맥에서 git pull, npm ci
2. npm run doctor
3. npm run typecheck && npm test && (cd proxy && npm test)
4. npm run check-config            → 앱: 실데이터(프록시) / 프록시: 키 채워짐
5. curl -s $apiBaseUrl/v1/status.json 로 result ok 확인, 앱 verify-data 스크립트로 parseSnapshot + fresh|delayed
6. (상수 바꿨으면) cd proxy && npm run store-shots
7. npm run dev → 샌드박스(같은 Wi-Fi)에서 intoss://real-fear-greed-index, DevTools(j) 콘솔 오류 0
8. package.json version bump
9. npm run build → .ait 생성, 두 런타임 번들 해시 다름
10. npm run deploy (predeploy 통과) → 콘솔 확인 → 실제 토스 앱(Android ≥ 5.220.0 / iOS ≥ 5.221.0)
11. 스토어: 아이콘 URL, 세로 636×1048 ≥3장, 가로 1504×741 ≥1장, 약관 체크박스 2개
```

복사용 명령 블록에 `#` 주석을 넣지 않는다(zsh `interactive_comments`).

### 8.5 샌드박스 체크리스트(교훈 §0·§5)

막히면 **샌드박스 콘솔부터** 본다. 번들·버전·설정은 그 다음이다.
1. `npm run doctor` 2. `npm run dev` 3. 같은 Wi-Fi, `ifconfig | grep "inet "` 4. 샌드박스 앱 로컬 네트워크 허용 → 서버 주소 5. `intoss://real-fear-greed-index` 6. dev 서버 창에서 `j` → 콘솔. `EADDRINUSE`면 원래 창에서 `Ctrl+C`.

---

## 9. 테스트 전략

### 9.1 core 손계산 픽스처 (골든, 재검산 완료)

파라미터를 작게 주입(N=3, M=3, K=3, W=4, 가중치는 기본값)해 손으로 검산 가능하게 한다.
종가 `[100,102,101,105,103,99,104,106,106,110]`, FG `[70,72,68,75,60,40,55,80,82,90]`.

| i | close | r | DD | DISP | RV | COMP | P | FG | Fear | RFG | FRM |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 100 | null | null | null | null | null | null | 70 | 30 | null | null |
| 1 | 102 | 0.019803 | null | null | null | null | null | 72 | 28 | null | null |
| 2 | 101 | −0.009852 | −0.009804 | 0 | null | null | null | 68 | 32 | null | null |
| 3 | 105 | 0.038840 | 0 | 0.022727 | 0.389533 | 0.071088 | null | 75 | 25 | null | null |
| 4 | 103 | −0.019231 | −0.019048 | 0 | 0.494882 | 0.108500 | null | 60 | 40 | null | null |
| 5 | 99 | −0.039609 | −0.057143 | −0.032573 | 0.646184 | 0.167580 | null | 40 | 60 | null | null |
| 6 | 104 | 0.049271 | 0 | 0.019608 | 0.739132 | 0.141944 | 66.667 | 55 | 45 | 42.000 | 1.4815 |
| 7 | 106 | 0.019048 | 0 | 0.029126 | 0.717398 | 0.134742 | 33.333 | 80 | 20 | 72.000 | 1.6667 |
| 8 | 106 | 0 | 0 | 0.006329 | 0.394415 | 0.076984 | 0.000 | 82 | 18 | 92.800 | 0.0000 |
| 9 | 110 | 0.037041 | 0 | 0.024845 | 0.294046 | 0.051356 | 0.000 | 90 | 10 | 96.000 | 0.0000 |

검산 예 i=3: SMA=(102+101+105)/3=102.667 → DISP=(105−102.667)/102.667=0.022727. r 창 {0.019803, −0.009852, 0.038840}, 평균 0.016264, 표본분산 6.0215e−4 → sd 0.024538 × √252 = 0.38953. i=6: 창 COMP {0.0711, 0.1085, 0.1676, 0.1419}, 현재보다 작은 값 2개, 동률 1(자기) → (2+0)/3 = 66.667. RFG = 0.4×55 + 0.6×(100−66.667) = 42.0. FRM = 66.667/45.00001 = 1.4815. 첫 COMP 인덱스 3, 첫 P 인덱스 6, `minClosesRequired` = 7.

### 9.2 테스트 목록

| 파일 | 검사 |
|---|---|
| `core/__tests__/series.test.ts` | 위 표 r/DD/DISP/RV(1e−6); 창 미달 null; `rollingPercentileRank`: 단조 증가 → 100, 감소 → 0, 전부 동률 → 50, 창 안 null → null, midrank/(W−1) 정확식 |
| `rfg.test.ts` | 표의 P/RFG/FRM; `assertParams` 위반 throw; `minClosesRequired()==311`, `minClosesForSnapshot()==370` == `DATA_GATES` |
| `align.test.ts` | 토요일 관측 FG가 월요일 행에 붙고 `fgStaleDays=2`; 6일 공백 → null; 휴장일 FG는 행 없음; `mergeFgHistory` 우선순위·기존 값 유지 |
| `classify.test.ts` | 사분면 경계 8개(±0.5 반올림 케이스 포함), NEUTRAL, rfgZone 20/80 경계, frmZone 0.5/1.5 경계(1.495/1.505), `Fear<10` → SUPPRESSED·risk=false, 결측 → UNKNOWN·시그널 false, BUY 두 조건 각각, RISK |
| `round.test.ts` | `roundTo` 반올림 규칙, 음수, `roundForDisplay` null 전파 |
| `validate.test.ts` | 역순, 중복, `.`값, 26% 갭, 12일 공백, 교차검증 0.1% |
| `calendar.test.ts` | DST 경계(3월 둘째 일요일·11월 첫째 일요일 전후 epoch → ET 날짜/오프셋 고정값), `expectedLatestTradingDate`(16:00 ET 전후, 주말, 휴장일), `closeAtUtcOf`, `tradingDaysBetween` |
| `freshness.test.ts` | 금요일 마감 스냅샷을 월요일 아침에 봐도 fresh; 3거래일 초과 stale; 스냅샷 48h 초과 시 기기 시각 재계산 |
| `snapshot.test.ts` | `buildSnapshot` 골든 비교(원시 close 미포함, history 60행); `parseSnapshot` 필드 누락/타입/범위/버전 각각 실패 코드 |
| `backtest.test.ts` | `forwardReturns` 끝 null; 픽스처로 `evaluateSignals` 골든 |
| `text/__tests__/*.test.ts` | 포맷 테이블(반올림·U+2212·null), `formatKst('2026-09-11T20:00:00Z')→9/12 05:00`, `'2026-01-16T21:00:00Z'→06:00`; `COPY.*`가 THRESHOLDS/RFG_PARAMS 값을 포함; `selectHomeViewModel` 상태표 10행 |
| `data/__tests__/*.test.ts` | 가짜 `fetchImpl`: 타임아웃→재시도 2회→실패, 5xx 재시도·4xx 즉시, 스키마 실패 → `schema`, 캐시 폴백; 목 클라이언트 시나리오 |
| `ui`·페이지 | `@testing-library/react-native`: 홈 상태표 각 행 렌더·문구 존재, a11y 라벨이 `formatScore`와 일치, 지수 토글. SVG는 `jest.setup.ts`에서 목 |
| `proxy/test/*.test.ts` | 어댑터 파서(형태 가정 픽스처 + 잘못된 픽스처: 필드 누락·빈 배열·문자열 숫자 → 명확한 실패), `price.select` 규칙, `publish` 원자성·검증 실패 시 미교체, 로그 마스킹, e2e 픽스처 → 골든 스냅샷 diff |
| 계약 | 골든 스냅샷을 앱 `parseSnapshot`으로 검증(같은 파일을 양쪽 테스트가 읽음) |
| 구조 | `doctor`, `check-routes`, `check-pure-modules` — CI 첫 단계 |

실응답 픽스처가 없는 동안 어댑터 파서 테스트는 "형태 가정" 픽스처로 돌고, 파일 머리에 **[검증 필요]** 주석을 둔다. 녹화 후 픽스처만 교체한다.

---

## 10. 리스크와 미해결 질문

### 10.1 리스크

| 리스크 | 확률 | 영향 | 대응 |
|---|---|---|---|
| CNN 비공식 엔드포인트 차단·형태 변경 | 높음 | 심리축 정지 | 스키마·범위·날짜 검증 → 마지막 관측값(게이트 안) → fg-missing 상태. 자기 관측 누적으로 히스토리 의존 제거. 장기 중단 시 대안 심리축은 별도 지수로 v2 검토 |
| CNN historical `x` 타임존 오해석 | 중 | FG 하루 밀림 | inspect 스크립트로 M2 0번에 확정, own 관측 우선 |
| Actions 러너 IP가 봇 방어에 걸림 | 중 | 수집 실패 | 수집기 실행 위치 이동성(집 맥 launchd) |
| FRED 전일 종가 반영 지연 | 중 | 스냅샷 하루 지연 | Stooq/Yahoo 폴백(한 창 한 소스), 01:00 UTC 재시도 |
| 소스 간 종가 차이 | 낮음 | 백분위 순위 흔들림 | 한 창 한 소스, 교차검증 0.1% 경고 |
| 미니앱 외부 도메인 fetch 불가 | 중 | 실데이터 화면 불가 | §3.7 실험을 M4 첫 항목으로; HTTPS만 사용 |
| react-native-svg 호스트 렌더 실패 | 중 | 게이지 안 보임 | M3 첫 샌드박스에서 확인, View 폴백 |
| 이용약관(CNN·S&P DJI) | 낮음~중 | 서비스 중단 | 파생값만 공개, 원시 종가·원문 히스토리 비공개, 출처 명시 |
| 심사 반려(투자 권유 오인) | 중 | 출시 지연 | 행동 지시 문구 제거, 면책 상수, doctor 금지 단어 |
| 목 데이터 배포 | 중 | 가짜 값 노출 | predeploy 차단 + "샘플 데이터" 배지 상시 |
| 60일 비활성 시 cron 정지 | 중 | 조용한 정지 | healthchecks 데드맨 |
| 신선도 오판(휴장일·DST·기기 시계) | 중 | 잘못된 지연 표시 | 거래일 캘린더, 스냅샷 값 우선, DST 산술 테스트 |
| 파라미터 변경 후 앱·잡 불일치 | 낮음 | 다른 숫자 | 스냅샷 `params` 동봉, 정보 화면 경고 |

### 10.2 미해결 질문(결정권자: 저장소 소유자)

1. CNN graphdata 실응답: 필드명(`score`/`timestamp`), historical `x` 단위·기준, 휴장일에도 값이 있는지, 필요한 User-Agent — **M2 0번 inspect 실행으로 확정**.
2. FRED SP500/NASDAQ100이 전일 종가를 몇 시(ET)에 반영하는지 — 22:30 UTC 실행에서 FRED가 자주 `date_lag`면 우선순위를 Stooq → FRED로 바꿀지.
3. 레포 공개 여부 — 공개면 GitHub Pages 가능(데이터 히스토리 노출), 비공개면 Cloudflare 계정 필요. 1순위는 Cloudflare Pages.
4. 미니앱의 외부 도메인 fetch·평문 HTTP 허용 여부(§3.7).
5. 백테스트로 W(252 vs 756)·N/M/K·α/β/γ 기본값을 바꿀지 — 바꾸면 `constants.ts` 한 곳만.
6. 면책 문구·스토어 설명의 최종 문안.
7. 홈 기본 지수(SPX 가정)와 두 지수 RFG가 크게 다를 때의 표현.

---

## 11. 마일스톤

| M | 산출물 | 완료 기준 | 상태 |
|---|---|---|---|
| M0 | 스캐폴드, doctor, check-config, 빌드 검증 | doctor 통과, `tsc`·jest·`ait build` 통과, 두 런타임 번들 해시 다름 | **완료** |
| M1 | `src/core` 전부 + `src/text` + 단위 테스트 + 손계산 골든 | §9.2 core/text 테스트 통과, `minClosesRequired()==311` | |
| M2 | `proxy/` 수집·검증·계산·게시 + 픽스처 e2e + 골든 스냅샷 + `inspect-*` 스크립트 + 로컬 `serve` | 픽스처로 e2e 통과, 계약 테스트 통과. **로컬에서 inspect 실행 후 [검증 필요] 해소** | |
| M3 | `src/data`, `src/ui`, 홈·정보 화면, 목 모드, `check-routes`/`check-pure-modules` | 샌드박스에서 목 모드 홈·정보 렌더, 상태표 10행 테스트 통과, SVG 렌더 확인 | |
| M4 | Actions cron + Cloudflare Pages + healthchecks + 샌드박스 실데이터 | 3일 연속 `ok`, 앱이 실데이터 `ready`(§3.7 실험 통과) | |
| M5 | 백테스트 리포트 1회, 파라미터 확정, 스토어 그림·텍스트 생성, `predeploy`, 아이콘 URL, 배포 | doctor 신규 항목 통과, 키 있는 기계에서 `ait deploy`, 스토어 등록 | |
