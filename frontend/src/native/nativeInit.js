// Native-app polish when App-Thru runs inside the Android/iOS shell.
// On the regular website this is a no-op.
import { Capacitor } from '@capacitor/core';

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add('is-native-app');

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });          // dark icons
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#ffffff' });
    }
  } catch {}

  try {
    const { App } = await import('@capacitor/app');
    // Android hardware back: go back a screen; only leave the app from home
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && window.location.pathname !== '/') window.history.back();
      else App.exitApp();
    });
  } catch {}

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {}
}
