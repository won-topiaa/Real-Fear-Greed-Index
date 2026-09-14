/**
 * 로컬 전용 설정의 예시 파일. 실제 값은 `src/config.local.ts`(gitignore됨)에 둔다.
 * `npm install` 시 `scripts/ensure-local-config.mjs`가 이 파일을 복사해 `config.local.ts`를 만든다.
 *
 * - 값을 채우지 않으면 앱은 목(mock) 데이터로 동작한다(샌드박스 첫 실행용). 화면에 "샘플 데이터" 배지가 항상 보인다.
 * - 배포는 반드시 값이 채워진 기계에서 한다. 원격 세션에서 배포하면 목 경로를 쓰는 앱이 올라간다(predeploy 가 막는다).
 * - 채팅창·스크린샷에 값을 붙여넣지 않는다. 점검은 `npm run check-config`(글자 수만 출력)로 한다.
 */
import type { LocalConfig } from './config';

export const localConfig: LocalConfig = {
  /** 정적 게시 베이스 URL. 예: 'https://rfg-data.pages.dev' (끝에 슬래시 없음). HTTPS 만. */
  apiBaseUrl: '',
  /** v1 미사용. 비워 둔다. */
  appToken: '',
  /** 목 모드 시나리오: normal | capitulation | bear_trap | complacency | euphoria | healthy_bull | delayed | stale | fg_missing */
  mockScenario: 'normal',
};
