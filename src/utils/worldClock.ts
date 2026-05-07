const LOCAL_WORLD_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

export function parseWorldTimeValue(value?: string): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  // 世界编辑器当前保存的是无时区时间串，这里优先按本地时间解析，避免浏览器各自的 Date 推断漂移。
  const localMatch = trimmed.match(LOCAL_WORLD_TIME_PATTERN);
  if (localMatch) {
    const [, year, month, day, hour, minute, second = '0'] = localMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function applyLightHour(baseDate: Date, lightHour?: string | number): Date {
  const numericHour = typeof lightHour === 'string' ? Number.parseFloat(lightHour) : lightHour;
  if (numericHour === undefined || !Number.isFinite(numericHour)) {
    return baseDate;
  }

  const normalizedHour = ((numericHour % 24) + 24) % 24;
  const totalSeconds = Math.round(normalizedHour * 3600);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const resolved = new Date(baseDate.getTime());
  resolved.setHours(hours, minutes, seconds, 0);
  return resolved;
}

export function resolveWorldLightingDate(
  worldMetadata?: Record<string, string>,
  wallClockAt?: string,
): Date {
  const baseDate = parseWorldTimeValue(worldMetadata?.world_time)
    ?? parseWorldTimeValue(wallClockAt)
    ?? new Date();

  return applyLightHour(baseDate, worldMetadata?.light_hour);
}
