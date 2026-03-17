<!DOCTYPE html>

<html lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Stock Detail - Apple Inc (AAPL)</title>
<!-- Tailwind CSS v3 CDN -->
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<!-- Chart.js for data visualization -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style data-purpose="custom-layout">
    /* Custom scrollbar for reasoning details */
    .custom-scrollbar::-webkit-scrollbar {
      width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 10px;
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 font-sans">
<!-- BEGIN: MainHeader -->
<header class="bg-white border-b border-slate-200 sticky top-0 z-50">
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
<div class="flex items-center gap-4">
<a class="text-slate-500 hover:text-slate-800 transition-colors" data-purpose="back-button" href="#">
<svg class="h-6 w-6" fill="none" stroke="currentColor" viewbox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M10 19l-7-7m0 0l7-7m-7 7h18" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
</svg>
</a>
<div class="flex flex-col">
<h1 class="text-xl font-bold text-slate-900 leading-tight">Apple Inc.</h1>
<span class="text-sm font-medium text-slate-500">NASDAQ: AAPL</span>
</div>
</div>
<div class="flex items-center gap-8">
<div class="text-right">
<p class="text-xs uppercase tracking-wider text-slate-400 font-bold">Cumulative Win Rate</p>
<p class="text-2xl font-black text-emerald-600">72.4%</p>
</div>
<div class="text-right border-l pl-8 border-slate-200">
<p class="text-xs uppercase tracking-wider text-slate-400 font-bold">Total Predictions</p>
<p class="text-2xl font-black text-slate-800">148</p>
</div>
</div>
</div>
</header>
<!-- END: MainHeader -->
<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
<!-- BEGIN: PerformanceOverview -->
<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
<!-- Price & Prediction Chart -->
<div class="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
<div class="flex justify-between items-center mb-6">
<h2 class="text-lg font-bold flex items-center gap-2">
            Price Action &amp; AI Predictions
            <span class="text-xs font-normal text-slate-400">(Last 30 Days)</span>
</h2>
<div class="flex gap-4 text-xs font-medium">
<span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-emerald-500"></span> Correct</span>
<span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-rose-500"></span> Incorrect</span>
</div>
</div>
<div class="h-[400px] w-full">
<canvas id="priceChart"></canvas>
</div>
</div>
<!-- Win Rate Evolution -->
<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
<h2 class="text-lg font-bold mb-6">Win Rate Evolution</h2>
<div class="h-[300px] w-full">
<canvas id="winRateChart"></canvas>
</div>
<div class="mt-4 pt-4 border-t border-slate-100">
<p class="text-sm text-slate-600">
<span class="font-bold text-emerald-600">+4.2%</span> accuracy improvement since last month based on self-reflection updates.
          </p>
</div>
</div>
</div>
<!-- END: PerformanceOverview -->
<!-- BEGIN: PredictionHistory -->
<section class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
<div class="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
<h2 class="text-lg font-bold text-slate-800">Prediction History</h2>
<button class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-3 py-1 border border-indigo-200 rounded-md bg-white">Export CSV</button>
</div>
<div class="overflow-x-auto">
<table class="w-full text-left border-collapse" id="prediction-history-table">
<thead>
<tr class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold">
<th class="px-6 py-4">Date</th>
<th class="px-6 py-4">Prediction</th>
<th class="px-6 py-4">Actual</th>
<th class="px-6 py-4">Change %</th>
<th class="px-6 py-4">Close</th>
<th class="px-6 py-4 text-center">Correct</th>
<th class="px-6 py-4">Insight</th>
</tr>
</thead>
<tbody class="divide-y divide-slate-100 text-sm">
<!-- Row 1 -->
<tr class="hover:bg-slate-50 transition-colors">
<td class="px-6 py-4 whitespace-nowrap text-slate-500">Feb 14, 2024</td>
<td class="px-6 py-4 font-semibold text-emerald-600">BULLISH</td>
<td class="px-6 py-4 font-semibold text-emerald-600">BULLISH</td>
<td class="px-6 py-4 text-emerald-600">+1.45%</td>
<td class="px-6 py-4">$184.15</td>
<td class="px-6 py-4 text-center">
<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">YES</span>
</td>
<td class="px-6 py-4">
<button class="text-indigo-600 hover:underline font-medium" onclick="toggleReasoning('r1')">View Reasoning</button>
</td>
</tr>
<tr class="hidden bg-slate-50" id="r1">
<td class="px-8 py-6" colspan="7">
<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
<div>
<h4 class="text-xs font-bold uppercase text-slate-400 mb-2">LLM Thought Process</h4>
<p class="text-slate-700 leading-relaxed italic border-l-4 border-slate-300 pl-4">
                      "Market sentiment analysis shows high expectations for Vision Pro pre-orders. Technical indicators (RSI at 52) suggest room for upward momentum. Cross-referencing news reports on supply chain stability in Vietnam leads to a high-confidence bullish prediction for the 24-hour window."
                    </p>
</div>
<div>
<h4 class="text-xs font-bold uppercase text-slate-400 mb-2">Search Reports Analyzed</h4>
<ul class="text-xs space-y-2">
<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Bloomberg: AAPL Supply Chain Update</li>
<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Reuters: Tech Sector Sentiment Index</li>
<li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> SEC Filings: Institutional Holdings 13F</li>
</ul>
</div>
</div>
</td>
</tr>
<!-- Row 2 -->
<tr class="hover:bg-slate-50 transition-colors">
<td class="px-6 py-4 whitespace-nowrap text-slate-500">Feb 13, 2024</td>
<td class="px-6 py-4 font-semibold text-rose-600">BEARISH</td>
<td class="px-6 py-4 font-semibold text-emerald-600">BULLISH</td>
<td class="px-6 py-4 text-emerald-600">+0.82%</td>
<td class="px-6 py-4">$182.01</td>
<td class="px-6 py-4 text-center">
<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-xs font-bold">NO</span>
</td>
<td class="px-6 py-4">
<button class="text-indigo-600 hover:underline font-medium" onclick="toggleReasoning('r2')">View Reasoning</button>
</td>
</tr>
<tr class="hidden bg-slate-50" id="r2">
<td class="px-8 py-6" colspan="7">
<p class="text-slate-600 italic">Self-Reflection Slot #39 applied: The model missed the late-day short squeeze triggered by macro-tech sector recovery. </p>
</td>
</tr>
</tbody>
</table>
</div>
<div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-center">
<button class="text-sm font-bold text-slate-500 hover:text-slate-800">Load More History</button>
</div>
</section>
<!-- END: PredictionHistory -->
<!-- BEGIN: ActionFooter -->
<div class="mt-12 mb-20 flex justify-center">
<a class="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl active:scale-95" href="#">
<svg class="h-5 w-5" fill="currentColor" viewbox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
<path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path>
</svg>
        Back to Dashboard
      </a>
</div>
<!-- END: ActionFooter -->
</main>
<!-- BEGIN: ChartScripts -->
<script data-purpose="price-chart-setup">
    const priceCtx = document.getElementById('priceChart').getContext('2d');
    new Chart(priceCtx, {
      type: 'line',
      data: {
        labels: ['Jan 20', 'Jan 23', 'Jan 26', 'Jan 29', 'Feb 01', 'Feb 04', 'Feb 07', 'Feb 10', 'Feb 13', 'Feb 14'],
        datasets: [{
          label: 'Price',
          data: [180.20, 182.50, 181.10, 185.30, 183.20, 186.80, 188.40, 187.10, 182.01, 184.15],
          borderColor: '#64748b',
          borderWidth: 2,
          pointBackgroundColor: (context) => {
            const index = context.dataIndex;
            // Simplified logic for markers
            if (index === 9) return '#10b981'; // Correct
            if (index === 8) return '#f43f5e'; // Incorrect
            return 'transparent';
          },
          pointRadius: (context) => {
            const index = context.dataIndex;
            return (index === 8 || index === 9) ? 6 : 0;
          },
          tension: 0.2,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      }
    });
  </script>
<script data-purpose="win-rate-chart-setup">
    const winRateCtx = document.getElementById('winRateChart').getContext('2d');
    new Chart(winRateCtx, {
      type: 'line',
      data: {
        labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
        datasets: [{
          label: 'Accuracy',
          data: [62, 65, 64, 69, 72.4],
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.05)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#4f46e5'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { 
            min: 50, 
            max: 100,
            ticks: { callback: (value) => value + '%', font: { size: 10 } }
          },
          x: { ticks: { font: { size: 10 } } }
        }
      }
    });
  </script>
<script data-purpose="event-handlers">
    function toggleReasoning(id) {
      const row = document.getElementById(id);
      if (row.classList.contains('hidden')) {
        row.classList.remove('hidden');
      } else {
        row.classList.add('hidden');
      }
    }
  </script>
<!-- END: ChartScripts -->
</body></html>