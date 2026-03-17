import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useTheme } from '../../contexts/ThemeContext';
import type { AccuracyHistoryEntry } from '../../lib/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface AccuracyLineChartProps {
  data: AccuracyHistoryEntry[];
  height?: number;
  className?: string;
}

export function AccuracyLineChart({ data, height, className }: AccuracyLineChartProps) {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const labels = data.map((entry) => {
    const d = new Date(entry.date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Accuracy',
        data: data.map((entry) => entry.accuracy_rate),
        borderColor: '#4f46e5',
        backgroundColor: isDark ? 'rgba(79, 70, 229, 0.1)' : 'rgba(79, 70, 229, 0.05)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#4f46e5',
        pointBorderColor: isDark ? '#000' : '#fff',
        pointBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? '#1c1c1e' : '#fff',
        titleColor: isDark ? '#fff' : '#1e293b',
        bodyColor: isDark ? '#cbd5e1' : '#475569',
        borderColor: isDark ? '#38383a' : '#e2e8f0',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: (context: { parsed: { y: number } }) => `${context.parsed.y.toFixed(1)}%`,
        },
      },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        grid: { color: gridColor },
        ticks: {
          font: { size: 10 },
          color: textColor,
          callback: (value: string | number) => `${value}%`,
        },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, color: textColor },
      },
    },
  };

  return (
    <div className={className || 'h-[200px] sm:h-[250px] lg:h-[300px]'} style={height ? { height } : undefined}>
      <Line data={chartData} options={options as never} />
    </div>
  );
}
