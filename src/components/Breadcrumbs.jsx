import { Link } from 'react-router-dom'

export function Breadcrumbs({ items = [] }) {
  if (!items.length) return null

  return (
    <nav aria-label="Breadcrumbs" className="breadcrumb min-w-0">
      <ol>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1
          return (
            <li key={`${item.to}-${item.label}`}>
              <Link
                to={item.to}
                aria-current={isCurrent ? 'page' : undefined}
                className="truncate"
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
