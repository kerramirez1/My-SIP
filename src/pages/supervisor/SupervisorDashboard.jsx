import { RolePlaceholder } from '../../components/RolePlaceholder'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export function SupervisorDashboard() {
  useDocumentTitle('Supervisor Dashboard')

  return (
    <RolePlaceholder
      role="Supervisor"
      route="/supervisor"
      summary="Placeholder workspace for industry and site supervisors to review assigned interns, verify attendance records, and complete evaluations."
    />
  )
}
