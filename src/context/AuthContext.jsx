import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { AuthContext } from './authContextValue'

const EMPTY_PROFILE_STATE = {
  userId: null,
  data: null,
  error: null,
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [sessionReady, setSessionReady] = useState(!supabase)
  const [user, setUser] = useState(null)
  const [profileState, setProfileState] = useState(EMPTY_PROFILE_STATE)
  const [profileRequestVersion, setProfileRequestVersion] = useState(0)

  useEffect(() => {
    if (!supabase) return undefined

    // Keep callback synchronous to avoid GoTrueClient refresh-lock deadlocks.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      setSessionReady(true)

      if (!nextUser) {
        setProfileState(EMPTY_PROFILE_STATE)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !user?.id) return undefined

    let cancelled = false
    const targetUserId = user.id

    supabase
      .from('profiles')
      .select(
        'id, full_name, role, supervisor_id, student_id_no, company_name, required_hours, internship_start_date, school_name, course',
      )
      .eq('id', targetUserId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        setProfileState({
          userId: targetUserId,
          data: error ? null : data,
          error: error ?? null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [user?.id, profileRequestVersion])

  const refreshProfile = useCallback(() => {
    setProfileState(EMPTY_PROFILE_STATE)
    setProfileRequestVersion((version) => version + 1)
  }, [])

  const logout = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    setUser(null)
    setProfileState(EMPTY_PROFILE_STATE)
    navigate('/login', { replace: true })
  }, [navigate])

  const profileMatchesUser = Boolean(user?.id && profileState.userId === user.id)
  const loading = !sessionReady || Boolean(user && !profileMatchesUser)

  const value = useMemo(
    () => ({
      user,
      profile: profileMatchesUser ? profileState.data : null,
      profileError: profileMatchesUser ? profileState.error : null,
      loading,
      logout,
      refreshProfile,
    }),
    [user, profileMatchesUser, profileState.data, profileState.error, loading, logout, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
