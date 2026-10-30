import path from 'path'

/**
 * Where uploaded pictures live on the server.
 *
 * Bills (accounts) and profile pictures (salary) are private: they are kept OUTSIDE the
 * web folder (`<app>/private-uploads/…`), so the web server cannot hand them out by
 * itself. They open only through the app (`/uploads/<folder>/<file>`, the same links as
 * before) and only for someone logged in who may see Accounts / Salary.
 *
 * Looms, fault reports and registers stay in `public/uploads/…` as before.
 * Pictures uploaded before this change may still sit in `public/uploads/bills|profiles`;
 * the app still finds them there until they are moved.
 */
export const PRIVATE_UPLOAD_FOLDERS = ['bills', 'profiles'] as const
export type PrivateUploadFolder = (typeof PRIVATE_UPLOAD_FOLDERS)[number]

export const isPrivateUploadFolder = (folder: string): folder is PrivateUploadFolder =>
  (PRIVATE_UPLOAD_FOLDERS as readonly string[]).includes(folder)

export const publicUploadsRoot = () => path.join(process.cwd(), 'public', 'uploads')
export const privateUploadsRoot = () => path.join(process.cwd(), 'private-uploads')

/** Folder a new upload is written to. */
export function uploadDirFor(folder: string): string {
  return path.join(isPrivateUploadFolder(folder) ? privateUploadsRoot() : publicUploadsRoot(), folder)
}
