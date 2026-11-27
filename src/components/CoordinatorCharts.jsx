/**
 * Restrained institutional SVG chart components for SIP Coordinator Analytics.
 * Uses CSS custom properties so Light Mode, Dark Mode, and Forced Colors work
 * automatically. Never fabricates data: renders clear empty states when records
 * are unavailable.
 */

function ChartEmptyState({ message }) {
  return (
    <div className="flex min-h-44 items-center justify-center rounded-[5px] border border-dashed border-rule bg-surface-subtle/50 px-5 py-8 text-center text-xs leading-[1.55] text-ink-muted">
      <p className="max-w-[38ch]">{message}</p>
    </div>
  )
}

/**
 * Horizontal progress distribution chart (Internship Completion Bands).
 */
export function ProgressHorizontalBars({
  bands = [],
  totalCount = 0,
  emptyMessage = 'No intern progress records match the current filters.',
}) {
  if (!totalCount || bands.length === 0) {
    return <ChartEmptyState message={emptyMessage} />
  }

  return (
    <ul className="space-y-3" aria-label="Internship progress distribution">
      {bands.map((band) => {
        const isCompleted = band.key === 'complete'
        return (
          <li key={band.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-ink">{band.label}</span>
              <span className="tabular-nums text-ink-muted">
                <strong className="font-semibold text-ink">{band.count}</strong>{' '}
                {band.count === 1 ? 'intern' : 'interns'} (
                {band.sharePct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-rule">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  isCompleted ? 'bg-success-border' : 'bg-accent-solid'
                }`}
                style={{
                  width: `${band.count > 0 ? Math.max(4, band.sharePct) : 0}%`,
                }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Multi-series SVG line chart for weekly trends.
 * Each series: { key, label, color, dashed? }
 * Each datum: { label, rangeLabel?, [series.key]: number }
 */
export function TrendLineChart({
  title,
  data = [],
  series = [],
  yAxisUnit = '',
  emptyMessage = 'No weekly data available for the selected filters.',
}) {
  const hasAnyValues =
    data.length > 0 &&
    series.some((s) => data.some((d) => Number(d[s.key] ?? 0) > 0))

  if (data.length === 0 || !hasAnyValues) {
    return <ChartEmptyState message={emptyMessage} />
  }

  const width = 560
  const height = 220
  const padLeft = 40
  const padRight = 18
  const padTop = 18
  const padBottom = 38
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  let maxVal = 0
  for (const row of data) {
    for (const s of series) {
      const val = Number(row[s.key] ?? 0)
      if (val > maxVal) maxVal = val
    }
  }
  const yMax = Math.max(1, Math.ceil(maxVal * 1.15))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMax * t * 10) / 10)
  const uniqueTicks = [...new Set(ticks)]

  const getX = (index) => {
    if (data.length === 1) return padLeft + plotW / 2
    return padLeft + (index / (data.length - 1)) * plotW
  }

  const getY = (value) => {
    const ratio = Math.min(1, Math.max(0, Number(value ?? 0) / yMax))
    return padTop + plotH - ratio * plotH
  }

  const labelStep = data.length > 8 ? 2 : 1

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span>{s.label}</span>
          </span>
        ))}
      </div>

      <div className="w-full overflow-hidden">
        <svg
          role="img"
          aria-label={title}
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
        >
          <title>{title}</title>

          {/* Horizontal gridlines and Y-axis tick labels */}
          {uniqueTicks.map((tick) => {
            const y = getY(tick)
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke="var(--color-rule)"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="var(--color-ink-muted)"
                  fontSize="10.5"
                >
                  {Number.isInteger(tick) ? tick : tick.toFixed(1)}
                  {yAxisUnit}
                </text>
              </g>
            )
          })}

          {/* Baseline axis */}
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={padTop + plotH}
            y2={padTop + plotH}
            stroke="var(--color-input-border)"
            strokeWidth="1"
          />

          {/* X-axis labels */}
          {data.map((row, idx) => {
            if (idx % labelStep !== 0 && idx !== data.length - 1) return null
            const x = getX(idx)
            return (
              <text
                key={row.weekOf || row.label || idx}
                x={x}
                y={height - 12}
                textAnchor="middle"
                fill="var(--color-ink-muted)"
                fontSize="10.5"
              >
                {row.label}
              </text>
            )
          })}

          {/* Series lines & data points */}
          {series.map((s) => {
            const points = data.map((row, idx) => ({
              x: getX(idx),
              y: getY(row[s.key]),
              val: Number(row[s.key] ?? 0),
              label: row.rangeLabel || row.label,
            }))
            const polylinePoints = points
              .map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
              .join(' ')

            return (
              <g key={s.key}>
                {points.length > 1 ? (
                  <polyline
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2.25"
                    strokeDasharray={s.dashed ? '5 4' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={polylinePoints}
                  />
                ) : null}
                {points.map((pt, idx) => (
                  <g key={`${s.key}-${idx}`}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="4"
                      fill="var(--color-surface)"
                      stroke={s.color}
                      strokeWidth="2.25"
                    >
                      <title>
                        {`${s.label} (${pt.label}): ${pt.val}${yAxisUnit}`}
                      </title>
                    </circle>
                    {points.length <= 6 ? (
                      <text
                        x={pt.x}
                        y={pt.y - 8}
                        textAnchor="middle"
                        fill="var(--color-ink)"
                        fontSize="10"
                        fontWeight="600"
                      >
                        {pt.val}
                      </text>
                    ) : null}
                  </g>
                ))}
              </g>
            )
          })}
        </svg>
      </div>
    </figure>
  )
}

/**
 * SVG Vertical Bar Chart supporting single-series (e.g. weekly hours) and
 * grouped multi-series comparisons (e.g. supervisor workload).
 */
export function ComparisonBarChart({
  title,
  data = [],
  series = [],
  valueSuffix = '',
  emptyMessage = 'No data available for comparison.',
}) {
  const hasAnyValues =
    data.length > 0 &&
    series.some((s) => data.some((d) => Number(d[s.key] ?? 0) > 0))

  if (data.length === 0 || !hasAnyValues) {
    return <ChartEmptyState message={emptyMessage} />
  }

  const width = 560
  const height = 225
  const padLeft = 44
  const padRight = 16
  const padTop = 20
  const padBottom = 42
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  let maxVal = 0
  for (const row of data) {
    for (const s of series) {
      const val = Number(row[s.key] ?? 0)
      if (val > maxVal) maxVal = val
    }
  }
  const yMax = Math.max(1, Math.ceil(maxVal * 1.15))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(yMax * t * 10) / 10)
  const uniqueTicks = [...new Set(ticks)]

  const getY = (value) => {
    const ratio = Math.min(1, Math.max(0, Number(value ?? 0) / yMax))
    return padTop + plotH - ratio * plotH
  }

  const groupWidth = plotW / data.length
  const innerGroupWidth = Math.min(groupWidth * 0.72, series.length * 28 + 12)
  const barGap = series.length > 1 ? 4 : 0
  const barWidth = Math.max(
    8,
    Math.min(
      38,
      (innerGroupWidth - barGap * (series.length - 1)) / series.length,
    ),
  )

  return (
    <figure className="space-y-3">
      {series.length > 1 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-[2px]"
                style={{ backgroundColor: s.color }}
              />
              <span>{s.label}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="w-full overflow-hidden">
        <svg
          role="img"
          aria-label={title}
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
        >
          <title>{title}</title>

          {uniqueTicks.map((tick) => {
            const y = getY(tick)
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke="var(--color-rule)"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="var(--color-ink-muted)"
                  fontSize="10.5"
                >
                  {Number.isInteger(tick) ? tick : tick.toFixed(1)}
                  {valueSuffix}
                </text>
              </g>
            )
          })}

          <line
            x1={padLeft}
            x2={width - padRight}
            y1={padTop + plotH}
            y2={padTop + plotH}
            stroke="var(--color-input-border)"
            strokeWidth="1"
          />

          {data.map((row, groupIdx) => {
            const groupCenterX = padLeft + groupIdx * groupWidth + groupWidth / 2
            const totalBarsW =
              barWidth * series.length + barGap * (series.length - 1)
            const startX = groupCenterX - totalBarsW / 2
            const shortLabel =
              String(row.label ?? '').length > 14
                ? `${String(row.label).slice(0, 13)}…`
                : String(row.label ?? '')

            return (
              <g key={row.id || row.weekOf || row.label || groupIdx}>
                {series.map((s, sIdx) => {
                  const val = Number(row[s.key] ?? 0)
                  const barTopY = getY(val)
                  const barHeight = Math.max(0, padTop + plotH - barTopY)
                  const x = startX + sIdx * (barWidth + barGap)
                  return (
                    <g key={s.key}>
                      <rect
                        x={x}
                        y={barTopY}
                        width={barWidth}
                        height={barHeight}
                        rx="2"
                        fill={s.color}
                      >
                        <title>
                          {`${row.fullLabel || row.label} — ${s.label}: ${val}${valueSuffix}`}
                        </title>
                      </rect>
                      {val > 0 && data.length <= 6 && series.length <= 2 ? (
                        <text
                          x={x + barWidth / 2}
                          y={Math.max(padTop - 4, barTopY - 5)}
                          textAnchor="middle"
                          fill="var(--color-ink)"
                          fontSize="10"
                          fontWeight="600"
                        >
                          {Number.isInteger(val) ? val : val.toFixed(1)}
                        </text>
                      ) : null}
                    </g>
                  )
                })}

                <text
                  x={groupCenterX}
                  y={height - 14}
                  textAnchor="middle"
                  fill="var(--color-ink-muted)"
                  fontSize="10.5"
                >
                  {shortLabel}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </figure>
  )
}

/**
 * SVG Donut Chart for categorical status distributions.
 * Each segment: { key, label, value, color }
 */
export function StatusDonutChart({
  title,
  centerLabel = 'Total',
  segments = [],
  emptyMessage = 'No records available to visualize status distribution.',
}) {
  const total = segments.reduce((sum, seg) => sum + Number(seg.value ?? 0), 0)

  if (total <= 0) {
    return <ChartEmptyState message={emptyMessage} />
  }

  const size = 168
  const strokeWidth = 24
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const renderedSegments = segments
    .filter((seg) => Number(seg.value ?? 0) > 0)
    .reduce((acc, seg) => {
      const prevOffset =
        acc.length === 0 ? 0 : acc[acc.length - 1].nextOffset
      const fraction = seg.value / total
      const dashLength = fraction * circumference
      acc.push({
        ...seg,
        dashLength,
        dashOffset: -prevOffset,
        nextOffset: prevOffset + dashLength,
        pct: Number(((seg.value / total) * 100).toFixed(1)),
      })
      return acc
    }, [])

  return (
    <figure className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="shrink-0">
        <svg
          role="img"
          aria-label={`${title}: ${total} total`}
          viewBox={`0 0 ${size} ${size}`}
          className="size-40"
        >
          <title>{`${title} (${total} total)`}</title>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-rule)"
            strokeWidth={strokeWidth}
          />
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {renderedSegments.map((seg) => (
              <circle
                key={seg.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${seg.dashLength} ${circumference}`}
                strokeDashoffset={seg.dashOffset}
              >
                <title>{`${seg.label}: ${seg.value} (${seg.pct}%)`}</title>
              </circle>
            ))}
          </g>
          <text
            x={size / 2}
            y={size / 2 - 4}
            textAnchor="middle"
            fill="var(--color-ink)"
            fontSize="22"
            fontWeight="700"
          >
            {total}
          </text>
          <text
            x={size / 2}
            y={size / 2 + 14}
            textAnchor="middle"
            fill="var(--color-ink-muted)"
            fontSize="10.5"
          >
            {centerLabel}
          </text>
        </svg>
      </div>

      <ul className="min-w-0 flex-1 space-y-2 text-xs">
        {segments.map((seg) => {
          const share = total > 0 ? ((seg.value / total) * 100).toFixed(1) : '0.0'
          return (
            <li
              key={seg.key}
              className="flex items-center justify-between gap-3 border-b border-rule/60 pb-1.5 last:border-b-0 last:pb-0"
            >
              <span className="inline-flex min-w-0 items-center gap-2 text-ink">
                <span
                  aria-hidden="true"
                  className="inline-block size-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="truncate">{seg.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-ink-muted">
                <strong className="font-semibold text-ink">{seg.value}</strong>{' '}
                ({share}%)
              </span>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
