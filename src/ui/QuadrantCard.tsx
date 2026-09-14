/** 2×2 국면 격자 + 라벨·서술. 경계값은 표시하지 않고(정보 화면에 표), 어느 칸인지만 강조한다. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Quadrant } from '../core/types';
import { Txt } from './primitives';
import { colors, radius, spacing } from './theme';

const CELLS: Array<{ q: Quadrant; label: string }> = [
  { q: 'Q2', label: '은밀한 붕괴' },
  { q: 'Q1', label: '패닉 투매' },
  { q: 'Q3', label: '건전한 상승' },
  { q: 'Q4', label: '가짜 공포' },
];

export function QuadrantCard(p: { quadrant: Quadrant; label: string; description: string; axisX: string; axisY: string; a11y: string }) {
  return (
    <View testID="quadrant" accessible accessibilityLabel={p.a11y}>
      <View style={styles.grid}>
        {CELLS.map((c) => (
          <View key={c.q} style={[styles.cell, p.quadrant === c.q && styles.cellOn]} testID={`cell-${c.q}`}>
            <Txt variant="caption" tone={p.quadrant === c.q ? 'primary' : 'muted'} bold={p.quadrant === c.q}>
              {c.label}
            </Txt>
          </View>
        ))}
      </View>
      <View style={styles.axes}>
        <Txt variant="caption" tone="muted">
          ↑ {p.axisY}
        </Txt>
        <Txt variant="caption" tone="muted">
          {p.axisX} →
        </Txt>
      </View>
      <Txt variant="body" bold style={styles.label} testID="quadrant-label">
        {p.label}
      </Txt>
      <Txt variant="small" tone="sub">
        {p.description}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  cell: { width: '48%', paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.sm, backgroundColor: colors.quadrantOff },
  cellOn: { backgroundColor: colors.quadrantOn },
  axes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  label: { marginTop: spacing.md },
});
