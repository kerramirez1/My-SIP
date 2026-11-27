import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_REQUIRED_HOURS = 500

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

function isDuplicateEmailError(error: {
  message?: string
  code?: string
  status?: number
}): boolean {
  const message = (error.message ?? '').toLowerCase()
  return (
    error.code === 'email_exists' ||
    message.includes('already been registered') ||
    message.includes('already exists') ||
    message.includes('user already registered')
  )
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

  // 1. Identify caller via anon client scoped to caller's JWT
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
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

  // 2. Verify caller is a coordinator using the service-role client
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: callerProfile, error: callerProfileError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', callerUser.id)
    .maybeSingle()

  if (callerProfileError) {
    return jsonResponse(
      { error: `Could not verify caller role: ${callerProfileError.message}` },
      500,
    )
  }

  if (callerProfile?.role !== 'coordinator') {
    return jsonResponse(
      { error: 'Only the SIP Coordinator can create accounts.' },
      403,
    )
  }

  // 3. Parse and validate JSON body server-side
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

  const role = typeof body.role === 'string' ? body.role.trim() : ''
  if (role !== 'intern' && role !== 'supervisor') {
    return jsonResponse(
      { error: "Role must be either 'intern' or 'supervisor'." },
      400,
    )
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  if (!fullName) {
    return jsonResponse({ error: 'Full name is required.' }, 400)
  }

  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !EMAIL_PATTERN.test(email)) {
    return jsonResponse({ error: 'A valid email address is required.' }, 400)
  }

  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < 8) {
    return jsonResponse(
      { error: 'Temporary password must be at least 8 characters.' },
      400,
    )
  }

  let supervisorId: string | null = null
  let requiredHours = DEFAULT_REQUIRED_HOURS
  let studentIdNo: string | null = null
  let schoolName: string | null = null
  let course: string | null = null
  let internshipStartDate: string | null = null
  const companyName = cleanOptionalText(body.company_name)

  if (role === 'intern') {
    supervisorId = cleanOptionalText(body.supervisor_id)
    if (!supervisorId) {
      return jsonResponse(
        { error: 'An assigned supervisor is required for intern accounts.' },
        400,
      )
    }

    const { data: supervisorProfile, error: supervisorLookupError } =
      await serviceClient
        .from('profiles')
        .select('id, role')
        .eq('id', supervisorId)
        .maybeSingle()

    if (
      supervisorLookupError ||
      !supervisorProfile ||
      supervisorProfile.role !== 'supervisor'
    ) {
      return jsonResponse(
        { error: 'Assigned supervisor must be an existing supervisor account.' },
        400,
      )
    }

    if (
      body.required_hours !== undefined &&
      body.required_hours !== null &&
      body.required_hours !== ''
    ) {
      const numericHours =
        typeof body.required_hours === 'number'
          ? body.required_hours
          : Number(body.required_hours)
      if (!Number.isInteger(numericHours) || numericHours <= 0) {
        return jsonResponse(
          { error: 'Required hours must be a positive whole number.' },
          400,
        )
      }
      requiredHours = numericHours
    }

    internshipStartDate = cleanOptionalText(body.internship_start_date)
    if (internshipStartDate && !ISO_DATE_PATTERN.test(internshipStartDate)) {
      return jsonResponse(
        { error: 'Internship start date must use YYYY-MM-DD format.' },
        400,
      )
    }

    studentIdNo = cleanOptionalText(body.student_id_no)
    schoolName = cleanOptionalText(body.school_name)
    course = cleanOptionalText(body.course)
  }

  // 4. Create Auth user via service client
  const { data: createdData, error: createUserError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
      },
    })

  if (createUserError) {
    if (isDuplicateEmailError(createUserError)) {
      return jsonResponse(
        { error: 'An account with this email already exists.' },
        409,
      )
    }
    return jsonResponse(
      { error: createUserError.message || 'Failed to create Auth account.' },
      500,
    )
  }

  const newUserId = createdData?.user?.id
  if (!newUserId) {
    return jsonResponse(
      { error: 'Authentication service did not return a user ID.' },
      500,
    )
  }

  // 5. Complete public.profiles for the new user
  const profileUpdate: Record<string, unknown> = {
    full_name: fullName,
  }

  if (role === 'intern') {
    profileUpdate.supervisor_id = supervisorId
    profileUpdate.required_hours = requiredHours
    if (studentIdNo !== null) profileUpdate.student_id_no = studentIdNo
    if (companyName !== null) profileUpdate.company_name = companyName
    if (schoolName !== null) profileUpdate.school_name = schoolName
    if (course !== null) profileUpdate.course = course
    if (internshipStartDate !== null) {
      profileUpdate.internship_start_date = internshipStartDate
    }
  } else {
    profileUpdate.supervisor_id = null
    if (companyName !== null) profileUpdate.company_name = companyName
  }

  const { data: updatedProfile, error: profileUpdateError } =
    await serviceClient
      .from('profiles')
      .update(profileUpdate)
      .eq('id', newUserId)
      .select('id')
      .maybeSingle()

  // 6. Rollback Auth user if profile completion failed
  if (profileUpdateError || !updatedProfile) {
    try {
      await serviceClient.auth.admin.deleteUser(newUserId)
    } catch {
      // Best-effort rollback; surface profile update failure below.
    }

    return jsonResponse(
      {
        error: profileUpdateError?.message
          ? `Failed to complete user profile: ${profileUpdateError.message}`
          : 'Failed to complete user profile.',
      },
      500,
    )
  }

  // 7. Return created account summary (never include password)
  return jsonResponse(
    {
      id: newUserId,
      email,
      full_name: fullName,
      role,
    },
    200,
  )
})
