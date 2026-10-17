/**
 * RFG 전용 야후 프록시(Cloudflare Worker). 야후는 GitHub 러너·집 IP 에서 직접 부르면 429 라 Cloudflare 를 거친다.
 * 야후 chart API 주소만 통과시킨다 — 아무 주소나 대신 가져오는 열린 프록시가 아니다.
 * 사용: GET https://<이 워커>/?url=<인코딩된 https://query1.finance.yahoo.com/v8/finance/chart/...>
 * 배포: proxy/ 에서 `npm run deploy-yahoo-proxy`. 주소(workers.dev 계정 하위 도메인에 실명)는 GitHub Secret YAHOO_PROXY_URL 에만 둔다.
 */
const ALLOWED = /^https:\/\/query[12]\.finance\.yahoo\.com\/v8\/finance\/chart\/[^/?#]+\?[^#]*$/;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export default {
  async fetch(request) {
    if (request.method !== 'GET') return new Response('method not allowed', { status: 405 });
    const target = new URL(request.url).searchParams.get('url');
    if (!target || !ALLOWED.test(target)) return new Response('forbidden', { status: 403 });
    const res = await fetch(target, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
    });
  },
};
