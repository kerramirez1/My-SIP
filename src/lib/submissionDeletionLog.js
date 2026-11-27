/**
 * Persists the coordinator's administrative reason for deleting a submission
 * record into public.submission_deletion_logs.
 *
 * This must be called BEFORE the record itself is deleted: when the insert
 * fails, the caller aborts the deletion so no removal goes unrecorded. The
 * log row deliberately snapshots the record and intern identity (no foreign
 * key on record_id) so it survives the deletion it describes.
 *
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   coordinatorProfile: { id: string, full_name: string },
 *   deleteTarget: {
 *     tableName: string,
 *     id: string,
 *     typeLabel: string,
 *     shortTitle?: string | null,
 *     internId?: string | null,
 *     internName: string,
 *     status: string,
 *   },
 *   reason: string,
 * }} args
 * @returns {Promise<{ error: unknown }>} the insert result's error, if any
 */
export async function logSubmissionDeletion({
  supabase,
  coordinatorProfile,
  deleteTarget,
  reason,
}) {
  const { error } = await supabase.from('submission_deletion_logs').insert({
    record_table: deleteTarget.tableName,
    record_id: deleteTarget.id,
    record_type_label: deleteTarget.typeLabel,
    record_title: deleteTarget.shortTitle ?? null,
    intern_id: deleteTarget.internId ?? null,
    intern_name: deleteTarget.internName,
    status_at_deletion: deleteTarget.status,
    reason: String(reason ?? '').trim(),
    performed_by: coordinatorProfile.id,
    performed_by_name: coordinatorProfile.full_name,
  })

  return { error }
}
