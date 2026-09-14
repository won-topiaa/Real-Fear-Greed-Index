/** 심리(Fear) vs 실질(P) 두 막대 + 전이 배수. View 기반. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Txt } from './primitives';
import { colors, radius, spacing } from './theme';

function Bar({ label, valueText, value, color }: { label: string; valueText: string; value: number | null; color: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <View style={styles.bar} accessible accessibilityLabel={`${label} ${valueText}`}>
      <View style={styles.barHeader}>
        <Txt variant="small" tone="sub">
          {label}
        </Txt>
        <Txt variant="small" bold>
          {valueText}
        </Txt>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export function AxisBars(p: { fearLabel: string; fear: string; fearValue: number | null; pLabel: string; p: string; pValue: number | null; frmLabel: string; frm: string }) {
  return (
    <View testID="axis-bars">
      <Bar label={p.fearLabel} valueText={p.fear} value={p.fearValue} color={colors.fear} />
      <Bar label={p.pLabel} valueText={p.p} value={p.pValue} color={colors.primary} />
      <View style={styles.frmRow}>
        <Txt variant="small" tone="sub">
          {p.frmLabel}
        </Txt>
        <Txt variant="small" bold testID="frm-value">
          {p.frm}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { marginBottom: spacing.md },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  track: { height: 8, borderRadius: radius.sm, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.sm },
  frmRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
