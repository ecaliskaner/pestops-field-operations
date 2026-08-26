import 'package:flutter/material.dart';

/// Design tokens from the platform tech-doc (§8.1). Deliberately restrained:
/// light background, clear cards, status colours only.
class AppColors {
  static const primary = Color(0xFF102033); // koyu lacivert
  static const secondary = Color(0xFF64748B); // gri-mavi
  static const success = Color(0xFF22C55E); // temiz
  static const activity = Color(0xFFEF4444); // aktivite var
  static const warning = Color(0xFFF59E0B); // kontrol edilmedi
  static const bg = Color(0xFFF8FAFC);
  static const card = Color(0xFFFFFFFF);
  static const line = Color(0xFFE2E8F0);
  static const textMuted = Color(0xFF64748B);
}

ThemeData buildTheme() {
  const seed = AppColors.primary;
  final scheme = ColorScheme.fromSeed(
    seedColor: seed,
    primary: seed,
    surface: AppColors.card,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.bg,
    fontFamily: 'Roboto',
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.primary,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: AppColors.card,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.line),
      ),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.card,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.line),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        minimumSize: const Size.fromHeight(48),
        side: const BorderSide(color: AppColors.line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
  );
}

/// Maps a station/inspection status to its canonical colour.
Color statusColor(String status) {
  switch (status) {
    case 'clean':
      return AppColors.success;
    case 'activity':
      return AppColors.activity;
    case 'damaged':
    case 'missing':
      return AppColors.secondary;
    default:
      return AppColors.warning; // unchecked
  }
}
