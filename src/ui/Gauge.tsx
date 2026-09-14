/**
 * RFG 게이지 — View 기반(SVG 미의존). 눈금 위치는 props 로 받는다(상수는 core 에서).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Txt } from './primitives';
import { colors, font, radius, spacing } from './theme';

export interface GaugeProps {
  value: number | null;
  valueText: string;
  zoneLabel: string;
  ticks: { capitulation: number; euphoria: number };
  legend: string;
  leftLabel: string;
  rightLabel: string;
  accessibilityLabel: string;
}

export function Gauge(p: GaugeProps) {
  const pct = p.value == null ? null : Math.max(0, Math.min(100, p.value));
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={p.accessibilityLabel} testID="gauge">
      <View style={styles.valueRow}>
        <Txt variant="hero" bold testID="gauge-value" style={styles.value}>
          {p.valueText}
        </Txt>
        <Txt variant="body" tone="sub" testID="gauge-zone">
          {p.zoneLabel}
        </Txt>
      </View>
      <View style={styles.track}>
        <View style={[styles.tick, { left: `${p.ticks.capitulation}%` }]} />
        <View style={[styles.tick, { left: `${p.ticks.euphoria}%` }]} />
        {pct != null && <View style={[styles.needle, { left: `${pct}%` }]} />}
      </View>
      <View style={styles.labels}>
        <Txt variant="caption" tone="muted">
          {p.leftLabel}
        </Txt>
        <Txt variant="caption" tone="muted">
          {p.rightLabel}
        </Txt>
      </View>
      <Txt variant="caption" tone="muted" style={styles.legend}>
        {p.legend}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  value: { fontSize: font.hero, lineHeight: font.hero + 8 },
  track: { height: 10, borderRadius: radius.sm, backgroundColor: colors.track, marginTop: spacing.md, position: 'relative' },
  tick: { position: 'absolute', top: -3, width: 2, height: 16, backgroundColor: colors.muted, marginLeft: -1 },
  needle: { position: 'absolute', top: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, marginLeft: -10 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  legend: { marginTop: spacing.xs },
});
