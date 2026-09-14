/** 2×2 국면 격자 + 라벨·서술. 경계값은 표시하지 않고(정보 화면에 표), 어느 칸인지만 강조한다. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Quadrant } from '../core/types';
import { Txt } from './primitives';
import { colors, radius, spacing } from './theme';

/** 격자 배치: 위 왼쪽 Q2(공포 낮음·훼손 높음), 위 오른쪽 Q1, 아래 왼쪽 Q3, 아래 오른쪽 Q4 */
const CELL_ORDER: readonly Quadrant[] = ['Q2', 'Q1', 'Q3', 'Q4'];

export function QuadrantCard(p: { quadrant: Quadrant; cellLabels: Record<Quadrant, string>; label: string; description: string; axisX: string; axisY: string; a11y: string }) {
  return (
    <View testID="quadrant" accessible accessibilityLabel={p.a11y}>
      <View style={styles.grid}>
        {CELL_ORDER.map((q) => (
          <View key={q} style={[styles.cell, p.quadrant === q && styles.cellOn]} testID={`cell-${q}`}>
            <Txt variant="caption" tone={p.quadrant === q ? 'primary' : 'muted'} bold={p.quadrant === q}>
              {p.cellLabels[q]}
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
