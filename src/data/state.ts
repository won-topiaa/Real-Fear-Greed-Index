/**
 * 데이터 상태 타입. 순수 TS(react/react-native import 없음) — src/text 의 뷰모델과 파이프라인 typecheck 가 함께 쓴다.
 */
import type { RfgSnapshot } from '../core/types';
import type { ClientErrorCode } from './client';

export type DataErrorCode = ClientErrorCode | 'offline' | 'unknown';

export type DataState =
  | { status: 'loading'; cached?: RfgSnapshot }
  | { status: 'success'; data: RfgSnapshot; fromCache: boolean }
  | { status: 'error'; error: { code: DataErrorCode; message: string }; cached?: RfgSnapshot };
