import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const BAN_DURATION_PERMANENT = '876000h'

type ServiceClient = ReturnType<typeof createClient>

interface ProfileRow {
  id: string
  full_name: string
  role: 'intern' | 'supervisor' | 'coordinator'
  supervisor_id: string | null
  student_id_no: string | null
  company_name: string | null
  school_name: string | null
  course: string | null
  internship_start_date: string | null
  required_hours: number
  is_active: boolean
  deactivated_at: string | null
  deactivated_by: string | null
  deactivated_reason: string | null
  created_at: string
}

interface RecordSummary {
  attendance: number
  accomplishments: number
  tasks: number
  assignedInterns: number
  supervisorReviews: number
  assignedTasksCreated: number
  total: number
}

function jsonResponse(payload: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function cleanOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim())
}

async function listAllAuthEmails(
  serviceClient: ServiceClient,
): Promise<Map<string, string>> {
  const emailById = new Map<string, string>()
  let page = 1
  const perPage = 1000

  while (page <= 20) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage,
    })
    if (error) {
      throw new Error(`Could not load auth user directory: ${error.message}`)
    }
    const users = data?.users ?? []
    for (const u of users) {
      if (u.id && u.email) {
        emailById.set(u.id, u.email)
      }
    }
    if (users.length < perPage) break
    page += 1
  }

  return emailById
}

