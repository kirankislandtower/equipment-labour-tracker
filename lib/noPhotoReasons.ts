// Shown when a foreman tries to submit without a live photo -- keeps the photo
// requirement as the default (it's the app's main fraud-prevention signal) while
// still letting a genuinely blocked submission through, with a recorded reason
// instead of the entry just silently having no photo.
export const NO_PHOTO_REASONS = [
  'Filled out after the work was done',
  'No signal / could not take a live photo at the time',
  'Camera or phone issue',
  'Other',
];
