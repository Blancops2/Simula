import type { ReactNode } from 'react';

interface DonutChartProps {
  percentage: number;
  label: ReactNode;
  size?: number;
}

export function DonutChart({ percentage, label, size = 120 }: DonutChartProps) {
  const clamped = Math.min(100, Math.max(0, percentage));
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <div className="donut-chart">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-bg-subtle)"
          strokeWidth={10}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x="50%" y="50%" textAnchor="middle" dy="0.35em" className="donut-chart-value">
          {Math.round(clamped)}%
        </text>
      </svg>
      <div className="donut-chart-legend">{label}</div>
    </div>
  );
}
