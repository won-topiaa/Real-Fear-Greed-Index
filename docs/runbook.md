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

`proxy/.env` 에 `FRED_API_KEY` 를 채운다(없어도 Stooq/Yahoo 로 동작). 키는 채팅·스크린샷에 붙이지 않는다. 확인은 `npm run check-config`.

---

## 2. M2 0번 작업 — 외부 응답 형태 확정 [검증 필요 해소]

이 코드는 네트워크가 차단된 환경에서 "알려진 형태"를 가정해 작성됐다. 로컬에서 아래를 **한 번** 돌려 형태를 확정한다.

```
cd proxy
node scripts/inspect.mjs --source cnn --save
node scripts/inspect.mjs --source fred --symbol SPX --save
node scripts/inspect.mjs --source stooq --symbol SPX --save
node scripts/inspect.mjs --source yahoo --symbol SPX --save
```

| 확인 | 맞으면 | 다르면 |
|---|---|---|
| CNN `historical.data[].x` 의 `utcMidnight=true` 이고 `utcDate == nyDate` | `cnnEpochToDate` 그대로 | `src/sources/cnn.ts` 의 `cnnEpochToDate` 규칙을 실측에 맞게 바꾸고 `test/sources.test.ts` 갱신 |
| CNN `fear_and_greed.timestamp` 존재, 뉴욕 날짜 == 직전 거래일 | 그대로 | 없으면 `fg-date-mismatch` 검사가 자동으로 건너뜀(문제 없음) |
| FRED 마지막 `date` == 전일 거래일(22:30 UTC 기준) | 그대로 | 자주 하루 늦으면 `src/sources/price.ts` 의 `PRICE_ADAPTERS` 순서를 `[stooq, fred, yahoo]` 로 |
| Stooq 헤더 `Date,Open,High,Low,Close,Volume` | 그대로 | `parseStooq` 컬럼 이름 수정 |
| Yahoo `timestamp` 가 초 단위, `close` 에 null 포함 | 그대로 | `normalizeYahoo` 수정 |

저장된 `test/fixtures/*.recorded.*` 로 `test/sources.test.ts` 의 합성 픽스처를 교체한다. CNN 은 히스토리를 30일로 잘라 저장된다(라이선스 최소화).

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

## 5. Cloudflare Pages + GitHub Actions 셋업 (한 번)

1. Cloudflare Pages 프로젝트 생성(직접 업로드형). 프로젝트 이름을 GitHub **Variables** `PAGES_PROJECT` 에, 호스트명(`xxx.pages.dev` 또는 커스텀 도메인)을 `PAGES_HOST` 에 넣는다.
2. GitHub **Secrets**: `FRED_API_KEY`, `CLOUDFLARE_API_TOKEN`(Pages 편집 권한만), `CLOUDFLARE_ACCOUNT_ID`, `HEALTHCHECKS_PING_URL`.
3. GitHub **Variables**(선택): `CNN_USER_AGENT`.
4. `.github/workflows/collect.yml` 을 **수동 실행(workflow_dispatch)** 해 `status-<run>` 아티팩트의 `status.json` 이 `ok` 인지 본다.
5. healthchecks.io 체크를 만들고(주기 1일, 유예 12시간) 핑 URL 을 Secrets 에 넣는다. GitHub 는 **공개 레포가 60일간 비활성이면 스케줄 워크플로를 끈다** — 이 데드맨 핑이 "잡이 아예 안 돈" 경우를 잡는 유일한 수단이다.
6. 아이콘: 512×512 PNG 를 `proxy/public/static/icon.png` 로 같이 게시하고 `granite.config.ts` 의 `brand.icon` 에 `https://<PAGES_HOST>/static/icon.png` 를 적는다. (게시 산출물에 정적 파일을 포함하도록 collect.yml 의 배포 단계 전에 복사 스텝을 추가한다 — M5.)

Actions 러너 IP 가 CNN 봇 방어에 걸리면(`status.sources[cnn].error = http_403`), 수집기를 집 맥의 launchd 로 옮긴다:

```
cd proxy && npm run collect && npx wrangler pages deploy ./public --project-name rfg-data
```

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
- `npm run deploy` 전에 `predeploy` 가 자동으로 돈다: 목 모드·원격 세션(`CI`, `CLAUDE_CODE`, `CODESPACES`, `SSH_CONNECTION`)·아이콘 미기입이면 실패한다.
- 키 교체 시 `npx ait token remove` 먼저. 프로필에 옛 키가 남아 있으면 `--api-key` 가 조용히 무시된다.
- 배포 후 실제 토스 앱(Android ≥ 5.220.0 / iOS ≥ 5.221.0)에서 최종 확인. 그 미만 버전은 앱이 아예 그려지지 않는다.

스토어 등록: 아이콘 **URL**, 세로 636×1048 3장 이상, 가로 1504×741 1장 이상, 약관 체크박스 **두 개**. 그림은 손으로 그리지 않고 스크립트로 만든다(M5, `selectHomeViewModel` 공유).

---

## 7. 사고 대응

| 증상 | 확인 | 조치 |
|---|---|---|
| 앱에 "N거래일 전 값이에요" 배지 | `status.json` 의 `sources[]` | `date_lag` 면 다음 01:00 UTC 재시도를 기다린다. 이틀 넘으면 소스 우선순위 조정 |
| 앱이 지수를 `—` 로 막음(stale) | 잡이 3거래일 넘게 실패 | Actions 로그·healthchecks 확인. 러너 차단이면 §5 의 실행 위치 이동 |
| "심리 데이터를 아직 못 받았어요" | `sources[cnn].error` | `http_403`/`schema` 면 inspect 로 형태 재확인. 히스토리 마지막 값이 5달력일 안이면 자동 폴백 중 |
| 앱 "업데이트가 필요해요" | 스냅샷 `schemaVersion` 변경 | 의도한 변경이면 앱 재배포. 아니면 파이프라인 롤백 |
| 홈에 "샘플 데이터" 배지가 배포본에서 보임 | 목 모드로 배포됨 | 즉시 `apiBaseUrl` 채워 재배포. predeploy 를 우회했는지 확인 |
| healthchecks 알림 | 잡이 안 돌았음 | Actions 스케줄 비활성(60일 비활성) 여부 → 수동 실행 후 레포에 커밋 1건 |

---

## 8. 상수·파라미터를 바꿀 때

1. `src/core/constants.ts` 한 곳만 바꾼다.
2. `npm test` (핵심 수식 테스트가 새 값과 일치하는지; `MIN_CLOSES` 류는 doctor 가 재검사).
3. `cd proxy && npm run build-fixtures && npm test` — 목 픽스처와 골든이 다시 만들어진다. 시나리오가 의도한 국면을 못 만들면 스크립트가 실패한다(시드·레짐 조정).
4. 앱과 파이프라인을 **같이** 배포한다. 스냅샷에 `params` 가 실려 있어 다르면 정보 화면에 경고가 뜬다.
