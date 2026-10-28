import { redirect } from 'next/navigation'

/** The archive moved out of Administration (others can be given View on it). */
export default function OldQualityArchiveLink() {
  redirect('/quality-archive')
}
