import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { AuthLayout } from './layouts/AuthLayout'
import { DashboardLayout } from './layouts/DashboardLayout'
import { LoginPage } from './pages/auth/LoginPage'
import { CoordinatorDashboard } from './pages/coordinator/CoordinatorDashboard'
import { AccomplishmentsPage } from './pages/intern/AccomplishmentsPage'
import { InternDashboard } from './pages/intern/InternDashboard'
import { TasksPage } from './pages/intern/TasksPage'
import { WeeklyAttendancePage } from './pages/intern/WeeklyAttendancePage'
import { SupervisorDashboard } from './pages/supervisor/SupervisorDashboard'

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRole="intern" />}>
            <Route element={<DashboardLayout />}>
              <Route path="/intern" element={<InternDashboard />} />
              <Route
                path="/intern/attendance"
                element={<WeeklyAttendancePage />}
              />
              <Route
                path="/intern/accomplishments"
                element={<AccomplishmentsPage />}
              />
              <Route path="/intern/tasks" element={<TasksPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRole="supervisor" />}>
            <Route element={<DashboardLayout />}>
              <Route path="/supervisor" element={<SupervisorDashboard />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRole="coordinator" />}>
            <Route element={<DashboardLayout />}>
              <Route path="/coordinator" element={<CoordinatorDashboard />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
