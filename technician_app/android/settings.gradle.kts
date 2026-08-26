pluginManagement {
    val flutterSdkPath = run {
        val properties = java.util.Properties()
        file("local.properties").inputStream().use { properties.load(it) }
        val flutterSdkPath = properties.getProperty("flutter.sdk")
        require(flutterSdkPath != null) { "flutter.sdk not set in local.properties" }
        flutterSdkPath
    }

    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    // 8.9.1+ is required by androidx.camera:camera-lifecycle 1.6.1, pulled in
    // transitively by mobile_scanner 7.x.
    id("com.android.application") version "8.9.1" apply false
    // Kotlin 2.x is required by mobile_scanner 7.x, which calls compilerOptions()
    // in the kotlin { } extension — that DSL only exists in KGP 2.0+.
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
}

include(":app")
