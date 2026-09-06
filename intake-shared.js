// Public rules shared by the form and Worker. No credentials or environment settings.
export const INTAKE_LIMITS = Object.freeze({
  maxPhotos: 30,
  maxSourceBytes: 20 * 1024 * 1024,
  maxPhotoBytes: 600000,
  maxPreviewBytes: 100000,
});
export const isValidEmail = value => typeof value === 'string' && /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(value);
export const isValidPhone = value => typeof value === 'string' && /^[+()\d\s.\-]+$/.test(value) && value.replace(/\D/g, '').length >= 7;
export const formatPhone = value => {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : value;
};
