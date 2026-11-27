import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const TEST_ACCOUNTS = [
  {
    email: 'coordinator@sipportal.test',
    password: 'Test@12345',
    full_name: 'SIP Coordinator',
    role: 'coordinator',
  },
  {
    email: 'supervisor@sipportal.test',
    password: 'Test@12345',
    full_name: 'Test Supervisor',
    role: 'supervisor',
  },
  {
    email: 'intern@sipportal.test',
    password: 'Test@12345',
    full_name: 'Test Intern',
    role: 'intern',
  },
]

function loadSeedEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing ${path.basename(filePath)} at ${filePath}.\n` +
        'Create a local .env.seed file with:\n' +
        'SUPABASE_URL=https://your-project-id.supabase.co\n' +
        'SUPABASE_SERVICE_ROLE_KEY=your-service-role-key',
    )
  }

  const env = {}
  const raw = fs.readFileSync(filePath, 'utf8')

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line
    const eqIndex = normalized.indexOf('=')
    if (eqIndex === -1) continue

    const key = normalized.slice(0, eqIndex).trim()
    let value = normalized.slice(eqIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (key) {
      env[key] = value
    }
  }

  return env
}

async function listAllUsersByEmail(supabase) {
  const usersByEmail = new Map()
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    })

    if (error) {
      throw new Error(`Failed to list existing Auth users: ${error.message}`)
    }

    const users = data?.users ?? []
    for (const user of users) {
      if (user.email) {
        usersByEmail.set(user.email.toLowerCase(), user)
      }
    }

    if (users.length < perPage) break
    page += 1
  }

  return usersByEmail
}

function isAlreadyRegisteredError(error) {
  const message = (error?.message ?? '').toLowerCase()
  return (
    message.includes('already been registered') ||
    message.includes('already exists') ||
    error?.code === 'email_exists'
  )
}

async function main() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const envSeedPath = path.resolve(currentDir, '..', '.env.seed')
  const seedEnv = loadSeedEnv(envSeedPath)

  const supabaseUrl = seedEnv.SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey =
    seedEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      '.env.seed must define both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  let existingByEmail = await listAllUsersByEmail(supabase)
  const seededUsers = []

  for (const account of TEST_ACCOUNTS) {
    const emailKey = account.email.toLowerCase()
    const existing = existingByEmail.get(emailKey)

    if (existing) {
      console.log(`Skipped (already exists): ${account.email} (${existing.id})`)
      seededUsers.push({ ...account, id: existing.id })
      continue
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: {
        full_name: account.full_name,
        role: account.role,
      },
    })

    if (error) {
      if (isAlreadyRegisteredError(error)) {
        existingByEmail = await listAllUsersByEmail(supabase)
        const matched = existingByEmail.get(emailKey)
        if (matched) {
          console.log(
            `Skipped (already exists): ${account.email} (${matched.id})`,
          )
          seededUsers.push({ ...account, id: matched.id })
          continue
        }
      }
      throw new Error(`Failed to create ${account.email}: ${error.message}`)
    }

    const createdUser = data?.user
    if (!createdUser?.id) {
      throw new Error(`Supabase did not return a user ID for ${account.email}.`)
    }

    console.log(`Created: ${account.email} (${createdUser.id})`)
    seededUsers.push({ ...account, id: createdUser.id })
  }

  for (const account of seededUsers) {
    const { data: existingProfile, error: profileLookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', account.id)
      .maybeSingle()

    if (profileLookupError) {
      throw new Error(
        `Failed to check profile for ${account.email}: ${profileLookupError.message}`,
      )
    }

    if (!existingProfile) {
      const { error: insertProfileError } = await supabase
        .from('profiles')
        .insert({
          id: account.id,
          full_name: account.full_name,
          role: account.role,
        })

      if (insertProfileError) {
        throw new Error(
          `Failed to create missing profile for ${account.email}: ${insertProfileError.message}`,
        )
      }
    }
  }

  const supervisor = seededUsers.find((u) => u.role === 'supervisor')
  const intern = seededUsers.find((u) => u.role === 'intern')

  if (!supervisor?.id || !intern?.id) {
    throw new Error('Could not resolve supervisor and intern IDs.')
  }

  const { data: updatedInternProfile, error: updateError } = await supabase
    .from('profiles')
    .update({ supervisor_id: supervisor.id })
    .eq('id', intern.id)
    .select('id, full_name, role, supervisor_id')
    .single()

  if (updateError) {
    throw new Error(
      `Failed to assign supervisor_id on intern profile: ${updateError.message}`,
    )
  }

  console.log('\nSeeded Accounts:')
  for (const account of seededUsers) {
    console.log(
      `- ${account.role.padEnd(11)} | ${account.email.padEnd(28)} | ${account.full_name.padEnd(16)} | id: ${account.id}`,
    )
  }
  console.log(
    `\nIntern supervisor link verified: ${updatedInternProfile.id} -> supervisor_id: ${updatedInternProfile.supervisor_id}`,
  )
}

main().catch((error) => {
  console.error(`\nSeed error: ${error.message}`)
  process.exitCode = 1
})
