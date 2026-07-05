const PENDING_TUTOR_REQUEST_KEY = 'lumin:pending-tutor-request:v1';

export function savePendingTutorRequest(tutorId: number) {
  window.sessionStorage.setItem(PENDING_TUTOR_REQUEST_KEY, String(tutorId));
}

export function readPendingTutorRequest() {
  const value = Number(window.sessionStorage.getItem(PENDING_TUTOR_REQUEST_KEY));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function clearPendingTutorRequest() {
  window.sessionStorage.removeItem(PENDING_TUTOR_REQUEST_KEY);
}
