/**
 * 로컬 전용 설정의 예시 파일. 실제 값은 `src/config.local.ts`(gitignore됨)에 둔다.
 * `npm install` 시 `scripts/ensure-local-config.mjs`가 이 파일을 복사해 `config.local.ts`를 만든다.
 *
 * - 값을 채우지 않으면 앱은 목(mock) 데이터로 동작한다(샌드박스 첫 실행용).
 * - 배포는 반드시 값이 채워진 기계에서 한다. 원격 세션에서 배포하면 목 경로를 쓰는 앱이 올라간다.
 * - 채팅창·스크린샷에 값을 붙여넣지 않는다. 점검은 `npm run check-config`(글자 수만 출력)로 한다.
 */
import type { LocalConfig } from './config';

export const localConfig: LocalConfig = {
  /** 프록시 서버 주소. 예: 'https://rfg-proxy.example.com' (끝에 슬래시 없음) */
  apiBaseUrl: '',
  /** 프록시가 요구하는 앱 토큰(선택). 프록시 `.env`의 APP_TOKEN과 같아야 한다. */
  appToken: '',
};
