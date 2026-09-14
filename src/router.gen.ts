/* eslint-disable */
// 수동 유지 — appsInToss() 는 plugin-router 를 포함하지 않고, plugin-router 는 '_' 페이지를 제외하므로 자동 생성하지 않는다.
// 라우트 추가 시: pages/<name>.tsx 재수출 + src/pages/<name>.tsx createRoute + 아래 세 줄. scripts/check-routes.mjs 가 동기화를 검사한다.
import { Route as _404Route } from '../pages/_404';
import { Route as _AboutRoute } from '../pages/about';
import { Route as _IndexRoute } from '../pages/';

declare module '@granite-js/react-native' {
  interface RegisterScreenInput {
    '/_404': (typeof _404Route)['_inputType'];
    '/about': (typeof _AboutRoute)['_inputType'];
    '/': (typeof _IndexRoute)['_inputType'];
  }

  interface RegisterScreen {
    '/_404': (typeof _404Route)['_outputType'];
    '/about': (typeof _AboutRoute)['_outputType'];
    '/': (typeof _IndexRoute)['_outputType'];
  }
}
