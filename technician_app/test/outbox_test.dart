// The offline outbox — the one component in this app where a bug costs
// evidence rather than convenience.
//
// A technician works in basements and cold stores. They scan a QR, record
// inspections and close the visit with no signal, and every one of those is a
// compliance record: `real_work_started_at` is written only by the first QR
// scan, and an inspection is what a customer's report and a BRCGS audit are
// built from. So the queue has two jobs that pull in opposite directions — lose
// nothing, and send nothing twice — and until now nothing tested either.
//
// These tests cover the queue's own contract. The exactly-once half is finished
// server-side: save_inspection() looks up mobile_event_id first and returns the
// existing row rather than inserting again, so a replay is a no-op. That makes
// the client's side of the bargain precisely this: the id must be stable across
// a restart, and the capture time must survive to the sync.

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:technician_app/services/outbox.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('a queued event survives the app being killed and reopened', () async {
    final first = Outbox();
    await first.load();
    final queued = await first.add(
      type: 'inspection',
      label: 'R-01 denetimi',
      payload: {'workOrderId': 'wo-1', 'stationCode': 'R-01', 'status': 'clean'},
    );

    // A second instance reading the same store is what a cold start looks like.
    final reopened = Outbox();
    await reopened.load();

    expect(reopened.length, 1);
    final restored = reopened.events.single;
    expect(restored.mobileEventId, queued.mobileEventId,
        reason: 'the id must survive the restart, or the replay double-writes');
    expect(restored.capturedAt, queued.capturedAt);
    expect(restored.payload['stationCode'], 'R-01');
  });

  test('the capture time is the moment of capture, not the moment of sync', () async {
    final outbox = Outbox();
    await outbox.load();

    // A reading taken in a cellar at 08:40 and synced at 17:00 must still say
    // 08:40 — save_inspection() stores it as scanned_at, and a visit report
    // that shifts every reading to the end of the day is a false record.
    const capturedAt = '2026-09-12T08:40:00.000Z';
    await outbox.add(
      type: 'qr_scan',
      label: 'R-01 okutuldu',
      payload: {'workOrderId': 'wo-1', 'stationCode': 'R-01'},
      capturedAt: capturedAt,
    );

    final reopened = Outbox();
    await reopened.load();
    expect(reopened.events.single.capturedAt, capturedAt);
    expect(reopened.events.single.toSyncEvent()['capturedAt'], capturedAt);
  });

  test('every generated event id is distinct', () async {
    // Two readings taken in the same millisecond must not collide: the server
    // dedups on this id, so a collision would silently discard the second.
    final ids = <String>{};
    for (var i = 0; i < 2000; i++) {
      ids.add(Outbox.newEventId());
    }
    expect(ids.length, 2000);
  });

  test('removing one acknowledged event leaves the rest queued', () async {
    final outbox = Outbox();
    await outbox.load();
    final a = await outbox.add(type: 'qr_scan', label: 'A', payload: {'stationCode': 'R-01'});
    final b = await outbox.add(type: 'inspection', label: 'B', payload: {'stationCode': 'R-02'});
    final c = await outbox.add(type: 'arrive', label: 'C', payload: {'lat': 41.0, 'lng': 29.0});

    // Draining stops at the first connectivity failure, so a partial drain must
    // leave exactly the unsent remainder behind.
    await outbox.remove(b.mobileEventId);

    final reopened = Outbox();
    await reopened.load();
    expect(reopened.events.map((e) => e.mobileEventId), [a.mobileEventId, c.mobileEventId]);
  });

  test('the queue stays in the order the work happened', () async {
    final outbox = Outbox();
    await outbox.load();
    // Order is not cosmetic: wo_scan_qr before save_inspection is what moves the
    // work order out of started_by_first_qr, and replaying them backwards would
    // attach a reading to a visit that had not started.
    await outbox.add(type: 'arrive', label: '1', payload: {});
    await outbox.add(type: 'qr_scan', label: '2', payload: {});
    await outbox.add(type: 'inspection', label: '3', payload: {});

    final reopened = Outbox();
    await reopened.load();
    expect(reopened.events.map((e) => e.label), ['1', '2', '3']);
  });

  test('a nested payload round-trips through storage unchanged', () async {
    final outbox = Outbox();
    await outbox.load();
    await outbox.add(
      type: 'inspection',
      label: 'R-07',
      payload: {
        'workOrderId': 'wo-9',
        'stationCode': 'R-07',
        'status': 'activity',
        'pestType': 'mouse',
        'activityCount': 3,
        'notes': 'Kapı eşiğinde kemirilme — tırnak işareti "belirgin"',
        'photoCount': 2,
      },
    );

    final reopened = Outbox();
    await reopened.load();
    final p = reopened.events.single.payload;
    expect(p['activityCount'], 3);
    expect(p['photoCount'], 2);
    expect(p['pestType'], 'mouse');
    // Quotes and non-ASCII must survive the JSON round-trip: this is free-text
    // a technician typed, and it ends up on the customer's report.
    expect(p['notes'], 'Kapı eşiğinde kemirilme — tırnak işareti "belirgin"');
  });

  test('clearing empties the queue in storage, not just in memory', () async {
    final outbox = Outbox();
    await outbox.load();
    await outbox.add(type: 'qr_scan', label: 'A', payload: {});
    await outbox.clear();

    final reopened = Outbox();
    await reopened.load();
    expect(reopened.isEmpty, isTrue);
  });

  test('an empty store loads as an empty queue rather than throwing', () async {
    final outbox = Outbox();
    await outbox.load();
    expect(outbox.isEmpty, isTrue);
    expect(outbox.length, 0);
  });
}
