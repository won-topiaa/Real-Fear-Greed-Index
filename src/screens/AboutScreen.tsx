/** 정보·면책 화면. 숫자는 core 상수를 보간한 COPY 에서만 온다. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RFG_PARAMS } from '../core/constants';
import { useCachedSnapshot } from '../data/useCachedSnapshot';
import { COPY, DISCLAIMER } from '../text/copy';
import { formatKst } from '../text/format';
import { Txt } from '../ui/primitives';
import { Screen, Section } from '../ui/Screen';
import { spacing } from '../ui/theme';

function paramsDiffer(server: Record<string, number> | undefined): boolean {
  if (!server) return false;
  return (Object.keys(RFG_PARAMS) as (keyof typeof RFG_PARAMS)[]).some((k) => server[k] !== RFG_PARAMS[k]);
}

export function AboutScreen({ appInfo }: { appInfo?: { appName: string; deploymentId: string } }) {
  const snapshot = useCachedSnapshot();
  const indicators = COPY.describeIndicators();
  const generated = snapshot ? formatKst(snapshot.generatedAtUtc) : null;

  return (
    <Screen testID="about">
      <Section>
        <Txt variant="title" bold>
          무엇을 재나요
        </Txt>
        <Txt variant="body" tone="sub" style={styles.p}>
          심리 지표(CNN 공포·탐욕 지수)가 실제 지수 가격의 하락과 변동성으로 얼마나 전이됐는지를 하나의 숫자로 보여줘요.
        </Txt>
      </Section>
      <Section>
        <Txt variant="title" bold>
          계산 요약
        </Txt>
        {[indicators.dd, indicators.disp, indicators.rv, indicators.p].map((line) => (
          <Txt key={line} variant="body" tone="sub" style={styles.p}>
            · {line}
          </Txt>
        ))}
        <Txt variant="small" tone="muted" style={styles.p}>
          {COPY.paramsSummary()}
        </Txt>
        {paramsDiffer(snapshot?.params) ? (
          <Txt variant="small" tone="muted" style={styles.p} testID="params-differ">
            {COPY.serverParamsDiffer}
          </Txt>
        ) : null}
      </Section>
      <Section>
        <Txt variant="title" bold>
          구간과 국면
        </Txt>
        {COPY.thresholdTable().map((row) => (
          <View key={row.key} style={styles.row}>
            <Txt variant="body" bold style={styles.rowKey}>
              {row.key}
            </Txt>
            <Txt variant="body" tone="sub" style={styles.rowRule}>
              {row.rule}
            </Txt>
          </View>
        ))}
      </Section>
      <Section>
        <Txt variant="title" bold>
          데이터 출처와 갱신
        </Txt>
        <Txt variant="body" tone="sub" style={styles.p}>
          {COPY.sourcesNotice}
        </Txt>
        <Txt variant="body" tone="sub" style={styles.p}>
          {COPY.refreshNotice}
        </Txt>
        {generated ? (
          <Txt variant="small" tone="muted" style={styles.p} testID="generated-at">
            마지막 계산: 한국 {generated.date} {generated.time}
          </Txt>
        ) : null}
      </Section>
      <Section>
        <Txt variant="title" bold>
          유의사항
        </Txt>
        <Txt variant="body" tone="sub" style={styles.p} testID="disclaimer-full">
          {DISCLAIMER.full}
        </Txt>
      </Section>
      {appInfo && appInfo.appName ? (
        <Section>
          <Txt variant="caption" tone="muted">
            {appInfo.deploymentId ? `${appInfo.appName} · ${appInfo.deploymentId}` : appInfo.appName}
          </Txt>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  p: { marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  rowKey: { width: 112 },
  rowRule: { flex: 1 },
});
