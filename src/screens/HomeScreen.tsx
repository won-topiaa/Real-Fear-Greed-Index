/**
 * 홈 화면. 라우팅과 분리되어 있어 테스트에서 직접 렌더한다. 모든 문자열·수치는 selectHomeViewModel 이 만든다.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { THRESHOLDS } from '../core/constants';
import type { IndexSymbol } from '../core/types';
import { readSelectedIndex, writeSelectedIndex } from '../data/cache';
import { DEFAULT_INDEX } from '../data/policy';
import { useRfgDeps } from '../data/RfgContext';
import { useRfgSnapshot } from '../data/useRfgSnapshot';
import { LABELS } from '../text/copy';
import { selectHomeViewModel } from '../text/viewmodel';
import { AxisBars } from '../ui/AxisBars';
import { Badge, Banner } from '../ui/Badges';
import { Gauge } from '../ui/Gauge';
import { IndexSwitch } from '../ui/IndexSwitch';
import { Button, Txt } from '../ui/primitives';
import { QuadrantCard } from '../ui/QuadrantCard';
import { Screen, Section } from '../ui/Screen';
import { Sparkline } from '../ui/Sparkline';
import { EmptyState, LoadingState } from '../ui/States';
import { spacing } from '../ui/theme';

export function HomeScreen({ onOpenAbout }: { onOpenAbout?: () => void }) {
  const { platform, isMock } = useRfgDeps();
  const { state, refresh, isRefreshing } = useRfgSnapshot();
  const [index, setIndex] = useState<IndexSymbol>(DEFAULT_INDEX);

  useEffect(() => {
    let alive = true;
    readSelectedIndex(platform.storage).then((v) => alive && setIndex(v));
    return () => {
      alive = false;
    };
  }, [platform]);

  const vm = selectHomeViewModel({
    state,
    index,
    isMock,
    nowUtcMs: platform.now(),
    thresholds: { capitulation: THRESHOLDS.RFG_CAPITULATION_MAX, euphoria: THRESHOLDS.RFG_EUPHORIA_MIN },
    environment: platform.getOperationalEnvironment(),
  });

  const onChangeIndex = (v: IndexSymbol) => {
    setIndex(v);
    void writeSelectedIndex(platform.storage, v);
  };

  const hasSnapshot = vm.basisLine != null;

  return (
    <Screen refreshing={isRefreshing} onRefresh={refresh} testID={`home-${vm.mode}`}>
      <View style={styles.header}>
        <Txt variant="title" bold>
          {vm.title}
        </Txt>
        <IndexSwitch value={vm.index} labels={vm.indexLabel} onChange={onChangeIndex} />
      </View>
      <View style={styles.meta}>
        {vm.basisLine ? (
          <Txt variant="caption" tone="muted" testID="basis-line">
            {vm.basisLine}
          </Txt>
        ) : null}
        {vm.badge ? <Badge text={vm.badge.text} tone={vm.badge.tone} /> : null}
      </View>
      {vm.banner ? <Banner text={vm.banner} /> : null}

      {vm.mode === 'loading' ? <LoadingState /> : null}
      {!hasSnapshot && vm.mode !== 'loading' ? <EmptyState message={vm.emptyMessage ?? ''} retryLabel={vm.retryLabel} onRetry={refresh} /> : null}

      {hasSnapshot && vm.showScores ? (
        <>
          <Section>
            <Gauge
              value={vm.rfgValue}
              valueText={vm.rfg}
              zoneLabel={vm.rfgZoneLabel}
              ticks={vm.gaugeTicks}
              legend={vm.gaugeLegend}
              leftLabel={LABELS.rfgZone.CAPITULATION}
              rightLabel={LABELS.rfgZone.EUPHORIA}
              accessibilityLabel={vm.a11ySummary}
            />
          </Section>
          <Section>
            <AxisBars fearLabel={LABELS.axis.fear} fear={vm.fear} fearValue={vm.fearValue} pLabel={LABELS.axis.p} p={vm.p} pValue={vm.pValue} frmLabel={LABELS.axis.frm} frm={vm.frm} />
          </Section>
          <Section>
            <QuadrantCard quadrant={vm.quadrant} label={vm.quadrantLabel} description={vm.quadrantDescription} axisX={LABELS.axis.fear} axisY={LABELS.axis.p} a11y={vm.a11ySummary} />
          </Section>
          <Section>
            {vm.frmSentence ? (
              <Txt variant="body" bold testID="frm-sentence">
                {vm.frmSentence}
              </Txt>
            ) : null}
            <Txt variant="small" tone="sub" testID="frm-meaning">
              {vm.frmMeaning}
            </Txt>
          </Section>
        </>
      ) : null}

      {hasSnapshot && !vm.showScores && vm.emptyMessage ? (
        <Section>
          <Txt variant="body" tone="sub" testID="blocked-message">
            {vm.emptyMessage}
          </Txt>
          {vm.mode === 'fg-missing' ? (
            <View style={styles.pOnly}>
              <AxisBars fearLabel={LABELS.axis.fear} fear={vm.fear} fearValue={null} pLabel={LABELS.axis.p} p={vm.p} pValue={vm.pValue} frmLabel={LABELS.axis.frm} frm={vm.frm} />
            </View>
          ) : null}
        </Section>
      ) : null}

      {hasSnapshot ? (
        <Section>
          {vm.detailLine ? (
            <Txt variant="small" tone="sub" testID="detail-line">
              {vm.detailLine}
            </Txt>
          ) : null}
          <View style={styles.spark}>
            <Sparkline values={vm.sparkline} caption={vm.sparklineCaption} />
          </View>
        </Section>
      ) : null}

      <View style={styles.footer}>
        {onOpenAbout ? <Button title={`${vm.aboutLabel} ›`} kind="ghost" onPress={onOpenAbout} /> : null}
        <Txt variant="caption" tone="muted" testID="disclaimer">
          {vm.disclaimer}
        </Txt>
        {vm.sandboxLabel ? (
          <Txt variant="caption" tone="muted">
            {vm.sandboxLabel}
          </Txt>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  meta: { marginTop: spacing.sm, gap: spacing.xs },
  pOnly: { marginTop: spacing.md },
  spark: { marginTop: spacing.md },
  footer: { marginTop: spacing.xl, gap: spacing.md, alignItems: 'flex-start' },
});