async function computeRecordSummaryForUser(
  serviceClient: ServiceClient,
  targetUserId: string,
): Promise<RecordSummary> {
  const [
    attInternRes,
    accInternRes,
    taskInternRes,
    assignedInternsRes,
    attRevRes,
    accRevRes,
    taskRevRes,
    taskAssignedByRes,
  ] = await Promise.all([
    serviceClient
      .from('weekly_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('intern_id', targetUserId),
    serviceClient
      .from('accomplishments')
      .select('id', { count: 'exact', head: true })
      .eq('intern_id', targetUserId),
    serviceClient
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('intern_id', targetUserId),
    serviceClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('supervisor_id', targetUserId),
    serviceClient
      .from('weekly_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('reviewed_by', targetUserId),
    serviceClient
      .from('accomplishments')
      .select('id', { count: 'exact', head: true })
      .eq('reviewed_by', targetUserId),
    serviceClient
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('reviewed_by', targetUserId),
    serviceClient
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_by', targetUserId),
  ])

  const firstErr =
    attInternRes.error ||
    accInternRes.error ||
    taskInternRes.error ||
    assignedInternsRes.error ||
    attRevRes.error ||
    accRevRes.error ||
    taskRevRes.error ||
    taskAssignedByRes.error

  if (firstErr) {
    throw new Error(
      `Failed to verify historical internship records: ${firstErr.message}`,
    )
  }

  const attendance = attInternRes.count ?? 0
  const accomplishments = accInternRes.count ?? 0
  const tasks = taskInternRes.count ?? 0
  const assignedInterns = assignedInternsRes.count ?? 0
  const supervisorReviews =
    (attRevRes.count ?? 0) + (accRevRes.count ?? 0) + (taskRevRes.count ?? 0)
  const assignedTasksCreated = taskAssignedByRes.count ?? 0

  return {
    attendance,
    accomplishments,
    tasks,
    assignedInterns,
    supervisorReviews,
    assignedTasksCreated,
    total:
      attendance +
      accomplishments +
      tasks +
      assignedInterns +
      supervisorReviews +
      assignedTasksCreated,
  }
}

async function countOtherActiveCoordinators(
  serviceClient: ServiceClient,
  excludeUserId: string,
): Promise<number> {
  const { count, error } = await serviceClient
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'coordinator')
    .eq('is_active', true)
    .neq('id', excludeUserId)

  if (error) {
    throw new Error(`Failed to verify active coordinators: ${error.message}`)
  }

  return count ?? 0
}

async function recordAuditLog(
  serviceClient: ServiceClient,
  entry: {
    action: 'created' | 'updated' | 'deactivated' | 'reactivated' | 'deleted'
    target_user_id: string
    target_name: string
    target_email: string | null
    target_role: 'intern' | 'supervisor' | 'coordinator'
    performed_by: string
    performed_by_name: string
    reason: string | null
    metadata?: Record<string, unknown>
  },
) {
  const { error } = await serviceClient.from('account_audit_logs').insert({
    action: entry.action,
    target_user_id: entry.target_user_id,
    target_name: entry.target_name,
    target_email: entry.target_email,
    target_role: entry.target_role,
    performed_by: entry.performed_by,
    performed_by_name: entry.performed_by_name,
    reason: entry.reason,
    metadata: entry.metadata ?? {},
  })

  if (error) {
    console.error('Failed to write account_audit_logs entry:', error.message)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !/^Bearer\s+\S+/i.test(authHeader)) {
    return jsonResponse({ error: 'Missing or invalid authorization token.' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(
      { error: 'Edge Function environment is not configured.' },
      500,
    )
  }

  // 1. Authenticate caller via anon client scoped to caller JWT
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user: callerUser },
    error: callerAuthError,
  } = await callerClient.auth.getUser()

  if (callerAuthError || !callerUser) {
    return jsonResponse(
      { error: 'Unauthorized: invalid or expired session.' },
      401,
    )
  }

  // 2. Verify caller is an ACTIVE SIP Coordinator
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: callerProfile, error: callerProfileError } = await serviceClient
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', callerUser.id)
    .maybeSingle()

  if (callerProfileError) {
    return jsonResponse(
      { error: `Could not verify caller permissions: ${callerProfileError.message}` },
      500,
    )
  }

  if (
    !callerProfile ||
    callerProfile.role !== 'coordinator' ||
    callerProfile.is_active === false
  ) {
    return jsonResponse(
      { error: 'Only an active SIP Coordinator can manage portal accounts.' },
      403,
    )
  }

  const callerName =
    (callerProfile.full_name as string | undefined)?.trim() || 'SIP Coordinator'

  // 3. Parse JSON body
  let body: Record<string, unknown>
  try {
    const parsed = await req.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonResponse({ error: 'Request body must be a JSON object.' }, 400)
    }
    body = parsed as Record<string, unknown>
  } catch {
    return jsonResponse({ error: 'Invalid JSON request body.' }, 400)
  }

  const action = typeof body.action === 'string' ? body.action.trim() : ''

  try {
    // ------------------------------------------------------------------------
    // ACTION: list_accounts — enriched accounts with emails, record summaries,
    // and recent audit logs for the Coordinator Account Management page
    // ------------------------------------------------------------------------
    if (action === 'list_accounts') {
      const [
        profilesRes,
        emailById,
        attRowsRes,
        accRowsRes,
        taskRowsRes,
        auditLogsRes,
      ] = await Promise.all([
        serviceClient
          .from('profiles')
          .select(
            'id, full_name, role, supervisor_id, student_id_no, company_name, school_name, course, internship_start_date, required_hours, is_active, deactivated_at, deactivated_by, deactivated_reason, created_at',
          )
          .order('role', { ascending: true })
          .order('full_name', { ascending: true }),
        listAllAuthEmails(serviceClient),
        serviceClient
          .from('weekly_attendance')
          .select('intern_id, reviewed_by'),
        serviceClient.from('accomplishments').select('intern_id, reviewed_by'),
        serviceClient
          .from('tasks')
          .select('intern_id, assigned_by, reviewed_by'),
        serviceClient
          .from('account_audit_logs')
          .select(
            'id, action, target_user_id, target_name, target_email, target_role, performed_by, performed_by_name, reason, metadata, created_at',
          )
          .order('created_at', { ascending: false })
          .limit(30),
      ])

      if (profilesRes.error) {
        return jsonResponse(
          { error: `Failed to load accounts: ${profilesRes.error.message}` },
          500,
        )
      }

      const profiles = (profilesRes.data ?? []) as ProfileRow[]
      const summaryMap = new Map<string, RecordSummary>()
      const getSummary = (id: string): RecordSummary => {
        let s = summaryMap.get(id)
        if (!s) {
          s = {
            attendance: 0,
            accomplishments: 0,
            tasks: 0,
            assignedInterns: 0,
            supervisorReviews: 0,
            assignedTasksCreated: 0,
            total: 0,
          }
          summaryMap.set(id, s)
        }
        return s
      }

      for (const p of profiles) {
        if (p.supervisor_id) {
          getSummary(p.supervisor_id).assignedInterns += 1
        }
      }
      for (const r of attRowsRes.data ?? []) {
        if (r.intern_id) getSummary(r.intern_id).attendance += 1
        if (r.reviewed_by) getSummary(r.reviewed_by).supervisorReviews += 1
      }
      for (const r of accRowsRes.data ?? []) {
        if (r.intern_id) getSummary(r.intern_id).accomplishments += 1
        if (r.reviewed_by) getSummary(r.reviewed_by).supervisorReviews += 1
      }
      for (const r of taskRowsRes.data ?? []) {
        if (r.intern_id) getSummary(r.intern_id).tasks += 1
        if (r.assigned_by) getSummary(r.assigned_by).assignedTasksCreated += 1
        if (r.reviewed_by) getSummary(r.reviewed_by).supervisorReviews += 1
      }

      const activeCoordinatorCount = profiles.filter(
        (p) => p.role === 'coordinator' && p.is_active !== false,
      ).length

      const accounts = profiles.map((p) => {
        const s = getSummary(p.id)
        s.total =
          s.attendance +
          s.accomplishments +
          s.tasks +
          s.assignedInterns +
          s.supervisorReviews +
          s.assignedTasksCreated

        const isSelf = p.id === callerUser.id
        const isLastActiveCoordinator =
          p.role === 'coordinator' &&
          p.is_active !== false &&
          activeCoordinatorCount <= 1

        return {
          ...p,
          is_active: p.is_active !== false,
          email: emailById.get(p.id) ?? '',
          record_summary: s,
          has_historical_records: s.total > 0,
          is_self: isSelf,
          is_last_active_coordinator: isLastActiveCoordinator,
          can_permanently_delete:
            !isSelf && !isLastActiveCoordinator && s.total === 0,
        }
      })

      return jsonResponse(
        {
          accounts,
          audit_logs: auditLogsRes.error ? [] : (auditLogsRes.data ?? []),
        },
        200,
      )
    }

    // All remaining actions require a valid target_user_id
    if (!isValidUuid(body.target_user_id)) {
      return jsonResponse(
        { error: 'A valid target_user_id UUID is required.' },
        400,
      )
    }
    const targetUserId = body.target_user_id.trim()

    const { data: targetProfileData, error: targetProfileError } =
      await serviceClient
        .from('profiles')
        .select(
          'id, full_name, role, supervisor_id, student_id_no, company_name, school_name, course, internship_start_date, required_hours, is_active, deactivated_at, deactivated_by, deactivated_reason, created_at',
        )
        .eq('id', targetUserId)
        .maybeSingle()

    if (targetProfileError) {
      return jsonResponse(
        { error: `Could not look up target account: ${targetProfileError.message}` },
        500,
      )
    }

    if (!targetProfileData) {
      return jsonResponse({ error: 'Target account not found.' }, 404)
    }

    const targetProfile = targetProfileData as ProfileRow

    const { data: targetAuthRes } =
      await serviceClient.auth.admin.getUserById(targetUserId)
    const targetEmail = targetAuthRes?.user?.email ?? null

    // ------------------------------------------------------------------------
    // ACTION: inspect_account — fresh pre-flight check before Delete/View
    // ------------------------------------------------------------------------
    if (action === 'inspect_account') {
      const [recordSummary, otherActiveCoordinators] = await Promise.all([
        computeRecordSummaryForUser(serviceClient, targetUserId),
        targetProfile.role === 'coordinator' && targetProfile.is_active !== false
          ? countOtherActiveCoordinators(serviceClient, targetUserId)
          : Promise.resolve(1),
      ])

      const isSelf = targetUserId === callerUser.id
      const isLastActiveCoordinator =
        targetProfile.role === 'coordinator' &&
        targetProfile.is_active !== false &&
        otherActiveCoordinators === 0

      let blockReason = ''
      if (isSelf) {
        blockReason =
          'You cannot delete or deactivate your own currently signed-in coordinator account.'
      } else if (isLastActiveCoordinator) {
        blockReason =
          'Cannot delete or deactivate the last active SIP Coordinator account.'
      } else if (recordSummary.total > 0) {
        blockReason =
          'This account has existing internship records or assignments. Deactivate the account instead to revoke portal access while preserving historical records.'
      }

      return jsonResponse(
        {
          account: {
            ...targetProfile,
            is_active: targetProfile.is_active !== false,
            email: targetEmail ?? '',
            record_summary: recordSummary,
            has_historical_records: recordSummary.total > 0,
            is_self: isSelf,
            is_last_active_coordinator: isLastActiveCoordinator,
            can_permanently_delete:
              !isSelf && !isLastActiveCoordinator && recordSummary.total === 0,
            block_reason: blockReason,
          },
        },
        200,
      )
    }

    // ------------------------------------------------------------------------
    // ACTION: update_account — Coordinator updates intern/supervisor details
    // ------------------------------------------------------------------------
    if (action === 'update_account') {
      if (
        targetProfile.role !== 'intern' &&
        targetProfile.role !== 'supervisor'
      ) {
        return jsonResponse(
          {
            error:
              'Coordinator profile details are managed from My Profile rather than Account Management.',
          },
          400,
        )
      }

      const fullName =
        typeof body.full_name === 'string' ? body.full_name.trim() : ''
      if (!fullName) {
        return jsonResponse({ error: 'Full name is required.' }, 400)
      }

      const updates: Record<string, unknown> = {
        full_name: fullName,
        company_name: cleanOptionalText(body.company_name),
      }

      if (targetProfile.role === 'intern') {
        const supervisorId = cleanOptionalText(body.supervisor_id)
        if (!supervisorId) {
          return jsonResponse(
            {
              error: 'An assigned supervisor is required for intern accounts.',
            },
            400,
          )
        }
        if (!isValidUuid(supervisorId)) {
          return jsonResponse(
            { error: 'Assigned supervisor ID is invalid.' },
            400,
          )
        }
        // Changing the assigned supervisor requires an existing active
        // supervisor (same rule as create-account). Keeping the
        // already-assigned supervisor stays allowed even if that account
        // was later deactivated.
        if (supervisorId !== targetProfile.supervisor_id) {
          const { data: supRow, error: supErr } = await serviceClient
            .from('profiles')
            .select('id, role, is_active')
            .eq('id', supervisorId)
            .maybeSingle()

          if (
            supErr ||
            !supRow ||
            supRow.role !== 'supervisor' ||
            supRow.is_active === false
          ) {
            return jsonResponse(
              {
                error:
                  'Assigned supervisor must be an existing active supervisor account.',
              },
              400,
            )
          }
        }
        updates.supervisor_id = supervisorId

        if (
          body.required_hours !== undefined &&
          body.required_hours !== null &&
          body.required_hours !== ''
        ) {
          const numericHours = Number(body.required_hours)
          if (!Number.isInteger(numericHours) || numericHours <= 0) {
            return jsonResponse(
              { error: 'Required hours must be a positive whole number.' },
              400,
            )
          }
          updates.required_hours = numericHours
        }

        const startDate = cleanOptionalText(body.internship_start_date)
        if (startDate && !ISO_DATE_PATTERN.test(startDate)) {
          return jsonResponse(
            { error: 'Internship start date must use YYYY-MM-DD format.' },
            400,
          )
        }

        updates.student_id_no = cleanOptionalText(body.student_id_no)
        updates.school_name = cleanOptionalText(body.school_name)
        updates.course = cleanOptionalText(body.course)
        updates.internship_start_date = startDate
      }

      const { error: updateErr } = await serviceClient
        .from('profiles')
        .update(updates)
        .eq('id', targetUserId)

      if (updateErr) {
        return jsonResponse(
          { error: `Failed to update account: ${updateErr.message}` },
          500,
        )
      }

      // Sync display name to Auth metadata (best-effort)
      if (targetAuthRes?.user) {
        await serviceClient.auth.admin.updateUserById(targetUserId, {
          user_metadata: {
            ...(targetAuthRes.user.user_metadata ?? {}),
            full_name: fullName,
          },
        })
      }

      await recordAuditLog(serviceClient, {
        action: 'updated',
        target_user_id: targetUserId,
        target_name: fullName,
        target_email: targetEmail,
        target_role: targetProfile.role,
        performed_by: callerUser.id,
        performed_by_name: callerName,
        reason: cleanOptionalText(body.reason) ?? 'Account details updated',
        metadata: {
          previous_name: targetProfile.full_name,
          updated_fields: Object.keys(updates),
        },
      })

      return jsonResponse(
        {
          ok: true,
          action: 'updated',
          target_user_id: targetUserId,
          full_name: fullName,
        },
        200,
      )
    }

    // ------------------------------------------------------------------------
    // ACTION: deactivate_account — revokes Auth access + marks profile inactive
    // while preserving ALL historical internship records & identity
    // ------------------------------------------------------------------------
    if (action === 'deactivate_account') {
      if (targetUserId === callerUser.id) {
        return jsonResponse(
          { error: 'You cannot deactivate your own active coordinator account.' },
          400,
        )
      }

      if (targetProfile.is_active === false) {
        return jsonResponse(
          { error: 'This account is already deactivated.' },
          409,
        )
      }

      if (targetProfile.role === 'coordinator') {
        const others = await countOtherActiveCoordinators(
          serviceClient,
          targetUserId,
        )
        if (others === 0) {
          return jsonResponse(
            { error: 'Cannot deactivate the last active SIP Coordinator account.' },
            400,
          )
        }
      }

      const reason = cleanOptionalText(body.reason)
      if (!reason) {
        return jsonResponse(
          { error: 'A reason is required to deactivate an account.' },
          400,
        )
      }

      // Step 1: Ban user in Supabase Auth to block sign-ins & token refreshes
      const { error: banErr } = await serviceClient.auth.admin.updateUserById(
        targetUserId,
        { ban_duration: BAN_DURATION_PERMANENT },
      )

      if (banErr) {
        return jsonResponse(
          { error: `Failed to revoke portal sign-in access: ${banErr.message}` },
          500,
        )
      }

      // Step 2: Mark profile inactive (triggers instant RLS denial via get_my_role)
      const { error: profileDeactivateErr } = await serviceClient
        .from('profiles')
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivated_by: callerUser.id,
          deactivated_reason: reason,
        })
        .eq('id', targetUserId)

      if (profileDeactivateErr) {
        // Rollback Auth ban so account is never left in a half-deactivated state
        await serviceClient.auth.admin.updateUserById(targetUserId, {
          ban_duration: 'none',
        })
        return jsonResponse(
          {
            error: `Failed to update profile status: ${profileDeactivateErr.message}`,
          },
          500,
        )
      }

      await recordAuditLog(serviceClient, {
        action: 'deactivated',
        target_user_id: targetUserId,
        target_name: targetProfile.full_name,
        target_email: targetEmail,
        target_role: targetProfile.role,
        performed_by: callerUser.id,
        performed_by_name: callerName,
        reason,
      })

      return jsonResponse(
        {
          ok: true,
          action: 'deactivated',
          target_user_id: targetUserId,
          target_name: targetProfile.full_name,
        },
        200,
      )
    }

    // ------------------------------------------------------------------------
    // ACTION: reactivate_account — restores Auth access & profile active state
    // ------------------------------------------------------------------------
    if (action === 'reactivate_account') {
      if (targetProfile.is_active !== false) {
        return jsonResponse({ error: 'This account is already active.' }, 409)
      }

      const reason =
        cleanOptionalText(body.reason) ?? 'Account reactivated by SIP Coordinator'

      const { error: unbanErr } = await serviceClient.auth.admin.updateUserById(
        targetUserId,
        { ban_duration: 'none' },
      )

      if (unbanErr) {
        return jsonResponse(
          { error: `Failed to restore portal sign-in access: ${unbanErr.message}` },
          500,
        )
      }

      const { error: profileReactivateErr } = await serviceClient
        .from('profiles')
        .update({
          is_active: true,
          deactivated_at: null,
          deactivated_by: null,
          deactivated_reason: null,
        })
        .eq('id', targetUserId)

      if (profileReactivateErr) {
        await serviceClient.auth.admin.updateUserById(targetUserId, {
          ban_duration: BAN_DURATION_PERMANENT,
        })
        return jsonResponse(
          {
            error: `Failed to restore profile status: ${profileReactivateErr.message}`,
          },
          500,
        )
      }

      await recordAuditLog(serviceClient, {
        action: 'reactivated',
        target_user_id: targetUserId,
        target_name: targetProfile.full_name,
        target_email: targetEmail,
        target_role: targetProfile.role,
        performed_by: callerUser.id,
        performed_by_name: callerName,
        reason,
      })

      return jsonResponse(
        {
          ok: true,
          action: 'reactivated',
          target_user_id: targetUserId,
          target_name: targetProfile.full_name,
        },
        200,
      )
    }

    // ------------------------------------------------------------------------
    // ACTION: delete_account — permanent deletion ONLY when zero historical
    // records exist, with typed-name confirmation & audit retention
    // ------------------------------------------------------------------------
    if (action === 'delete_account') {
      if (targetUserId === callerUser.id) {
        return jsonResponse(
          { error: 'You cannot delete your own currently signed-in coordinator account.' },
          400,
        )
      }

      if (targetProfile.role === 'coordinator') {
        const others = await countOtherActiveCoordinators(
          serviceClient,
          targetUserId,
        )
        if (others === 0) {
          return jsonResponse(
            { error: 'Cannot delete the last active SIP Coordinator account.' },
            400,
          )
        }
      }

      const confirmName =
        typeof body.confirm_name === 'string' ? body.confirm_name.trim() : ''
      if (confirmName !== targetProfile.full_name.trim()) {
        return jsonResponse(
          {
            error:
              'Confirmation name does not match the account name. Type the exact full name to confirm permanent deletion.',
          },
          400,
        )
      }

      const reason = cleanOptionalText(body.reason)
      if (!reason) {
        return jsonResponse(
          { error: 'Please provide a reason for permanent account deletion.' },
          400,
        )
      }

      // Server-side integrity check across ALL related tables
      const recordSummary = await computeRecordSummaryForUser(
        serviceClient,
        targetUserId,
      )

      if (recordSummary.total > 0) {
        return jsonResponse(
          {
            error:
              'This account has existing internship records or assignments and cannot be permanently deleted. Deactivate the account instead to revoke access while preserving historical records.',
            code: 'HAS_HISTORICAL_RECORDS',
            record_summary: recordSummary,
          },
          409,
        )
      }

      // Safe permanent deletion: deleting auth.users cascades atomically to
      // public.profiles (enforced by ON DELETE RESTRICT & BEFORE DELETE trigger).
      const { error: deleteUserErr } =
        await serviceClient.auth.admin.deleteUser(targetUserId)

      if (deleteUserErr) {
        return jsonResponse(
          {
            error: `Could not permanently delete account: ${deleteUserErr.message}`,
          },
          500,
        )
      }

      // Preserve permanent audit record after account removal
      await recordAuditLog(serviceClient, {
        action: 'deleted',
        target_user_id: targetUserId,
        target_name: targetProfile.full_name,
        target_email: targetEmail,
        target_role: targetProfile.role,
        performed_by: callerUser.id,
        performed_by_name: callerName,
        reason,
        metadata: {
          student_id_no: targetProfile.student_id_no,
          company_name: targetProfile.company_name,
          record_summary: recordSummary,
        },
      })

      return jsonResponse(
        {
          ok: true,
          action: 'deleted',
          target_user_id: targetUserId,
          target_name: targetProfile.full_name,
        },
        200,
      )
    }

    return jsonResponse(
      { error: `Unsupported account management action: '${action}'.` },
      400,
    )
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected server error.'
    return jsonResponse({ error: message }, 500)
  }
})
