import { Alert, Platform } from 'react-native';

/**
 * React Native Web's Alert.alert is a no-op (see react-native-web/src/exports/Alert),
 * so error/success messages raised with it silently vanish on web -- the caller sees
 * nothing happen at all, with no indication anything failed. Falls back to the
 * browser's window.alert there instead.
 */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}: ${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}
