import { localConfig } from './config.local';

export interface LocalConfig {
  /** 프록시 서버 주소(끝에 슬래시 없음). 비어 있으면 목 데이터 모드. */
  apiBaseUrl: string;
  /** 프록시 앱 토큰(선택). */
  appToken: string;
}

export interface AppConfig extends LocalConfig {
  /** apiBaseUrl이 비어 있으면 true. 화면에 "샘플 데이터" 배지를 띄우는 근거. */
  isMock: boolean;
  /** 네트워크 요청 타임아웃(ms). 사용자에게 보이는 숫자와 무관한 내부 상수. */
  requestTimeoutMs: number;
}

const defaults: LocalConfig = {
  apiBaseUrl: '',
  appToken: '',
};

const merged: LocalConfig = { ...defaults, ...localConfig };

export const config: AppConfig = {
  ...merged,
  isMock: merged.apiBaseUrl.trim().length === 0,
  requestTimeoutMs: 8_000,
};
