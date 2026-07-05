/**
 * Skeleton loading components — shimmer placeholders for cloud DB latency.
 * Replaces blank screens with recognisable layout shapes while data loads.
 */

/* ── Base skeleton bar ────────────────────────── */

interface SkeletonProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

export default function Skeleton({ className = '', rounded = 'md' }: SkeletonProps) {
  const radius = { sm: 'rounded', md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full' };
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-surface-secondary via-border-light to-surface-secondary bg-[length:200%_100%] ${radius[rounded]} ${className}`}
      style={{ animationDuration: '1.5s' }}
    />
  );
}

/* ── Preset skeletons ─────────────────────────── */

/** 4 metric tiles + card grid — Dashboards, Opportunities */
export function DashboardSkeleton() {
  return (
    <div className="animate-slide-up space-y-6">
      {/* Metric tiles */}
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border-light bg-white p-5">
            <Skeleton className="mb-3 h-10 w-10" rounded="lg" />
            <Skeleton className="mb-2 h-8 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      {/* Tab bar */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-28" rounded="full" />
        ))}
      </div>
      {/* Content cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border-light bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-72" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-8 w-20 shrink-0" rounded="lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Card grid — Browse classes, tutors, MyLearning */
export function CardGridSkeleton({ cols = 3, count = 6 }: { cols?: 2 | 3; count?: number }) {
  const grid = cols === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3';
  return (
    <div className="animate-slide-up space-y-6">
      {/* Search / filter bar */}
      <div className="rounded-xl border border-border-light bg-white p-4">
        <Skeleton className="h-12 w-full" rounded="lg" />
        <div className="mt-3 flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20" rounded="full" />
          ))}
        </div>
      </div>
      {/* Cards */}
      <div className={`grid gap-5 ${grid}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border-light bg-white p-5">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-10 w-10 shrink-0" rounded="full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-4 h-3 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16" rounded="full" />
              <Skeleton className="h-6 w-16" rounded="full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Table rows — Payments, Contracts, Students, Audit */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-slide-up space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3 w-60" />
        </div>
        <Skeleton className="h-9 w-28" rounded="lg" />
      </div>
      {/* Tabs */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24" rounded="full" />
        ))}
      </div>
      {/* Table */}
      <div className="rounded-lg border border-border-light bg-white overflow-hidden">
        <div className="border-b border-border-light bg-surface-secondary px-4 py-3 flex gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-20" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="border-b border-border-light px-4 py-3.5 flex items-center gap-6 last:border-b-0">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16" rounded="full" />
            <Skeleton className="h-4 w-20 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Messages — thread list + chat panel */
export function MessagesSkeleton() {
  return (
    <div className="animate-slide-up grid min-h-[620px] gap-5 lg:grid-cols-[360px_1fr]">
      {/* Thread list */}
      <div className="rounded-lg border border-border-light bg-white p-4">
        <Skeleton className="mb-4 h-5 w-24" />
        <Skeleton className="mb-4 h-9 w-full" rounded="lg" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border-light p-3">
              <Skeleton className="mb-2 h-4 w-40" />
              <Skeleton className="mb-1.5 h-3 w-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
      {/* Chat panel */}
      <div className="rounded-lg border border-border-light bg-white flex flex-col">
        <div className="border-b border-border-light p-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
        <div className="flex-1 bg-surface-secondary/60 p-4 space-y-3">
          <div className="flex justify-start"><Skeleton className="h-16 w-60" rounded="lg" /></div>
          <div className="flex justify-end"><Skeleton className="h-12 w-48" rounded="lg" /></div>
          <div className="flex justify-start"><Skeleton className="h-20 w-64" rounded="lg" /></div>
          <div className="flex justify-end"><Skeleton className="h-12 w-52" rounded="lg" /></div>
        </div>
        <div className="border-t border-border-light p-4">
          <Skeleton className="h-12 w-full" rounded="lg" />
        </div>
      </div>
    </div>
  );
}

/** Form / profile page skeleton */
export function FormSkeleton() {
  return (
    <div className="animate-slide-up space-y-6">
      <div className="rounded-xl border border-border-light bg-white p-6 space-y-5">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-10 w-full" rounded="lg" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-28 ml-auto" rounded="lg" />
      </div>
    </div>
  );
}

/** Schedule / calendar skeleton */
export function ScheduleSkeleton() {
  return (
    <div className="animate-slide-up space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9" rounded="lg" />
          <Skeleton className="h-9 w-32" rounded="lg" />
          <Skeleton className="h-9 w-9" rounded="lg" />
        </div>
      </div>
      <div className="rounded-xl border border-border-light bg-white overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border-light">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="border-r border-border-light p-3 last:border-r-0">
              <Skeleton className="mx-auto h-4 w-8" />
            </div>
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, row) => (
          <div key={row} className="grid grid-cols-7 border-b border-border-light last:border-b-0">
            {Array.from({ length: 7 }).map((_, col) => (
              <div key={col} className="border-r border-border-light p-2 min-h-[80px] last:border-r-0">
                <Skeleton className="h-3 w-6 mb-2" />
                {(row + col) % 3 === 0 && <Skeleton className="h-6 w-full" rounded="md" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Student Dashboard — hero + search + results */
export function StudentDashboardSkeleton() {
  return (
    <div className="animate-slide-up space-y-6 md:space-y-8">
      {/* Hero banner */}
      <div className="rounded-xl bg-primary-950 p-5 md:p-8 lg:p-10">
        <Skeleton className="h-8 w-72 !bg-white/15" />
        <Skeleton className="mt-3 h-4 w-96 !bg-white/10" />
        <Skeleton className="mt-5 h-11 w-48 !bg-white/20" rounded="lg" />
      </div>
      {/* Search */}
      <div className="rounded-xl border border-border-light bg-white p-4">
        <Skeleton className="h-12 w-full" rounded="lg" />
        <div className="mt-3 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20" rounded="full" />
          ))}
        </div>
      </div>
      {/* Results */}
      <Skeleton className="h-7 w-40" />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border-light bg-white p-5">
            <Skeleton className="mb-3 h-5 w-40" />
            <Skeleton className="mb-2 h-3 w-full" />
            <Skeleton className="mb-4 h-3 w-2/3" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16" rounded="full" />
              <Skeleton className="h-6 w-20" rounded="full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
