import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { AuthLayout } from './layouts/AuthLayout'
import { DashboardLayout } from './layouts/DashboardLayout'
import { LoginPage } from './pages/auth/LoginPage'
import { CoordinatorAccountsPage } from './pages/coordinator/CoordinatorAccountsPage'
import { CoordinatorDashboard } from './pages/coordinator/CoordinatorDashboard'
import { CoordinatorMonitoringPage } from './pages/coordinator/CoordinatorMonitoringPage'
import { CoordinatorProfilePage } from './pages/coordinator/CoordinatorProfilePage'
import { CoordinatorReportsPage } from './pages/coordinator/CoordinatorReportsPage'
import { CoordinatorSettingsPage } from './pages/coordinator/CoordinatorSettingsPage'
import { CoordinatorSubmissionsPage } from './pages/coordinator/CoordinatorSubmissionsPage'
import { AccomplishmentsPage } from './pages/intern/AccomplishmentsPage'
import { InternDashboard } from './pages/intern/InternDashboard'
import { InternProfilePage } from './pages/intern/InternProfilePage'
import { TasksPage } from './pages/intern/TasksPage'
import { WeeklyAttendancePage } from './pages/intern/WeeklyAttendancePage'
import { SupervisorDashboard } from './pages/supervisor/SupervisorDashboard'
import { SupervisorHistoryPage } from './pages/supervisor/SupervisorHistoryPage'
import { SupervisorInternsPage } from './pages/supervisor/SupervisorInternsPage'
import { SupervisorReviewsPage } from './pages/supervisor/SupervisorReviewsPage'

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
              <Route path="/intern/profile" element={<InternProfilePage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRole="supervisor" />}>
            <Route element={<DashboardLayout />}>
              <Route path="/supervisor" element={<SupervisorDashboard />} />
              <Route
                path="/supervisor/interns"
                element={<SupervisorInternsPage />}
              />
              <Route
                path="/supervisor/reviews"
                element={<SupervisorReviewsPage />}
              />
              <Route
                path="/supervisor/history"
                element={<SupervisorHistoryPage />}
              />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRole="coordinator" />}>
            <Route element={<DashboardLayout />}>
              <Route path="/coordinator" element={<CoordinatorDashboard />} />
              <Route
                path="/coordinator/accounts"
                element={<CoordinatorAccountsPage />}
              />
              <Route
                path="/coordinator/monitoring"
                element={<CoordinatorMonitoringPage />}
              />
              <Route
                path="/coordinator/submissions"
                element={<CoordinatorSubmissionsPage />}
              />
              <Route
                path="/coordinator/reports"
                element={<CoordinatorReportsPage />}
              />
              <Route
                path="/coordinator/profile"
                element={<CoordinatorProfilePage />}
              />
              <Route
                path="/coordinator/settings"
                element={<CoordinatorSettingsPage />}
              />
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
