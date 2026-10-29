import fs from 'node:fs'
import path from 'node:path'
import { serve, ok, fail, run, formatRun } from '../sdk.mjs'

function safeJoin(root, rel = '.') {
  const abs = path.resolve(root, rel || '.')
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`path escapes project: ${rel}`)
  return abs
}

function writeFile(root, rel, content) {
  const abs = safeJoin(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
}

function appName(value) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : 'KS App'
  return raw.replace(/["\\\n\r]/g, '')
}

function packageName(value, fallback = 'com.example.ksapp') {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback
  const parts = raw
    .split('.')
    .map((part) => part.replace(/[^A-Za-z0-9_]/g, ''))
    .filter(Boolean)
  return parts.length >= 2 ? parts.join('.').toLowerCase() : fallback
}

function appRoot(project, args) {
  return safeJoin(project, typeof args.path === 'string' ? args.path : 'android')
}

function detectPackage(root) {
  const buildFile = path.join(root, 'app', 'build.gradle.kts')
  if (!fs.existsSync(buildFile)) return null
  const match = fs.readFileSync(buildFile, 'utf8').match(/applicationId\s*=\s*"([^"]+)"/)
  return match ? match[1] : null
}

serve({
  async call(name, args, params) {
    const project = path.resolve(params.projectPath ?? '')
    if (!fs.existsSync(project)) return fail(`project not found: ${project}`)

    if (name === 'scaffold') {
      const root = appRoot(project, args)
      if (fs.existsSync(path.join(root, 'app', 'build.gradle.kts')) && args.force !== true) {
        return fail(`Android project already exists in ${path.relative(project, root)}; pass force:true to overwrite`)
      }
      const displayName = appName(args.name)
      const pkg = packageName(args.packageName)
      const pkgDir = path.join(root, 'app', 'src', 'main', 'java', ...pkg.split('.'))

      writeFile(
        root,
        'settings.gradle.kts',
        `pluginManagement {\n    repositories {\n        google()\n        mavenCentral()\n        gradlePluginPortal()\n    }\n}\n\ndependencyResolutionManagement {\n    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)\n    repositories {\n        google()\n        mavenCentral()\n    }\n}\n\nrootProject.name = "${displayName.replace(/\s+/g, '')}"\ninclude(":app")\n`
      )
      writeFile(
        root,
        'build.gradle.kts',
        `plugins {\n    id("com.android.application") version "8.7.3" apply false\n    id("org.jetbrains.kotlin.android") version "2.0.21" apply false\n    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false\n}\n`
      )
      writeFile(
        root,
        'gradle.properties',
        `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nkotlin.code.style=official\nandroid.nonTransitiveRClass=true\n`
      )
      writeFile(
        root,
        'app/build.gradle.kts',
        `plugins {\n    id("com.android.application")\n    id("org.jetbrains.kotlin.android")\n    id("org.jetbrains.kotlin.plugin.compose")\n}\n\nandroid {\n    namespace = "${pkg}"\n    compileSdk = 35\n\n    defaultConfig {\n        applicationId = "${pkg}"\n        minSdk = 24\n        targetSdk = 35\n        versionCode = 1\n        versionName = "1.0"\n    }\n\n    buildFeatures {\n        compose = true\n    }\n\n    compileOptions {\n        sourceCompatibility = JavaVersion.VERSION_17\n        targetCompatibility = JavaVersion.VERSION_17\n    }\n\n    kotlinOptions {\n        jvmTarget = "17"\n    }\n}\n\ndependencies {\n    implementation(platform("androidx.compose:compose-bom:2024.12.01"))\n    implementation("androidx.activity:activity-compose:1.9.3")\n    implementation("androidx.compose.ui:ui")\n    implementation("androidx.compose.ui:ui-tooling-preview")\n    implementation("androidx.compose.material3:material3")\n    debugImplementation("androidx.compose.ui:ui-tooling")\n}\n`
      )
      writeFile(
        root,
        'app/src/main/AndroidManifest.xml',
        `<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application\n        android:allowBackup="true"\n        android:label="${displayName}"\n        android:theme="@style/Theme.KS">\n        <activity\n            android:name=".MainActivity"\n            android:exported="true">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>\n    </application>\n</manifest>\n`
      )
      writeFile(
        root,
        'app/src/main/res/values/themes.xml',
        `<resources>\n    <style name="Theme.KS" parent="android:style/Theme.Material.NoActionBar">\n        <item name="android:statusBarColor">#000000</item>\n        <item name="android:navigationBarColor">#000000</item>\n        <item name="android:windowBackground">#000000</item>\n    </style>\n</resources>\n`
      )
      fs.mkdirSync(pkgDir, { recursive: true })
      fs.writeFileSync(
        path.join(pkgDir, 'MainActivity.kt'),
        `package ${pkg}\n\nimport android.os.Bundle\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.compose.foundation.layout.Arrangement\nimport androidx.compose.foundation.layout.Column\nimport androidx.compose.foundation.layout.fillMaxSize\nimport androidx.compose.foundation.layout.padding\nimport androidx.compose.material3.Button\nimport androidx.compose.material3.MaterialTheme\nimport androidx.compose.material3.Surface\nimport androidx.compose.material3.Text\nimport androidx.compose.runtime.*\nimport androidx.compose.ui.Alignment\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.unit.dp\n\nclass MainActivity : ComponentActivity() {\n    override fun onCreate(savedInstanceState: Bundle?) {\n        super.onCreate(savedInstanceState)\n        setContent {\n            MaterialTheme {\n                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {\n                    App()\n                }\n            }\n        }\n    }\n}\n\n@Composable\nfun App() {\n    var count by remember { mutableIntStateOf(0) }\n    Column(\n        modifier = Modifier.fillMaxSize().padding(24.dp),\n        verticalArrangement = Arrangement.Center,\n        horizontalAlignment = Alignment.CenterHorizontally\n    ) {\n        Text("${displayName}", style = MaterialTheme.typography.headlineMedium)\n        Text("Scaffolded by KS Agent", modifier = Modifier.padding(8.dp))\n        Button(onClick = { count++ }) {\n            Text(\"count is $count\")\n        }\n    }\n}\n`,
        'utf8'
      )
      return ok(
        `Created Android app "${displayName}" (${pkg}) in ${path.relative(project, root) || '.'}\n` +
          `Next: ext_android_build (needs Android SDK + Gradle), ext_android_devices, ext_android_install, ext_android_launch.`
      )
    }

    if (name === 'build') {
      const root = appRoot(project, args)
      if (!fs.existsSync(path.join(root, 'app', 'build.gradle.kts'))) {
        return fail('Android project not found; run scaffold first')
      }
      const wrapper = path.join(root, 'gradlew')
      const result = fs.existsSync(wrapper)
        ? await run('sh', ['./gradlew', 'assembleDebug', '--no-daemon'], { cwd: root, timeoutMs: 900_000 })
        : await run('gradle', ['assembleDebug', '--no-daemon'], { cwd: root, timeoutMs: 900_000 })
      if (result.code !== 0) {
        return fail(
          `${formatRun(result)}\n\nIf Gradle is missing, install it or open the project in Android Studio (which provides a wrapper).`
        )
      }
      const apk = path.join(root, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
      return ok(`${formatRun(result)}\n\napk: ${fs.existsSync(apk) ? path.relative(project, apk) : '(not found)'}`)
    }

    if (name === 'devices') {
      const result = await run('adb', ['devices', '-l'], { timeoutMs: 30_000 })
      return result.code === 0 ? ok(formatRun(result)) : fail(formatRun(result))
    }

    if (name === 'install') {
      const root = appRoot(project, args)
      const apk = path.join(root, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
      if (!fs.existsSync(apk)) return fail('debug APK not found; run ext_android_build first')
      const result = await run('adb', ['install', '-r', apk], { timeoutMs: 300_000 })
      return result.code === 0 ? ok(formatRun(result)) : fail(formatRun(result))
    }

    if (name === 'launch') {
      const root = appRoot(project, args)
      const pkg = typeof args.packageName === 'string' && args.packageName.trim() ? args.packageName.trim() : detectPackage(root)
      if (!pkg) return fail('could not detect applicationId; pass packageName')
      const result = await run('adb', ['shell', 'am', 'start', '-n', `${pkg}/.MainActivity`], { timeoutMs: 30_000 })
      return result.code === 0 ? ok(formatRun(result)) : fail(formatRun(result))
    }

    if (name === 'logs') {
      const lines = Math.min(1000, Math.max(10, Number(args.lines) || 100))
      const result = await run('adb', ['logcat', '-d', '-t', String(lines)], { timeoutMs: 30_000 })
      return result.code === 0 ? ok(formatRun(result)) : fail(formatRun(result))
    }

    return fail(`unknown tool: ${name}`)
  }
})
