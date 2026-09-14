# proxy/ — RFG 수집·검증·계산·게시 잡

이름은 교훈 문서·`.gitignore`·`check-config` 와 맞추기 위해 `proxy/` 를 유지한다. 실체는 **하루 한 번 도는 잡**이며,
결과는 정적 JSON(`public/v1/snapshot.json`, `public/v1/status.json`)으로 Cloudflare Pages 에 게시한다. 항상 켜진 서버는 없다.

## 실행

```
cd proxy
npm ci
cp .env.example .env
npm run collect
npm run serve
```

- `collect` — 기대 최신 거래일을 계산하고 CNN(심리) · FRED/Stooq/Yahoo(종가) 를 수집해 `public/` 에 게시한다. `--now 2026-09-11T22:30:00Z` 로 시각을 고정할 수 있다.
- `serve` — `public/` 을 로컬에서 서빙한다(개발용). 샌드박스 폰에서 보려면 `cloudflared tunnel --url http://localhost:8787` 로 HTTPS URL 을 만든다.
- `build-fixtures` — 합성 시나리오로 앱 목 픽스처(`src/data/fixtures/*.json`)와 e2e 골든(`test/golden/snapshot.json`)을 다시 만든다. core 상수를 바꾸면 반드시 다시 실행한다.
- `backtest` — `.cache` 의 수집 결과(또는 `--scenario <key>`)로 보고서 §5.2 리포트를 `docs/backtest/` 에 쓴다.
- `inspect` — 외부 소스의 **실제 응답 형태**를 확인한다(값은 출력하지 않음). `--save` 로 픽스처 저장.

## M2 의 0번 작업 — [검증 필요] 항목 해소

이 코드는 네트워크가 차단된 환경에서 "알려진 형태"를 가정하고 작성됐다. 로컬에서 아래를 한 번 돌려 형태를 확정한다.

```
node scripts/inspect.mjs --source cnn --save
node scripts/inspect.mjs --source fred --symbol SPX --save
node scripts/inspect.mjs --source stooq --symbol SPX --save
node scripts/inspect.mjs --source yahoo --symbol SPX --save
```

확인할 것:
1. CNN `historical.data[].x` 가 UTC 자정(ms)인지 — 출력의 `utcMidnight`, `utcDate`, `nyDate` 세 열이 같은 날짜를 가리키면 `cnnEpochToDate` 규칙이 맞다.
2. CNN `fear_and_greed.timestamp` 필드 존재 여부와 그 뉴욕 날짜.
3. FRED 응답의 마지막 `date` 가 전일 종가인지(22:30 UTC 실행 기준). 자주 하루 늦으면 `PRICE_ADAPTERS` 순서를 Stooq 우선으로 바꾼다.
4. Stooq 헤더가 `Date,Open,High,Low,Close,Volume` 인지, 데이터 없을 때 본문이 `No data` 인지.
5. 저장된 픽스처로 `test/sources.test.ts` 의 합성 픽스처를 교체한다.

## 비밀값

`.env` 만(gitignore). 키 값은 채팅·스크린샷·로그에 넣지 않는다. 로그는 `api_key=` 뒤를 자동으로 가린다(`src/log.ts`, 테스트로 고정).
GitHub Actions 에서는 `FRED_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HEALTHCHECKS_PING_URL` 을 Secrets 에 둔다.

## 실패 모드

| 상황 | 동작 |
|---|---|
| 어떤 소스도 기대 거래일까지 없음 | 새 스냅샷 없음(이전 유지), `status.result = partial|failed`, 01:00 UTC 재시도 |
| 한 지수만 실패 | 그 지수는 이전 스냅샷 블록 유지(`partial`) |
| CNN 실패 | 저장소의 마지막 관측값으로 as-of 조인(5달력일), 넘으면 `fg-missing` |
| 주말·휴장일 | `unchanged: true` 로 정상 종료 |
| 스냅샷 자기검증 실패 | 게시 안 함(버그), `failed` |
