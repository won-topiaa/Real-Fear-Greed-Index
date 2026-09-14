/**
 * 보고서 §2.2 의 롤링 지표. 입력 배열은 오래된 → 최신, closes[t] 가 거래일 t 의 종가.
 * 창이 모자라는 앞부분은 null. 부분 창으로 값을 만들지 않는다.
 */

/** r_t = ln(Close_t / Close_{t-1}). r[0] 은 null. */
export function computeLogReturns(closes: readonly number[]): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev == null || cur == null) continue;
    out[i] = Math.log(cur / prev);
  }
  return out;
}

/**
 * DD_t = (Close_t − max_{i∈[0,N−1]} Close_{t−i}) / max_{i∈[0,N−1]} Close_{t−i}
 * 창은 현재를 포함한 N 개. 고점이 현재면 0. t < N−1 이면 null.
 */
export function rollingDrawdown(closes: readonly number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let t = n - 1; t < closes.length; t++) {
    let max = -Infinity;
    for (let i = t - n + 1; i <= t; i++) {
      const c = closes[i];
      if (c != null && c > max) max = c;
    }
    const cur = closes[t];
    if (cur == null || !(max > 0)) continue;
    out[t] = (cur - max) / max;
  }
  return out;
}

/** SMA_{M,t} = (1/M) Σ_{k=0}^{M−1} Close_{t−k} */
export function rollingSma(closes: readonly number[], m: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let t = m - 1; t < closes.length; t++) {
    let sum = 0;
    for (let i = t - m + 1; i <= t; i++) sum += closes[i] ?? 0;
    out[t] = sum / m;
  }
  return out;
}

/** DISP_t = (Close_t − SMA_{M,t}) / SMA_{M,t} */
export function rollingDisparity(closes: readonly number[], m: number): (number | null)[] {
  const sma = rollingSma(closes, m);
  return sma.map((s, t) => {
    const c = closes[t];
    if (s == null || c == null || s === 0) return null;
    return (c - s) / s;
  });
}

/**
 * RV_t = √annualizationDays × √( (1/(K−1)) Σ_{j=0}^{K−1} (r_{t−j} − r̄)² )
 * 표본표준편차(K−1), 평균 차감. 수익률 K 개 → 종가 K+1 개 필요. t < K 이면 null.
 */
export function rollingRealizedVol(closes: readonly number[], k: number, annualizationDays: number): (number | null)[] {
  const r = computeLogReturns(closes);
  const out: (number | null)[] = new Array(closes.length).fill(null);
  const scale = Math.sqrt(annualizationDays);
  for (let t = k; t < closes.length; t++) {
    let sum = 0;
    let ok = true;
    for (let j = t - k + 1; j <= t; j++) {
      const v = r[j];
      if (v == null) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (!ok) continue;
    const mean = sum / k;
    let ss = 0;
    for (let j = t - k + 1; j <= t; j++) {
      const v = r[j] as number;
      ss += (v - mean) * (v - mean);
    }
    out[t] = scale * Math.sqrt(ss / (k - 1));
  }
  return out;
}

/**
 * P_t = PercentileRank_W(v_t) × 100  (DESIGN §4.1 확정 정의)
 * 창 = values[t−W+1 .. t], 자기 자신 포함, 길이 정확히 W. 창 안에 null 이 있으면 null.
 * P = (#{x < v} + 0.5·(#{x = v} − 1)) / (W − 1) × 100
 * 성질: 창 최대 → 100, 창 최소 → 0, 전부 동률 → 50.
 */
export function rollingPercentileRank(values: readonly (number | null)[], w: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (w < 2) return out;
  for (let t = w - 1; t < values.length; t++) {
    const v = values[t];
    if (v == null) continue;
    let less = 0;
    let eq = 0;
    let ok = true;
    for (let i = t - w + 1; i <= t; i++) {
      const x = values[i];
      if (x == null) {
        ok = false;
        break;
      }
      if (x < v) less++;
      else if (x === v) eq++;
    }
    if (!ok) continue;
    out[t] = ((less + 0.5 * (eq - 1)) / (w - 1)) * 100;
  }
  return out;
}
