allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// NOTE: build output must stay under the project dir — the Flutter tool looks
// for the produced .apk in <project>/build and fails with "Gradle build failed
// to produce an .apk file" if Gradle writes it elsewhere.
val newBuildDir: Directory = rootProject.layout.buildDirectory.dir("../../build").get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
