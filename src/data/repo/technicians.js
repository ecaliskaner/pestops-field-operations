// Real-data bridge for technician rosters used *outside* the Ekip (team) page.
//
// src/views/team.js has its own deep, deliberately-seeded simulation (fixed
// GPS loops, hardcoded names, demo credential cards) and stays on
// src/data/seed.js's techData — wiring that view to real data is a separate,
// larger pass (tracked alongside the Dashboard work in docs/PRODUCTION.md).
//
// This module is narrower: it feeds the "Görevlendirilecek Teknisyen" picker
// in the "Yeni İş Emri" form (src/ui/modal.js) and the work-order list's tech
// column (src/views/work.js), so a real admin assigns a real technician
// instead of one of four hardcoded demo names.

import { supabase, run } from '../../core/supabase.js';

const TECHNICIAN_SELECT = 'id, full_name, initials, phone, email, color, is_active';

function mapTechnicianRow(row) {
  return {
    id: row.id,
    name: row.full_name,
    initials: row.initials || '',
    phone: row.phone || '',
    email: row.email || '',
    color: row.color || '#1769e0'
  };
}

/**
 * Every active technician in the signed-in admin/tech's org (RLS scopes
 * this — a client role has no read policy on technicians at all here).
 *
 * @returns {Promise<object[]>}
 */
export async function fetchTechnicians() {
  const rows = await run(
    supabase.from('technicians').select(TECHNICIAN_SELECT).eq('is_active', true).order('full_name')
  );
  return rows.map(mapTechnicianRow);
}
