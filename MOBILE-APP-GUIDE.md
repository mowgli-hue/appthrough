# App-Thru customer app — Android & iPhone

The app is a native shell around www.appthru.ca. Menu, design and checkout
changes you deploy to the website show up in the app instantly; you only
resubmit to the stores when the native shell itself changes.

Already done in the repo: Android + iOS projects (Capacitor 8, Android API 36),
app id ca.appthru.app, name "App-Thru", your logo as icon + splash, white
status bar, Android back button, offline screen, mic permission for voice
ordering.

## One-time on the Mac
    cd ~/appthrough/frontend
    npm install

## Android (Google Play)
1. Install Android Studio (developer.android.com/studio), open it once.
2. Android Studio > Open > select ~/appthrough/frontend/android
   Wait for "Gradle sync" to finish (first time ~5-10 min).
3. Test: plug in an Android phone (USB debugging on) or start an emulator, press Run.
4. Release build: Build > Generate Signed App Bundle or APK > Android App Bundle
   > Create new keystore. SAVE the .jks file + both passwords somewhere safe
   (password manager + backup). Losing it = you can never update the app.
   Build variant: release. Output: android/app/release/app-release.aab
5. play.google.com/console > Create app "App-Thru" > Food & Drink, Free.
   Production > Create release > upload the .aab.
   Store listing: icon = frontend/assets/icon.png (512px), 2+ phone screenshots,
   short description: "Order ahead at The Chai Bar. Skip the line."
   Data safety: collects name + phone (order updates); payments by Stripe.
   Review: usually 1-3 days (new developer accounts may need a 14-day
   closed test with 12 testers first — Play Console will tell you).

## iPhone (App Store)
1. Install Xcode from the Mac App Store, open it once.
2. Open ~/appthrough/frontend/ios/App/App.xcodeproj
3. Click "App" target > Signing & Capabilities > Team: your Apple Developer team.
4. Test on your iPhone (plug in, select it at top, press Run).
5. Product > Archive > Distribute App > App Store Connect > Upload.
6. appstoreconnect.apple.com > My Apps > + > New App, bundle id ca.appthru.app.
   Screenshots: 6.9" iPhone. Privacy: name, phone (order updates).
   Review notes: "Walk-up order-ahead app for The Chai Bar (3 BC locations).
   Browse a location, add items, pay by card; customers get an SMS when
   ready. Payments are for physical food (Stripe), not digital goods."

## Good to know
- Payments in the app: card + Link work. Apple Pay / Google Pay are not
  available inside app web views — they still work on the website.
- Version bumps for later updates:
  Android: android/app/build.gradle versionCode +1, versionName
  iOS: Xcode > App target > General > Version / Build
- Running `npx cap sync` later requires Node 22+.
