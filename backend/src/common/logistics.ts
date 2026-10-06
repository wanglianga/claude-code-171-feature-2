/**
 * 物流线路与到货城市温度工具
 * 按城市/温区生成稳定的线路名称与到货温度，供下单、发货、售后快照与种子数据共用。
 */

/** 城市名稳定哈希（0..1） */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000;
}

/**
 * 到货城市日间最高气温（℃，10 月初南方城市 24~34℃）
 * 同一城市结果稳定，便于坏果按“到货城市温度”维度归因
 */
export function cityArrivalTemp(city: string): number {
  if (!city) return null;
  const t = 24 + hashStr(city) * 10; // 24.0 ~ 34.0
  return Math.round(t * 10) / 10;
}

/** 物流线路：发货仓 → 到货城市，按温区走冷链/常温干线，干线编号由城市稳定哈希 */
export function logisticsRoute(warehouse: string, city: string, tempZone: string): string {
  const cold = tempZone && tempZone !== '常温';
  const line = String.fromCharCode(65 + Math.floor(hashStr(city || warehouse) * 3)); // A/B/C
  return `${warehouse || '县域中心仓'}始发→${city || '未知城市'}${cold ? '冷链' : '常温'}干线${line}`;
}

/** 运输途中最高温度：冷链正常 2~8℃，异常时明显超温 */
export function transitMaxTemp(tempZone: string, abnormal = false): number {
  if (tempZone === '冷冻') return abnormal ? -6 : -18;
  if (tempZone === '冷藏') return abnormal ? 14.5 : 6.2;
  return abnormal ? 36.8 : 28.5;
}

/** 城市温度归因分档 */
export function tempBand(temp: number): string {
  if (temp == null) return '未知';
  if (temp >= 30) return '高温 ≥30℃';
  if (temp >= 25) return '偏热 25~30℃';
  if (temp >= 10) return '温和 10~25℃';
  return '低温 <10℃';
}
