import { readdir, unlink } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { ensureFaultReportTable } from '@/server/floor/faultReports'
import { publicUploadsRoot } from '@/server/uploadPaths'

/** Fault-report videos older than this many days are removed (photos are kept). */
export const FAULT_VIDEO_KEEP_DAYS = 90

const VIDEO_FILE = /^fault-(\d{4})(\d{2})(\d{2})-[a-f0-9]+\.(mp4|mov|webm)$/i

/**
 * Removes fault videos older than 90 days so the server disk does not fill up.
 * The day comes from the file name (fault-YYYYMMDD-…), so a file restored from a backup
 * is not treated as new. The report first stops pointing at the video, then the file is
 * deleted; the report's note, voice text and photos stay. Never throws.
 */
export async function removeOldFaultVideos(now = new Date()): Promise<number> {
  try {
    const dir = path.join(publicUploadsRoot(), 'faults')
    const names = await readdir(dir).catch(() => [] as string[])
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - FAULT_VIDEO_KEEP_DAYS)
    const cutoffKey = `${cutoff.getFullYear()}${String(cutoff.getMonth() + 1).padStart(2, '0')}${String(cutoff.getDate()).padStart(2, '0')}`
    const old = names.filter((n) => {
      const m = VIDEO_FILE.exec(n)
      return Boolean(m) && `${m![1]}${m![2]}${m![3]}` < cutoffKey
    })
    if (old.length === 0) return 0

    const urls = old.map((n) => `/uploads/faults/${n}`)
    await ensureFaultReportTable()
    await prisma.$executeRawUnsafe(
      `UPDATE "floor_fault_reports"
       SET "media" = COALESCE(
         (SELECT jsonb_agg(m) FROM jsonb_array_elements("media") m WHERE NOT (m->>'url' = ANY($1::text[]))),
         '[]'::jsonb)
       WHERE EXISTS (SELECT 1 FROM jsonb_array_elements("media") m WHERE m->>'url' = ANY($1::text[]))`,
      urls
    )
    let removed = 0
    for (const n of old) {
      try {
        await unlink(path.join(dir, n))
        removed++
      } catch {
        // already gone — fine
      }
    }
    console.log(`[faults] removed ${removed} video(s) older than ${FAULT_VIDEO_KEEP_DAYS} days`)
    return removed
  } catch (err) {
    console.error('[faults] old video cleanup skipped (app continues)', err)
    return 0
  }
}

let timer: ReturnType<typeof setInterval> | null = null

/** Run once now and then once a day while the app is up. */
export function scheduleFaultVideoCleanup(): void {
  if (timer) return
  void removeOldFaultVideos()
  timer = setInterval(() => void removeOldFaultVideos(), 24 * 60 * 60 * 1000)
  timer.unref?.()
}
