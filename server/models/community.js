/**
 * Community model for the backend
 */

export function communityShape(id, name, shortName, ownerAdminId) {
  return {
    id,
    name,
    shortName,
    description: '',
    ownerAdminId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function validateCommunity(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['Not an object'] };
  if (typeof obj.id !== 'string' || !obj.id) errors.push('Missing id');
  if (typeof obj.name !== 'string' || !obj.name.trim()) errors.push('Missing name');
  if (typeof obj.ownerAdminId !== 'string' || !obj.ownerAdminId) errors.push('Missing ownerAdminId');
  return { valid: errors.length === 0, errors };
}
