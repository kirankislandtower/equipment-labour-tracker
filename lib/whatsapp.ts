import { Linking } from 'react-native';

// wa.me needs just digits with country code -- no +, spaces, or dashes -- so this
// strips whatever formatting the number was saved with before building the link.
// WhatsApp has no free bulk-send API -- wa.me only ever opens one chat, pre-filled
// and ready, but still needs a human tap on Send. This is the fastest that's
// actually possible without the paid WhatsApp Business API.
export const openWhatsApp = (phone: string, message?: string) => {
  const digitsOnly = phone.replace(/[^0-9]/g, '');
  if (!digitsOnly) return;
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  Linking.openURL(`https://wa.me/${digitsOnly}${query}`);
};
