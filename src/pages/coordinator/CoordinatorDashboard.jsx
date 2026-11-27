import { RolePlaceholder } from '../../components/RolePlaceholder'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export function CoordinatorDashboard() {
  useDocumentTitle('Coordinator Dashboard')

  return (
    <RolePlaceholder
      role="Coordinator"
      route="/coordinator"
      summary="Placeholder workspace for SIP coordinators to oversee student placements, monitor host organizations, and manage program compliance."
    />
  )
}
