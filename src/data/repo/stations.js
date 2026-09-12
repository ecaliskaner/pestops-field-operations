// A monitoring point's own history: every reading ever taken there, and every
// time the device at that point was replaced.
//
// data/history.js generated both. Barcodes came out of `barcodeFor()`, a hash
// of the site id and point code, and the replacement list lived in the same
// synthetic store as the visits. The requirement behind it is real: when a
// device is lost, broken or renewed a new barcode is issued to the *same point
// number*, and the old device's readings must stay attached to that point so
// the point's timeline survives the swap.
//
// That makes the point code the identity, not the barcode — which is what lets
// this be a join rather than a derivation. Readings are `inspections` rows
// keyed by station_code; replacements are `station_replacements` rows keyed the
// same way; walking both in date order says which device was installed when.

import { supabase, run } from '../../core/supabase.js';

const REASON_LABEL = {
  lost: 'Kayıp',
  broken: 'Kırık',
  renewed: 'İstasyon Yenilendi'
};

export const replacementReasons = REASON_LABEL;

const DAY_FMT = { day: '2-digit', month: 'short', year: 'numeric' };
const trDate = (iso) => (iso ? new Date(iso).toLocaleDateString('tr-TR', DAY_FMT) : '');

/**
 * Device replacements at one facility, oldest first.
 *
 * @param {string} siteId
 * @param {string} [code] limit to one point
 * @returns {Promise<object[]>}
 */
export async function fetchReplacements(siteId, code) {
  let query = supabase
    .from('station_replacements')
    .select('id, station_id, station_code, reason, old_barcode, new_barcode, replaced_on, notes')
    .eq('site_id', siteId)
    .order('replaced_on', { ascending: true });
  if (code) query = query.eq('station_code', code);

  const rows = await run(query);
  return rows.map((row) => ({
    id: row.id,
    stationId: row.station_id,
    code: row.station_code,
    reason: row.reason,
    reasonName: REASON_LABEL[row.reason] || row.reason,
    oldBarcode: row.old_barcode || '',
    newBarcode: row.new_barcode || '',
    replacedOn: row.replaced_on,
    date: trDate(row.replaced_on),
    notes: row.notes || ''
  }));
}

/**
 * Every reading ever taken at one point, oldest first, each tagged with the
 * device that was installed at the time.
 *
 * The tagging is the whole purpose. A reading is stamped with whichever barcode
 * the replacement history says was on the device when the reading was taken —
 * walked forward in date order — so swapping the hardware does not break the
 * point's timeline. A reading from before the first recorded replacement
 * carries the original barcode, which may be blank if the org never recorded
 * one. Blank is honest; a generated one would not be.
 *
 * @param {string} siteId
 * @param {string} code
 * @returns {Promise<object[]>}
 */
export async function fetchPointHistory(siteId, code) {
  const [station, swaps] = await Promise.all([
    run(
      supabase
        .from('stations')
        .select('id, code, type, device_barcode')
        .eq('site_id', siteId)
        .eq('code', code)
        .maybeSingle()
    ),
    fetchReplacements(siteId, code)
  ]);

  // station_code is unique per site, not globally, so the readings are narrowed
  // by the station row itself. A point with no station row has no history to
  // fetch — asking by code alone would pull another facility's readings in.
  if (!station?.id) return [];

  const inspections = await run(
    supabase
      .from('inspections')
      .select(`
        id, station_code, status, bait_status, pest_type, activity_count, notes, scanned_at,
        work_order:work_orders(code, visit_type, technician:technicians(full_name))
      `)
      .eq('station_id', station.id)
      .order('scanned_at', { ascending: true })
  );

  const originalBarcode = swaps.length ? swaps[0].oldBarcode : (station.device_barcode || '');

  const deviceAt = (iso) => {
    let barcode = originalBarcode;
    let generation = 1;
    for (const swap of swaps) {
      if (new Date(iso) >= new Date(swap.replacedOn)) {
        barcode = swap.newBarcode;
        generation += 1;
      }
    }
    return { barcode, generation };
  };

  return inspections.map((row) => {
    const device = deviceAt(row.scanned_at);
    const hasPest = row.pest_type && row.pest_type !== 'none';
    return {
      id: row.id,
      visitId: row.work_order?.code || '',
      visitType: row.work_order?.visit_type || '',
      tech: row.work_order?.technician?.full_name || '',
      date: trDate(row.scanned_at),
      at: row.scanned_at,
      status: row.status,
      baitStatus: row.bait_status,
      pestCount: Number(row.activity_count) || 0,
      pestName: hasPest ? row.pest_type : 'Aktivite Yok',
      notes: row.notes || '',
      generation: device.generation,
      barcode: device.barcode
    };
  });
}

/**
 * A point's life summarised per device generation: how many readings and how
 * much activity each installed device saw.
 *
 * @param {string} siteId
 * @param {string} code
 * @returns {Promise<object>}
 */
export async function fetchPointSummary(siteId, code) {
  const [readings, replacements] = await Promise.all([
    fetchPointHistory(siteId, code),
    fetchReplacements(siteId, code)
  ]);

  const generations = new Map();
  for (const rd of readings) {
    const g = generations.get(rd.generation) || {
      generation: rd.generation, barcode: rd.barcode,
      readings: 0, totalPests: 0, firstDate: rd.date, lastDate: rd.date
    };
    g.readings += 1;
    g.totalPests += rd.pestCount;
    g.lastDate = rd.date;
    generations.set(rd.generation, g);
  }

  return {
    code,
    siteId,
    totalReadings: readings.length,
    totalPests: readings.reduce((s, r) => s + r.pestCount, 0),
    generations: [...generations.values()].sort((a, b) => a.generation - b.generation),
    replacements
  };
}

/**
 * Record that the device at a point was replaced.
 *
 * Goes through replace_station_device(), which writes the replacement row and
 * moves the barcode onto the station in one transaction — a replacement record
 * whose station still carries the old barcode would misreport what is
 * physically at the point.
 *
 * @param {{stationId: string, reason: 'lost'|'broken'|'renewed',
 *   newBarcode: string, notes?: string}} input
 * @returns {Promise<object>}
 */
export async function replaceStationDevice(input) {
  const row = await run(
    supabase.rpc('replace_station_device', {
      p_station: input.stationId,
      p_reason: input.reason,
      p_new_barcode: input.newBarcode,
      p_notes: input.notes || ''
    })
  );
  return Array.isArray(row) ? row[0] : row;
}

/**
 * Every device replacement the signed-in user can see, across the portfolio.
 *
 * The printed report builders (views/reportBodies.js) are synchronous and read
 * these from the data/history.js store, so they are loaded once at sign-in
 * alongside the visit history.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchAllReplacements() {
  const rows = await run(
    supabase
      .from('station_replacements')
      .select('id, site_id, station_id, station_code, reason, old_barcode, new_barcode, replaced_on, notes')
      .order('replaced_on', { ascending: true })
  );
  return rows.map((row) => ({
    id: row.id,
    siteId: row.site_id,
    stationId: row.station_id,
    code: row.station_code,
    reason: row.reason,
    reasonName: REASON_LABEL[row.reason] || row.reason,
    oldBarcode: row.old_barcode || '',
    newBarcode: row.new_barcode || '',
    replacedOn: row.replaced_on,
    date: trDate(row.replaced_on),
    notes: row.notes || ''
  }));
}
