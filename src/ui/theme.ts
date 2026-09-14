/**
 * 라이트 고정 토큰(프레임워크가 TDSProvider colorPreference="light" 를 고정). 다크 맵 자리만 둔다.
 * 대비: text/bg 12.6:1, sub/bg 6.3:1, primary/white 4.6:1.
 */
export const colors = {
  bg: '#FFFFFF',
  surface: '#F9FAFB',
  border: '#E5E8EB',
  text: '#191F28',
  sub: '#4E5968',
  muted: '#8B95A1',
  primary: '#3182F6',
  fear: '#F04452',
  greed: '#03B26C',
  track: '#E5E8EB',
  badgeGrayBg: '#F2F4F6',
  badgeGrayText: '#4E5968',
  badgeYellowBg: '#FFF4D6',
  badgeYellowText: '#8A6100',
  badgeRedBg: '#FFECEE',
  badgeRedText: '#B71C1C',
  quadrantOn: '#DCEBFF',
  quadrantOff: '#F2F4F6',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const font = { hero: 44, title: 20, body: 15, small: 13, caption: 12 } as const;

export const radius = { sm: 6, md: 12, lg: 16 } as const;

export const MAX_FONT_SCALE = 1.3;
