import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';

import '../services/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class QrScanScreen extends StatefulWidget {
  final String workOrderId;
  const QrScanScreen({super.key, required this.workOrderId});
  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _handling = false;
  final _manual = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    _manual.dispose();
    super.dispose();
  }

  Future<void> _submit(String code) async {
    if (_handling || code.trim().isEmpty) return;
    setState(() => _handling = true);
    final st = context.read<AppState>();
    final w = st.jobById(widget.workOrderId);
    if (w == null) return;
    final res = await st.qrScan(w, code);
    if (!mounted) return;
    if (!res.ok) {
      showSnack(context, res.message, error: true);
      setState(() => _handling = false);
      return;
    }
    if (res.isFirstScan) {
      await _celebrateFirstScan(res.message);
    } else {
      showSnack(context, res.message);
    }
    if (mounted) Navigator.pop(context);
  }

  Future<void> _celebrateFirstScan(String message) async {
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        icon: const Icon(Icons.verified, color: AppColors.success, size: 48),
        title: const Text('İş Başladı', textAlign: TextAlign.center),
        content: Text(message, textAlign: TextAlign.center),
        actions: [
          Center(child: FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Devam et'))),
        ],
      ),
    );
  }

  void _manualEntry() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (c) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom, left: 20, right: 20, top: 20),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Manuel kod girişi', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          TextField(
            controller: _manual,
            autofocus: true,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(labelText: 'İstasyon kodu (örn. R-01)', prefixIcon: Icon(Icons.qr_code)),
            onSubmitted: (v) { Navigator.pop(c); _submit(v); },
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: () { Navigator.pop(c); _submit(_manual.text); }, child: const Text('Onayla')),
          const SizedBox(height: 20),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final st = context.watch<AppState>();
    final w = st.jobById(widget.workOrderId);
    final firstNeeded = w != null && !w.started;
    return Scaffold(
      appBar: AppBar(
        title: Text(firstNeeded ? 'İlk QR — İşi Başlat' : 'İstasyon QR Tara'),
        actions: [
          IconButton(icon: const Icon(Icons.cameraswitch), onPressed: () => _controller.switchCamera()),
          IconButton(icon: const Icon(Icons.flash_on), onPressed: () => _controller.toggleTorch()),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: Stack(
              alignment: Alignment.center,
              children: [
                MobileScanner(
                  controller: _controller,
                  onDetect: (capture) {
                    final code = capture.barcodes.isNotEmpty ? capture.barcodes.first.rawValue : null;
                    if (code != null) _submit(code);
                  },
                  errorBuilder: (context, error) => _CameraFallback(onManual: _manualEntry, error: error),
                ),
                // Reticle
                Container(
                  width: 220,
                  height: 220,
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.white, width: 3),
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                if (_handling) const CircularProgressIndicator(color: Colors.white),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            color: AppColors.primary,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              if (firstNeeded)
                const Text('İlk QR okutulduğunda gerçek iş başlangıcı kaydedilecek.',
                    textAlign: TextAlign.center, style: TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white54)),
                icon: const Icon(Icons.keyboard),
                label: const Text('Manuel kod gir'),
                onPressed: _manualEntry,
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _CameraFallback extends StatelessWidget {
  final VoidCallback onManual;
  final Object error;
  const _CameraFallback({required this.onManual, required this.error});
  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black87,
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        const Icon(Icons.no_photography, color: Colors.white54, size: 48),
        const SizedBox(height: 12),
        const Text('Kameraya erişilemedi.', style: TextStyle(color: Colors.white, fontSize: 16)),
        const SizedBox(height: 4),
        const Text('Manuel kod girişini kullanın.', style: TextStyle(color: Colors.white54, fontSize: 12)),
        const SizedBox(height: 16),
        FilledButton.icon(icon: const Icon(Icons.keyboard), label: const Text('Manuel kod gir'), onPressed: onManual),
      ]),
    );
  }
}
