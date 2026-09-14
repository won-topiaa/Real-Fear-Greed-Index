/** 최근 N 거래일 RFG 막대 스파크라인. View 기반. null 은 빈 칸. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Txt } from './primitives';
import { colors, spacing } from './theme';

const HEIGHT = 40;

export function Sparkline(p: { values: Array<number | null>; caption: string }) {
  return (
    <View testID="sparkline">
      <View style={styles.row} accessible accessibilityLabel={p.caption}>
        {p.values.map((v, i) => (
          <View key={i} style={styles.slot}>
            {v != null && <View style={[styles.bar, { height: Math.max(2, (Math.max(0, Math.min(100, v)) / 100) * HEIGHT) }]} />}
          </View>
        ))}
      </View>
      <Txt variant="caption" tone="muted" style={styles.caption}>
        {p.caption}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', height: HEIGHT, gap: 1 },
  slot: { flex: 1, height: HEIGHT, justifyContent: 'flex-end' },
  bar: { backgroundColor: colors.primary, opacity: 0.7, borderRadius: 1 },
  caption: { marginTop: spacing.xs },
});
