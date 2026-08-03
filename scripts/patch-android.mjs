// Patches the Capacitor-generated AndroidManifest.xml to add Android Auto support.
// Run after `npx cap sync android`.
import { readFileSync, writeFileSync } from "fs";

const manifestPath = "android/app/src/main/AndroidManifest.xml";
let manifest = readFileSync(manifestPath, "utf8");

const autoMetaData = `
        <meta-data
            android:name="com.google.android.gms.car.application"
            android:resource="@xml/automotive_app_desc" />`;

const autoFeature = `    <uses-feature
        android:name="android.hardware.type.automotive"
        android:required="false" />\n`;

if (!manifest.includes("com.google.android.gms.car.application")) {
  manifest = manifest.replace("</application>", `${autoMetaData}\n    </application>`);
}

if (!manifest.includes("android.hardware.type.automotive")) {
  manifest = manifest.replace("<application", `${autoFeature}    <application`);
}

writeFileSync(manifestPath, manifest);
console.log("✅ AndroidManifest.xml patched for Android Auto support");
