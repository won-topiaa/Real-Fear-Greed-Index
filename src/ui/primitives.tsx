/**
 * 기본 컴포넌트 래퍼. TDS 로 바꿀 때 유일하게 건드리는 곳(DESIGN §6.1).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, type PressableProps, type TextProps, type ViewStyle } from 'react-native';
import { MAX_FONT_SCALE, colors, font, radius, spacing } from './theme';

type Variant = 'hero' | 'title' | 'body' | 'small' | 'caption';
type Tone = 'text' | 'sub' | 'muted' | 'primary';

export function Txt({ variant = 'body', tone = 'text', bold, style, ...props }: TextProps & { variant?: Variant; tone?: Tone; bold?: boolean }) {
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[{ fontSize: font[variant], color: colors[tone], fontWeight: bold ? '700' : '400', lineHeight: Math.round(font[variant] * 1.4) }, style]}
      {...props}
    />
  );
}

export function Button({ title, kind = 'primary', style, ...props }: PressableProps & { title: string; kind?: 'primary' | 'ghost'; style?: ViewStyle }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.button, kind === 'ghost' && styles.ghost, pressed && styles.pressed, style]}
      {...props}
    >
      <Txt variant="body" bold style={{ color: kind === 'primary' ? colors.bg : colors.primary }}>
        {title}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { backgroundColor: colors.surface },
  pressed: { opacity: 0.7 },
});
