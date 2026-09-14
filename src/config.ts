import { localConfig } from './config.local';

/** 목 프로바이더 시나리오. proxy/src/synth/scenarios.ts 의 키와 같아야 한다(픽스처 파일명). */
export type MockScenario = 'normal' | 'capitulation' | 'bear_trap' | 'complacency' | 'euphoria' | 'healthy_bull' | 'delayed' | 'stale' | 'fg_missing';

export interface LocalConfig {
  /** 정적 게시 베이스 URL(끝에 슬래시 없음). 비어 있으면 목 데이터 모드. */
  apiBaseUrl: string;
  /** 앱 토큰. v1 미사용(정적 호스팅에서는 검사 주체가 없고 번들에서 추출 가능하므로 비밀이 아니다). */
  appToken: string;
  /** 목 모드에서 보여줄 시나리오(개발 편의). 기본 'normal'. */
  mockScenario?: MockScenario;
}

export interface AppConfig extends LocalConfig {
  /** apiBaseUrl이 비어 있으면 true. 화면에 "샘플 데이터" 배지를 띄우는 근거. 네트워크 실패의 폴백이 아니다. */
  isMock: boolean;
  mockScenario: MockScenario;
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
  apiBaseUrl: merged.apiBaseUrl.trim().replace(/\/+$/, ''),
  isMock: merged.apiBaseUrl.trim().length === 0,
  mockScenario: merged.mockScenario ?? 'normal',
  requestTimeoutMs: 8_000,
};
