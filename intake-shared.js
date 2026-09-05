// Public rules shared by the form and Worker. No credentials or environment settings.
export const INTAKE_LIMITS = Object.freeze({
  maxPhotos: 30,
  maxSourceBytes: 20 * 1024 * 1024,
  maxPhotoBytes: 600000,
  maxPreviewBytes: 100000,
});
export const isValidEmail = value => typeof value === 'string' && /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(value);
export const isValidPhone = value => typeof value === 'string' && /^[+()\d\s.\-]+$/.test(value) && value.replace(/\D/g, '').length >= 7;
