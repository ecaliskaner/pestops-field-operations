// Location-mismatch alerts: a technician reported "tesise varıldım" but the
// device GPS puts them outside the site's geofence.
//
// The field map's poller (src/views/team.js) is what talks to
// /api/mobile/live-positions, but the notification centre (src/ui/notificationCenter.js) has
// to surface the same finding without duplicating that fetch. This module is
// the seam between them — deliberately tiny and synchronous.
//
// Nothing here is simulated: every alert originates from a real device fix the
// phone posted, measured against the site's real coordinates.

let alerts = [];

/** Replace the current alert set. Called by the live-position poller. */
export function setGpsAlerts(next) {
  alerts = Array.isArray(next) ? next : [];
}

/** Current alerts, newest state as of the last poll. */
export function getGpsAlerts() {
  return alerts;
}
