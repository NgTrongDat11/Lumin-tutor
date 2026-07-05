export function dateFromDateString(dateStr: string): Date {
  const [datePart] = dateStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) {
    const fallback = new Date(dateStr);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
  return new Date(year, month - 1, day);
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function startOfWeek(date: Date): Date {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = next.getDate() - day + (day === 0 ? -6 : 1);
  next.setDate(diff);
  return next;
}

export function endOfWeek(date: Date): Date {
  const next = addDays(startOfWeek(date), 6);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  return startOfMonth(new Date(date.getFullYear(), date.getMonth() + months, 1));
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isSameDate(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

export function formatDateRange(start: Date, end: Date): string {
  const startLabel = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`;
  const endLabel = `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}/${end.getFullYear()}`;
  return `${startLabel} - ${endLabel}`;
}

export function formatMonthTitle(date: Date): string {
  return date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
}

export function getMonthCalendarDays(monthStart: Date): Date[] {
  const first = startOfWeek(monthStart);
  const last = endOfMonth(monthStart);
  const lastCalendarDay = addDays(startOfWeek(last), 6);
  const days: Date[] = [];
  const cursor = new Date(first);
  while (cursor <= lastCalendarDay) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function isToday(dateStr: string): boolean {
  return isSameDate(dateFromDateString(dateStr), new Date());
}

export function isPast(dateStr: string): boolean {
  return dateFromDateString(dateStr) < startOfDay(new Date());
}
