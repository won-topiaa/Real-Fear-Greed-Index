import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { IndexSymbol } from '../core/types';
import { Txt } from './primitives';
import { colors, radius, spacing } from './theme';

const ORDER: IndexSymbol[] = ['SPX', 'NDX'];

export function IndexSwitch(p: { value: IndexSymbol; labels: Record<IndexSymbol, string>; onChange: (v: IndexSymbol) => void }) {
  return (
    <View style={styles.row} accessibilityRole="tablist" testID="index-switch">
      {ORDER.map((sym) => {
        const on = sym === p.value;
        return (
          <Pressable
            key={sym}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={p.labels[sym]}
            onPress={() => p.onChange(sym)}
            style={[styles.tab, on && styles.tabOn]}
            testID={`index-${sym}`}
          >
            <Txt variant="small" bold={on} tone={on ? 'primary' : 'sub'}>
              {p.labels[sym]}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.xs },
  tab: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.bg },
});
