export const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 7] as const;

export const SHORT_DAY_NAMES = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;
export const FULL_DAY_NAMES = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'] as const;

export function appDayFromDate(dateValue: string) {
  const jsDay = new Date(dateValue).getDay();
  return jsDay === 0 ? 7 : jsDay;
}
