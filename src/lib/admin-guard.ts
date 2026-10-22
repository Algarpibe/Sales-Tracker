export const SELF_ADMIN_CHANGE = "No puedes modificar tu propia cuenta de administrador.";
export const LAST_ACTIVE_ADMIN = "La empresa debe conservar al menos un administrador activo.";

/**
 * Decide si un administrador puede aplicar un cambio de cuenta (rol, desactivar,
 * borrar) sobre `targetId`. Devuelve el mensaje de rechazo o null si se permite.
 *
 * - Nunca sobre la propia cuenta: recuperarla exigiría SQL a mano.
 * - Nunca un cambio que deje a la empresa sin administradores activos.
 *   `activeAdminIds` son los admins activos de la empresa leídos bajo bloqueo en la
 *   misma transacción que la escritura, para que dos admins no se degraden a la vez.
 */
export function adminChangeError(input: {
  actorId: string;
  targetId: string;
  /** El cambio quita al destino de los administradores activos. */
  removesAdmin: boolean;
  activeAdminIds: string[];
}): string | null {
  const { actorId, targetId, removesAdmin, activeAdminIds } = input;
  if (actorId === targetId) return SELF_ADMIN_CHANGE;
  if (removesAdmin && activeAdminIds.includes(targetId)) {
    const remaining = activeAdminIds.filter((id) => id !== targetId).length;
    if (remaining === 0) return LAST_ACTIVE_ADMIN;
  }
  return null;
}
