import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Txt } from './primitives';
import { colors, radius, spacing } from './theme';

export function Badge({ text, tone }: { text: string; tone: 'gray' | 'yellow' | 'red' }) {
  const bg = tone === 'gray' ? colors.badgeGrayBg : tone === 'yellow' ? colors.badgeYellowBg : colors.badgeRedBg;
  const fg = tone === 'gray' ? colors.badgeGrayText : tone === 'yellow' ? colors.badgeYellowText : colors.badgeRedText;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]} accessibilityRole="text" testID="badge">
      <Txt variant="caption" bold style={{ color: fg }}>
        {text}
      </Txt>
    </View>
  );
}

export function Banner({ text }: { text: string }) {
  return (
    <View style={styles.banner} testID="banner">
      <Txt variant="small" style={{ color: colors.badgeRedText }}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm },
  banner: { backgroundColor: colors.badgeRedBg, padding: spacing.md, borderRadius: radius.md, marginVertical: spacing.sm },
});
