// URL del avatar de un perfil. Sin foto subida no se apunta a /api/avatar (que
// respondería 404 en cada carga): se usa la imagen del proveedor o nada, y la UI
// muestra las iniciales. Con foto, la URL lleva la versión (updated_at del perfil):
// /api/avatar sirve con `max-age=60` y, tras subir otra foto, la misma URL mostraría
// la anterior desde la caché del navegador.
export interface ProfileAvatarInput {
  userId: string;
  hasAvatar: boolean | null | undefined;
  /** Marca que cambia al subir otra foto (updated_at del perfil). */
  version?: string | null;
  /** Imagen del proveedor de identidad (better-auth `user.image`). */
  fallbackImage?: string | null;
}

export function profileAvatarUrl({ userId, hasAvatar, version, fallbackImage }: ProfileAvatarInput): string | null {
  if (!hasAvatar) return fallbackImage ?? null;
  const base = `/api/avatar/${userId}`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}
