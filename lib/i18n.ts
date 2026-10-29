import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from '../locales/en.json';
import hi from '../locales/hi.json';

export const LANGUAGE_STORAGE_KEY = 'app_language';
export type AppLanguage = 'en' | 'hi';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

// Applies a saved language choice as soon as the app starts, before anything
// renders text -- called once from the root layout. Defaults to English
// (set above) if nothing was ever saved or AsyncStorage isn't readable yet.
export async function loadSavedLanguage() {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'en' || saved === 'hi') {
      await i18n.changeLanguage(saved);
    }
  } catch (error) {
    console.error('Error loading saved language:', error);
  }
}

export async function setAppLanguage(lang: AppLanguage) {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch (error) {
    console.error('Error saving language choice:', error);
  }
}

export default i18n;
