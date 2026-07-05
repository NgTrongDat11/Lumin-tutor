import type { AdminStatsResponse, PrivateRequestStatus } from '../types';

export const emptyAdminStats: AdminStatsResponse = {
  users_by_role: {},
  total_users: 0,
  active_staff: 0,
  suspended_staff: 0,
  classes_by_status: {},
  paid_revenue: 0,
  pending_tutors: 0,
  payment_queue: 0,
  pending_contracts: 0,
  audit_log_count: 0,
};

const privateRequestContactStatuses: ReadonlySet<PrivateRequestStatus> = new Set([
  'SCHEDULE_PROPOSED',
  'TUTOR_CONFIRMED',
  'PAID',
  'ONGOING',
  'COMPLETED',
]);

export function isPrivateRequestContactVisible(status: PrivateRequestStatus) {
  return privateRequestContactStatuses.has(status);
}
