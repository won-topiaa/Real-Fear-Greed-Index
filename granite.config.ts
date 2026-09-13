import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

/**
 * 주의:
 * - `target`은 적지 않는다. 적으면 0.84 번들까지 0.72 호환 변환을 받아 두 런타임 번들이 같아진다.
 * - `brand.icon`은 파일 경로가 아니라 이미지 URL이어야 한다(프레임워크가 <Image source={{ uri }} />에 그대로 넘긴다).
 * - `appName`은 앱인토스 콘솔에 등록한 값과 정확히 같아야 한다. 샌드박스에서는 `intoss://real-fear-greed-index`로 연다.
 */
export default defineConfig({
  scheme: 'intoss',
  appName: 'real-fear-greed-index',
  plugins: [
    appsInToss({
      brand: {
        displayName: '실질 공포탐욕지수',
        primaryColor: '#3182F6',
        icon: '',
      },
      permissions: [],
    }),
  ],
});
