# App-Thru — Android & iPhone apps (Capacitor)

The app is a native shell that loads www.appthru.ca, so every web deploy
updates the apps instantly. One-time setup on the Mac:

## 0) One-time
    cd ~/appthrough/frontend
    npm install
    npm run build
    npx cap add android
    npx cap add ios
    npx capacitor-assets generate    # makes all icon/splash sizes from assets/

## 1) Android (Google Play)
    npx cap open android             # opens Android Studio (install it first)
  - In Android Studio: Build > Generate Signed App Bundle (.aab)
    - Create a new keystore when asked; SAVE THE KEYSTORE FILE + PASSWORDS
      somewhere safe (losing it = can never update the app).
  - Play Console (play.google.com/console):
    - Create app "App-Thru", category Food & Drink, free
    - Upload the .aab under Production > Create release
    - Store listing: use frontend/assets/icon.png, screenshots from your phone
    - Data safety: collects name, phone (for order updates), payment handled by Stripe
  - Review usually 1–3 days.

## 2) iPhone (App Store)
    npx cap open ios                 # opens Xcode (install from Mac App Store first)
  - Xcode > Signing & Capabilities: choose your Apple Developer team
  - Product > Archive > Distribute App > App Store Connect
  - appstoreconnect.apple.com: create app "App-Thru", bundle id ca.appthru.app
  - Screenshots: 6.7" iPhone shots of menu / size picker / checkout / order tracking
  - Review notes: "Walk-up ordering app for The Chai Bar restaurants (3 BC
    locations). Demo: open app, choose location, add items, pay with test order."
  - Review ~1–7 days. Physical food = Stripe card payments are ALLOWED (no
    Apple in-app purchase needed).

## Notes
  - Apple Pay doesn't work inside the app shell (Safari only) — customers in
    the app pay by card/Link; Apple Pay still works on the website. Normal.
  - App version bumps only needed when the native shell changes, not for
    menu/UI updates.
