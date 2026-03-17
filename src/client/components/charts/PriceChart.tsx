import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useTheme } from '../../contexts/ThemeContext';
import type { StockPrice, Prediction, Direction } from '../../lib/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface LLMPrediction {
  date: string;
  llm_id: string;
  direction: string;
  is_correct: number | null;
}

interface PriceChartProps {
  prices: StockPrice[];
  predictions: Prediction[];
  llmPredictions?: LLMPrediction[];
  llmColorMap?: Record<string, string>;
  height?: number;
  className?: string;
}

export function PriceChart({ prices, predictions, llmPredictions, llmColorMap, height, className }: PriceChartProps) {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const lineColor = isDark ? '#94a3b8' : '#64748b';

  // Build prediction map by date
  const predMap = new Map<string, Prediction>();
  for (const pred of predictions) {
    predMap.set(pred.prediction_date, pred);
  }

  const labels = prices.map((p) => {
    const d = new Date(p.date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const priceData = prices.map((p) => p.close_price);

  // Multi-LLM mode: build separate datasets per LLM
  if (llmPredictions && llmPredictions.length > 0 && llmColorMap) {
    // Group predictions by LLM
    const llmIds = [...new Set(llmPredictions.map(p => p.llm_id))];
    const dateToIndex = new Map<string, number>();
    prices.forEach((p, i) => dateToIndex.set(p.date, i));

    const datasets = [
      // Base price line
      {
        label: 'Price',
        data: priceData,
        borderColor: lineColor,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.2,
        fill: false,
      },
      // One dataset per LLM
      ...llmIds.map(llmId => {
        const color = llmColorMap[llmId] || '#64748b';
        const llmPreds = llmPredictions.filter(p => p.llm_id === llmId);
        const data = new Array(prices.length).fill(null);
        const pointColors: string[] = new Array(prices.length).fill('transparent');
        const pointRadii: number[] = new Array(prices.length).fill(0);
        const pointStyles: string[] = new Array(prices.length).fill('circle');

        for (const pred of llmPreds) {
          const idx = dateToIndex.get(pred.date);
          if (idx !== undefined) {
            data[idx] = priceData[idx];
            pointColors[idx] = color;
            pointRadii[idx] = 5;
            // Hollow circle (crossRot) for incorrect, filled circle for correct
            if (pred.is_correct === 0) {
              pointStyles[idx] = 'crossRot';
            }
          }
        }

        return {
          label: llmId,
          data,
          borderColor: 'transparent',
          borderWidth: 0,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointBorderWidth: 2,
          pointRadius: pointRadii,
          pointHoverRadius: pointRadii.map((r: number) => (r > 0 ? 7 : 0)),
          pointStyle: pointStyles,
          tension: 0,
          fill: false,
          showLine: false,
        };
      }),
    ];

    const chartData = { labels, datasets };

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
        },
      },
      scales: {
        y: {
          grid: { color: gridColor },
          ticks: { font: { size: 10 }, color: textColor },
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: textColor },
        },
      },
    };

    return (
      <div className={className || 'h-[250px] sm:h-[300px] lg:h-[400px]'} style={height ? { height } : undefined}>
        <Line data={chartData} options={options as never} />
      </div>
    );
  }

  // Single LLM mode (original behavior)
  const pointBackgroundColors = prices.map((p) => {
    const pred = predMap.get(p.date);
    if (!pred) return 'transparent';
    if (pred.is_correct === 1) return '#10b981'; // emerald-500
    if (pred.is_correct === 0) return '#f43f5e'; // rose-500
    return 'rgba(99, 102, 241, 0.5)'; // indigo for pending
  });

  const pointRadii = prices.map((p) => {
    const pred = predMap.get(p.date);
    if (!pred) return 0;
    return 6;
  });

  const pointBorderColors = prices.map((p) => {
    const pred = predMap.get(p.date);
    if (!pred) return 'transparent';
    return isDark ? '#000' : '#fff';
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Price',
        data: priceData,
        borderColor: lineColor,
        borderWidth: 2,
        pointBackgroundColor: pointBackgroundColors,
        pointBorderColor: pointBorderColors,
        pointBorderWidth: 2,
        pointRadius: pointRadii,
        pointHoverRadius: pointRadii.map((r) => (r > 0 ? 8 : 0)),
        tension: 0.2,
        fill: false,
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
      },
    },
    scales: {
      y: {
        grid: { color: gridColor },
        ticks: { font: { size: 10 }, color: textColor },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, color: textColor },
      },
    },
  };

  return (
    <div className={className || 'h-[250px] sm:h-[300px] lg:h-[400px]'} style={height ? { height } : undefined}>
      <Line data={chartData} options={options as never} />
    </div>
  );
}
