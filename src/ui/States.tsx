import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Txt } from './primitives';
import { colors, radius, spacing } from './theme';

export function LoadingState() {
  return (
    <View testID="loading">
      <View style={[styles.block, { width: '40%', height: 48 }]} />
      <View style={[styles.block, { height: 10 }]} />
      <View style={[styles.block, { height: 80 }]} />
    </View>
  );
}

export function EmptyState(p: { message: string; retryLabel?: string; onRetry?: () => void }) {
  return (
    <View style={styles.empty} testID="empty">
      <Txt variant="body" tone="sub" style={styles.emptyText}>
        {p.message}
      </Txt>
      {p.onRetry && p.retryLabel ? <Button title={p.retryLabel} onPress={p.onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface, borderRadius: radius.md, marginVertical: spacing.sm, width: '100%' },
  empty: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.lg },
  emptyText: { textAlign: 'center' },
});
