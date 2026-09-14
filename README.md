# 실질 공포·탐욕 지수 (Realized Fear & Greed Index) — 앱인토스 미니앱

CNN 공포·탐욕 지수(심리)가 S&P 500 / 나스닥 100 의 실제 가격 훼손(낙폭·이격도·변동성)으로 얼마나 전이됐는지를
하루 한 번 계산해 토스 안에서 한 화면으로 보여준다. 산식은 `docs/DESIGN.md` §4, 원문 보고서의 모델 A(RFG)·모델 B(FRM)·4분면.

설계의 단일 진실은 **`docs/DESIGN.md`** 다. 코드와 다르면 문서를 먼저 고친다.

## 구조

```
src/core     순수 TS 수식·분류·달력·스냅샷 계약·백테스트  (react/react-native/node import 금지)
src/text     포맷·문구·홈 뷰모델 (순수 TS)               — 스토어 그림 스크립트가 그대로 import
src/data     스냅샷 클라이언트(HTTP/목)·캐시·상태 훅·프레임워크 접근(platform.ts)
src/ui       View 기반 컴포넌트, src/screens 화면, src/pages 라우트(createRoute)
proxy/       수집·검증·계산·게시 잡(Node 22). GitHub Actions cron → 정적 JSON → Cloudflare Pages
scripts/     doctor · check-config · check-routes · check-pure-modules · predeploy · ensure-local-config
```

## 시작

```
npm install
npm run doctor
npm run typecheck && npm test
npm run dev
```

`npm install` 이 `src/config.local.ts` 를 예시로 만든다. `apiBaseUrl` 이 비어 있으면 **목 모드**(샘플 데이터 배지)로 돌아가므로
서버 없이 샌드박스에서 바로 볼 수 있다. 시나리오는 `mockScenario` 로 바꾼다(normal · capitulation · bear_trap · complacency · euphoria · healthy_bull · delayed · stale · fg_missing).

샌드박스: 같은 Wi-Fi, 샌드박스 앱에서 로컬 네트워크 허용 → 맥 IP 입력 → `intoss://real-fear-greed-index`. 막히면 dev 서버 창에서 `j` 로 DevTools 콘솔부터 본다.

## 파이프라인

```
cd proxy && npm ci && cp .env.example .env
node scripts/inspect.mjs --source cnn --save        # 실응답 형태 확인 (M2 0번 작업, 값은 출력 안 함)
npm run collect                                     # public/v1/snapshot.json, status.json
npm run serve                                       # 로컬 정적 서빙 (폰에서 보려면 cloudflared 로 HTTPS)
npm run build-fixtures                              # core 상수를 바꾸면 반드시 재실행
npm test
```

자세한 내용은 `proxy/README.md`.

## 검사 스크립트

| 명령 | 하는 일 |
|---|---|
| `npm run doctor` | 앱인토스 새 앱 체크리스트(파일·버전·target·icon·권한·비밀값·상수 정합성·휴장일·골든 계약·라우트·순수 모듈·금지 단어) |
| `npm run check-config` | 비밀값을 **글자 수만** 출력(캡처해도 안전) |
| `npm run predeploy` | 목 모드·원격 세션·아이콘 미기입 배포 차단(`npm run deploy` 전에 자동 실행) |

## 배포(요약, 키 있는 로컬 기계에서)

```
npm run doctor && npm run typecheck && npm test
npm run check-config
npm run build
npm run deploy
```

전체 절차와 스토어 등록 항목은 `docs/DESIGN.md` §8.

## 원칙

- 사용자에게 보이는 숫자·문턱·문구는 `src/core/constants.ts` 와 `src/text/copy.ts` 한 곳에서만 나온다. JSX 에 숫자 리터럴을 쓰지 않는다.
- 점수(순서)와 문턱(차단)을 섞지 않는다. 오래되거나 결측인 데이터로는 "이유를 말하지 않는다".
- 화면과 판정은 같은 반올림 값을 쓴다.
- 네트워크 실패를 샘플 데이터로 덮지 않는다. 목 모드는 `apiBaseUrl` 이 비어 있을 때만이다.
- 투자 행동을 지시하는 문구는 쓰지 않는다. 면책은 홈과 정보 화면에 있다.
