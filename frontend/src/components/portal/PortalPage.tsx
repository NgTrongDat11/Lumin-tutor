import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '../ui/Icons';
import {
  addDays,
  addMonths,
  dateFromDateString,
  dateKey,
  endOfWeek,
  formatDateRange,
  formatMonthTitle,
  getMonthCalendarDays,
  isSameDate,
  startOfMonth,
  startOfWeek,
} from '../../utils/date';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

const toneClasses: Record<Tone, string> = {
  primary: 'bg-primary-50 text-primary-800 border-primary-100',
  success: 'bg-success-50 text-success-700 border-success-100',
  warning: 'bg-warning-50 text-warning-700 border-warning-100',
  danger: 'bg-danger-50 text-danger-600 border-danger-100',
  neutral: 'bg-surface-tertiary text-text-secondary border-border-light',
};

interface PortalPageProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PortalPage({ title, description, actions, children, className = '' }: PortalPageProps) {
  const hasMaxWidth = className.includes('max-w-');
  return (
    <div className={`mx-auto ${hasMaxWidth ? '' : 'max-w-none w-full'} animate-slide-up space-y-5 ${className}`}>
      <div className="px-1 py-1">
        <div className="flex flex-col gap-4 border-b border-border-light pb-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">{title}</h1>
            {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

interface MetricTileProps {
  label: string;
  value?: ReactNode;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: Tone;
  href?: string;
  onClick?: () => void;
  compact?: boolean;
  active?: boolean;
  className?: string;
}

export function MetricTile({ 
  label, 
  value, 
  hint, 
  icon: Icon, 
  tone = 'primary', 
  href, 
  onClick, 
  compact = false, 
  active = false, 
  className = '' 
}: MetricTileProps) {
  const content = compact ? (
    <div className={`flex h-full items-center gap-3 rounded-md bg-surface-secondary px-3 py-2 ${className}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${toneClasses[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        {value && <p className="text-sm font-semibold leading-5 text-text-primary">{value}</p>}
        <p className="text-xs font-medium leading-4 text-text-secondary">{label}</p>
        {hint && <p className="text-[11px] leading-4 text-text-tertiary">{hint}</p>}
      </div>
    </div>
  ) : (
    <div className={`group relative h-full overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition-all duration-300 ${
      onClick || href ? 'hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : ''
    } ${
      active
        ? tone === 'primary' ? 'border-primary-600 ring-1 ring-primary-600/30 bg-primary-50/10' :
          tone === 'success' ? 'border-success-600 ring-1 ring-success-600/30 bg-success-50/10' :
          tone === 'warning' ? 'border-warning-600 ring-1 ring-warning-600/30 bg-warning-50/10' :
          'border-text-primary ring-1 ring-text-primary/30 bg-surface-secondary/20'
        : 'border-border-light'
    } ${className}`}>
      <div className={`absolute inset-0 bg-gradient-to-br transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${
        tone === 'primary' ? 'from-primary-50/40 to-transparent' : 
        tone === 'success' ? 'from-success-50/40 to-transparent' : 
        tone === 'warning' ? 'from-warning-50/40 to-transparent' : 
        'from-surface-secondary/40 to-transparent'
      }`} />
      
      <div className="relative z-10 flex items-center gap-3.5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]} bg-opacity-20`}>
          <Icon className="h-5.5 w-5.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold tracking-tight text-text-primary leading-none">{value}</p>
          <p className="mt-1 text-xs font-semibold text-text-secondary truncate">{label}</p>
          {hint && <p className="mt-0.5 text-[11px] text-text-tertiary truncate" title={hint}>{hint}</p>}
        </div>
        {href && (
          <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-bold text-text-secondary transition-colors group-hover:bg-primary-50 group-hover:text-primary-700">
            Mở <ChevronRightIcon className="inline h-3 w-3 ml-0.5" />
          </span>
        )}
      </div>
      
      {/* Decorative Sparkline */}
      <svg className={`absolute bottom-0 right-0 h-10 w-20 translate-x-2 translate-y-2 opacity-5 pointer-events-none ${
        tone === 'primary' ? 'text-primary-700' : 
        tone === 'success' ? 'text-success-700' :
        tone === 'warning' ? 'text-warning-700' : 'text-text-secondary'
      }`} viewBox="0 0 100 50" fill="none" preserveAspectRatio="none">
        <path d="M0,50 Q20,30 40,40 T80,20 T100,10 L100,50 Z" fill="currentColor" opacity="0.2" />
        <path d="M0,50 Q20,30 40,40 T80,20 T100,10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );

  if (!href && !onClick) return content;
  if (href) return <Link to={href}>{content}</Link>;
  return (
    <button type="button" onClick={onClick} className="w-full text-left focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-xl">
      {content}
    </button>
  );
}

interface SectionPanelProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionPanel({ title, description, action, children, className = '' }: SectionPanelProps) {
  return (
    <section className={`rounded-xl bg-white p-5 md:p-6 premium-panel ${className}`}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

interface SegmentedTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: string; count?: number }[];
}

export function SegmentedTabs<T extends string>({ value, onChange, tabs }: SegmentedTabsProps<T>) {
  return (
    <div className="flex w-full sm:max-w-2xl gap-1 overflow-x-auto rounded-xl border border-border-light bg-surface-secondary/80 p-1.5 shadow-sm backdrop-blur-sm">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold transition-all duration-200 ${
              active
                ? 'bg-white text-primary-700 shadow border border-border-light/50 scale-100'
                : 'text-text-secondary hover:bg-white/60 hover:text-text-primary hover:scale-[0.98]'
            }`}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${active ? 'bg-primary-50 text-primary-700' : 'bg-surface-tertiary text-text-tertiary'}`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface WeekEvent {
  id: string | number;
  dayOfWeek: number;
  date?: string;
  title: string;
  time: string;
  meta?: string;
  tone?: Tone;
}

const dayLabels = [
  { value: 1, label: 'T2', fullLabel: 'Thứ 2' },
  { value: 2, label: 'T3', fullLabel: 'Thứ 3' },
  { value: 3, label: 'T4', fullLabel: 'Thứ 4' },
  { value: 4, label: 'T5', fullLabel: 'Thứ 5' },
  { value: 5, label: 'T6', fullLabel: 'Thứ 6' },
  { value: 6, label: 'T7', fullLabel: 'Thứ 7' },
  { value: 7, label: 'CN', fullLabel: 'Chủ nhật' },
];

interface PlannerGridProps {
  events: WeekEvent[];
  emptyText: string;
  maxEventsPerDay: number;
  weekStart?: Date;
  onEventClick?: (event: WeekEvent) => void;
}

function eventMatchesDay(event: WeekEvent, dayValue: number, dayDate?: Date) {
  if (!event.date || !dayDate) return event.dayOfWeek === dayValue;
  return dateKey(dateFromDateString(event.date)) === dateKey(dayDate);
}

function CalendarEventTile({
  event,
  onEventClick,
  compact = false,
}: {
  event: WeekEvent;
  onEventClick?: (event: WeekEvent) => void;
  compact?: boolean;
}) {
  const tileClassName = `rounded-md border ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'} ${toneClasses[event.tone || 'primary']}`;
  const content = compact ? (
    <>
      <p className="truncate text-xs font-bold">{event.time}</p>
      <p className="mt-0.5 truncate text-xs">{event.title}</p>
    </>
  ) : (
    <>
      <p className="truncate text-xs font-bold">{event.time}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-4">{event.title}</p>
      {event.meta && <p className="mt-1 truncate text-[11px] opacity-75">{event.meta}</p>}
    </>
  );

  if (!onEventClick) {
    return <div className={tileClassName}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onEventClick(event)}
      title={`${event.time} - ${event.title}`}
      aria-label={`Xem chi tiết ${event.title}, ${event.time}`}
      className={`${tileClassName} block w-full text-left transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30`}
    >
      {content}
    </button>
  );
}

function WeekGrid({ events, emptyText, maxEventsPerDay, weekStart, onEventClick }: PlannerGridProps) {
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {dayLabels.map((day, index) => {
        const dayDate = weekStart ? addDays(weekStart, index) : undefined;
        const isCurrentDay = dayDate ? isSameDate(dayDate, new Date()) : false;
        const dayEvents = events.filter((event) => eventMatchesDay(event, day.value, dayDate));
        const visibleEvents = dayEvents.slice(0, maxEventsPerDay);
        const hiddenCount = Math.max(dayEvents.length - visibleEvents.length, 0);
        return (
          <div
            key={day.value}
            className={`min-h-[148px] rounded-lg border p-3 ${
              isCurrentDay ? 'border-primary-200 bg-primary-50/35' : 'border-border-light bg-surface-secondary'
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-text-primary">{day.label}</p>
                {dayDate && <p className="mt-0.5 text-[11px] font-medium text-text-tertiary">{dayDate.getDate()}/{dayDate.getMonth() + 1}</p>}
              </div>
              <span className="text-xs font-semibold text-text-tertiary">{dayEvents.length}</span>
            </div>
            {dayEvents.length === 0 ? (
              <p className="text-xs leading-5 text-text-tertiary">{emptyText}</p>
            ) : (
              <div className="space-y-2">
                {visibleEvents.map((event) => (
                  <CalendarEventTile key={event.id} event={event} onEventClick={onEventClick} />
                ))}
                {hiddenCount > 0 && (
                  <div className="rounded-md border border-border-light bg-white px-2.5 py-2 text-xs font-semibold text-text-secondary">
                    +{hiddenCount} buổi nữa
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({
  events,
  currentMonth,
  emptyText,
  maxEventsPerDay,
  onEventClick,
}: {
  events: WeekEvent[];
  currentMonth: Date;
  emptyText: string;
  maxEventsPerDay: number;
  onEventClick?: (event: WeekEvent) => void;
}) {
  const datedEventsByDay = useMemo(() => {
    const groups = new Map<string, WeekEvent[]>();
    events.forEach((event) => {
      if (!event.date) return;
      const key = dateKey(dateFromDateString(event.date));
      const current = groups.get(key) ?? [];
      current.push(event);
      groups.set(key, current);
    });
    return groups;
  }, [events]);

  const days = useMemo(() => getMonthCalendarDays(currentMonth), [currentMonth]);

  return (
    <div className="overflow-hidden rounded-lg border border-border-light bg-white">
      <div className="overflow-x-auto">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-7 border-b border-border-light bg-surface-secondary">
            {dayLabels.map((day) => (
              <div key={day.value} className="border-r border-border-light p-3 text-center text-xs font-bold text-text-secondary last:border-r-0">
                {day.fullLabel}
              </div>
            ))}
          </div>

          {events.length === 0 && (
            <div className="border-b border-border-light bg-surface-secondary/55 px-4 py-3 text-center text-sm text-text-tertiary">
              {emptyText}
            </div>
          )}

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = dateKey(day);
              const dayEvents = datedEventsByDay.get(key) ?? [];
              const visibleEvents = dayEvents.slice(0, maxEventsPerDay);
              const hiddenCount = Math.max(dayEvents.length - visibleEvents.length, 0);
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
              const isCurrentDay = isSameDate(day, new Date());

              return (
                <div
                  key={key}
                  className={`min-h-[138px] border-r border-b border-border-light p-2 last:border-r-0 ${
                    isCurrentMonth ? 'bg-white' : 'bg-surface-secondary/45'
                  } ${isCurrentDay ? 'bg-primary-50/50' : ''}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                      isCurrentDay ? 'bg-primary-700 text-white' : isCurrentMonth ? 'text-text-primary' : 'text-text-tertiary'
                    }`}>
                      {day.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-bold text-primary-700">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {dayEvents.length > 0 && (
                    <div className="space-y-1.5">
                    {visibleEvents.map((event) => (
                        <CalendarEventTile key={event.id} event={event} onEventClick={onEventClick} compact />
                      ))}
                      {hiddenCount > 0 && (
                        <p className="rounded-md bg-surface-secondary px-2 py-1 text-xs font-semibold text-text-tertiary">
                          +{hiddenCount} buổi nữa
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type CalendarViewMode = 'week' | 'month';

export function CalendarPlanner({
  events,
  emptyText = 'Chưa có lịch trong tuần.',
  maxEventsPerDay = 3,
  onEventClick,
}: {
  events: WeekEvent[];
  emptyText?: string;
  maxEventsPerDay?: number;
  onEventClick?: (event: WeekEvent) => void;
}) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date()));
  const [currentMonthStart, setCurrentMonthStart] = useState(() => startOfMonth(new Date()));

  const weekEnd = useMemo(() => endOfWeek(currentWeekStart), [currentWeekStart]);
  const weekEvents = useMemo(() => {
    return events.filter((event) => {
      if (!event.date) return true;
      const date = dateFromDateString(event.date);
      return date >= currentWeekStart && date <= weekEnd;
    });
  }, [currentWeekStart, events, weekEnd]);

  const monthEvents = useMemo(() => {
    return events.filter((event) => {
      if (!event.date) return false;
      const date = dateFromDateString(event.date);
      return date.getMonth() === currentMonthStart.getMonth() && date.getFullYear() === currentMonthStart.getFullYear();
    });
  }, [currentMonthStart, events]);

  const prevRange = () => {
    if (viewMode === 'week') {
      setCurrentWeekStart((current) => addDays(current, -7));
      return;
    }
    setCurrentMonthStart((current) => addMonths(current, -1));
  };

  const nextRange = () => {
    if (viewMode === 'week') {
      setCurrentWeekStart((current) => addDays(current, 7));
      return;
    }
    setCurrentMonthStart((current) => addMonths(current, 1));
  };

  const goToday = () => {
    const today = new Date();
    setCurrentWeekStart(startOfWeek(today));
    setCurrentMonthStart(startOfMonth(today));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevRange} aria-label="Kỳ trước" title="Kỳ trước">
            <ChevronLeftIcon className="h-4 w-4" />
            <span className="sr-only">Kỳ trước</span>
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Hôm nay
          </Button>
          <Button variant="outline" size="sm" onClick={nextRange} aria-label="Kỳ sau" title="Kỳ sau">
            <ChevronRightIcon className="h-4 w-4" />
            <span className="sr-only">Kỳ sau</span>
          </Button>
          <div className="flex items-center gap-2 rounded-lg bg-surface-secondary px-3 py-2 text-sm font-semibold text-text-primary">
            <CalendarIcon className="h-4 w-4 text-primary-800" />
            {viewMode === 'week' ? formatDateRange(currentWeekStart, weekEnd) : formatMonthTitle(currentMonthStart)}
          </div>
        </div>
        <SegmentedTabs
          value={viewMode}
          onChange={setViewMode}
          tabs={[
            { value: 'week', label: 'Tuần', count: weekEvents.length },
            { value: 'month', label: 'Tháng', count: monthEvents.length },
          ]}
        />
      </div>

      {viewMode === 'week' ? (
        <WeekGrid events={weekEvents} emptyText={emptyText} maxEventsPerDay={maxEventsPerDay} weekStart={currentWeekStart} onEventClick={onEventClick} />
      ) : (
        <MonthGrid events={monthEvents} currentMonth={currentMonthStart} emptyText={emptyText} maxEventsPerDay={maxEventsPerDay} onEventClick={onEventClick} />
      )}
    </div>
  );
}

export function WeekPlanner({ events, emptyText = 'Chưa có lịch trong tuần.', maxEventsPerDay = 3 }: { events: WeekEvent[]; emptyText?: string; maxEventsPerDay?: number }) {
  return <WeekGrid events={events} emptyText={emptyText} maxEventsPerDay={maxEventsPerDay} />;
}

export function EmptyPanel({ title, description, action, icon: Icon }: { title: string; description?: string; action?: ReactNode; icon?: ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-secondary/50 p-8 text-center transition-all duration-300 hover:bg-surface-secondary">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm border border-border-light text-primary-300">
        {Icon ? <Icon className="h-6 w-6" /> : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <h3 className="text-base font-bold text-text-primary">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-text-secondary">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
