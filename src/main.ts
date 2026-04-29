import './style.css';
import Chart from 'chart.js/auto';

// --- PK Model Parameters ---
const KA = 1.386;       // Absorption rate (hr^-1)
const T_LAG = 0.75;     // Lag time (hr)
const BIO_FA = 0.67;    // ng/mL per mg dose

interface Dose {
  id: string;
  time: string; // HH:MM
  amount: number; // mg
}

let doses: Dose[] = [];
let chartInstance: Chart | null = null;

// Convert HH:MM to decimal hours (0-24)
function timeToHours(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h + (m / 60);
}

// Calculate concentration from a single dose at time `t_offset` (hours since dose was taken)
function getConcentration(doseMg: number, t_offset: number, ke: number): number {
  if (t_offset < T_LAG) return 0;
  
  const t_adj = t_offset - T_LAG;
  const cmax = doseMg * BIO_FA;
  const numerator = cmax * (KA / (KA - ke));
  const term1 = Math.exp(-ke * t_adj);
  const term2 = Math.exp(-KA * t_adj);
  
  const val = numerator * (term1 - term2);
  return val > 0 ? val : 0; // prevent tiny negative float errors
}

// Calculate total concentration at a specific absolute hour (0 to totalHours)
// assuming doses are taken DAILY at their specified times.
function calculateTotalConcentration(abshour: number, dailyDoses: Dose[], ke: number): number {
  let totalC = 0;
  
  // For each day from 0 up to the day this absolute hour falls in
  for (let day = 0; day <= Math.floor(abshour / 24); day++) {
    for (const dose of dailyDoses) {
      const doseTimeHour = (day * 24) + timeToHours(dose.time);
      if (abshour >= doseTimeHour) {
        totalC += getConcentration(dose.amount, abshour - doseTimeHour, ke);
      }
    }
  }
  
  return totalC;
}

function updateChart() {
  const ctx = document.getElementById('level-chart') as HTMLCanvasElement;
  const startFresh = (document.getElementById('start-fresh') as HTMLInputElement).checked;
  const halfLife = Number((document.getElementById('half-life-input') as HTMLInputElement).value);
  const daysShown = Number((document.getElementById('days-shown-input') as HTMLInputElement).value);
  const thresholdPct = Number((document.getElementById('threshold-input') as HTMLInputElement).value);
  const ke = 0.693 / halfLife;
  
  // Start Fresh = plot from Hour 0
  // Steady state = plot after 5 days of buildup (Hour 120)
  const startPlotHour = startFresh ? 0 : 120; 
  const endPlotHour = startPlotHour + (daysShown * 24);
  const pointsPerHour = 4;  // every 15 minutes
  
  const labels: string[] = [];
  const data: number[] = [];
  
  let maxC = -Infinity, minC = Infinity;
  let maxTime = '', minTime = '';
  
  for (let h = startPlotHour; h <= endPlotHour; h += (1 / pointsPerHour)) {
    // Format label: Wrap back to 0-24 for display
    const hourOfDay = h % 24;
    const dayOfPlot = Math.floor((h - startPlotHour) / 24) + 1;
    const hDisplay = Math.floor(hourOfDay).toString().padStart(2, '0');
    const mDisplay = Math.round((hourOfDay % 1) * 60).toString().padStart(2, '0');
    
    const timeLabel = `Day ${dayOfPlot} ${hDisplay}:${mDisplay}`;
    labels.push(timeLabel);
    
    const c = calculateTotalConcentration(h, doses, ke);
    data.push(c);
    
    // Use threshold to avoid micro-float drift overriding to later days
    if (c > maxC + 0.01) { maxC = c; maxTime = timeLabel; }
    if (c < minC - 0.01) { minC = c; minTime = timeLabel; }
  }
  
  // If there's no dose added, minC stays Infinity
  if (data.length === 0 || minC === Infinity) {
    minC = 0; maxC = 0;
  }

  const diffC = maxC - minC;
  const meanC = data.length > 0 ? (data.reduce((a, b) => a + b, 0) / data.length) : 0;
  
  const sortedData = [...data].sort((a, b) => a - b);
  const medianC = sortedData.length > 0 ? sortedData[Math.floor(sortedData.length / 2)] : 0;
  
  const thresholdRatio = thresholdPct / 100;
  const durationCount = data.filter(c => c > (maxC * thresholdRatio)).length;
  // Convert points to hours (each point is 1/pointsPerHour hr)
  const durationHours = durationCount / pointsPerHour;
  const durationPct = data.length > 0 ? (durationCount / data.length) * 100 : 0;

  document.getElementById('stat-window')!.innerText = (daysShown * 24).toString();
  document.getElementById('stat-max')!.innerHTML = `${maxC.toFixed(1)} ng/mL <span style="color:#bcbcbc;font-size:0.9em">(at ${maxTime})</span>`;
  document.getElementById('stat-min')!.innerHTML = `${minC.toFixed(1)} ng/mL <span style="color:#bcbcbc;font-size:0.9em">(at ${minTime})</span>`;
  document.getElementById('stat-diff')!.innerHTML = `${diffC.toFixed(1)} ng/mL <span style="color:#bcbcbc;font-size:0.9em">(fluctuation)</span>`;
  document.getElementById('stat-mean')!.innerHTML = `${meanC.toFixed(1)} ng/mL`;
  document.getElementById('stat-median')!.innerHTML = `${medianC.toFixed(1)} ng/mL`;
  document.getElementById('stat-duration')!.innerHTML = `${durationHours.toFixed(1)} hours <span style="color:#bcbcbc;font-size:0.9em">(${durationPct.toFixed(1)}% of time above ${thresholdPct}% peak)</span>`;
  
  if (chartInstance) {
    chartInstance.destroy();
  }
  
  Chart.defaults.color = '#a3a3a3';
  Chart.defaults.borderColor = '#333333';

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Dextroamphetamine Blood Concentration (ng/mL)',
        data,
        borderColor: '#059669',
        backgroundColor: 'rgba(5, 150, 105, 0.2)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHitRadius: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 24 // Don't crowd x-axis
          }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Concentration (ng/mL)'
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.parsed.y !== null ? `${context.parsed.y.toFixed(1)} ng/mL` : '';
            }
          }
        }
      }
    }
  });
}

function renderDoseList() {
  const list = document.getElementById('dose-list')!;
  list.innerHTML = '';
  
  // Sort doses by time
  const sorted = [...doses].sort((a, b) => timeToHours(a.time) - timeToHours(b.time));
  
  sorted.forEach(dose => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span><strong>${dose.time}</strong> - ${dose.amount}mg</span>
      <button class="remove-dose" data-id="${dose.id}">Remove</button>
    `;
    list.appendChild(li);
  });
  
  document.querySelectorAll('.remove-dose').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).getAttribute('data-id');
      doses = doses.filter(d => d.id !== id);
      saveData();
      renderDoseList();
      updateChart();
    });
  });
}

function saveData() {
  localStorage.setItem('elvanse_doses', JSON.stringify(doses));
}

function loadData() {
  const saved = localStorage.getItem('elvanse_doses');
  if (saved) {
    try {
      doses = JSON.parse(saved);
    } catch (e) {
      doses = [];
    }
  } else {
    // Default dose
    doses = [{ id: Date.now().toString(), time: "08:00", amount: 30 }];
  }
}

// Sync and react to setting changes
const startFreshCheckbox = document.getElementById('start-fresh') as HTMLInputElement;
const halfLifeSlider = document.getElementById('half-life-slider') as HTMLInputElement;
const halfLifeInput = document.getElementById('half-life-input') as HTMLInputElement;

const daysShownSlider = document.getElementById('days-shown-slider') as HTMLInputElement;
const daysShownInput = document.getElementById('days-shown-input') as HTMLInputElement;

const thresholdSlider = document.getElementById('threshold-slider') as HTMLInputElement;
const thresholdInput = document.getElementById('threshold-input') as HTMLInputElement;

startFreshCheckbox.addEventListener('change', updateChart);

halfLifeSlider.addEventListener('input', (e) => {
  halfLifeInput.value = (e.target as HTMLInputElement).value;
  updateChart();
});

halfLifeInput.addEventListener('input', (e) => {
  // bound the realistic input
  let val = Number((e.target as HTMLInputElement).value);
  if (val < 7) val = 7;
  if (val > 34) val = 34;
  halfLifeSlider.value = val.toString();
  updateChart();
});

daysShownSlider.addEventListener('input', (e) => {
  daysShownInput.value = (e.target as HTMLInputElement).value;
  updateChart();
});
daysShownInput.addEventListener('input', (e) => {
  let val = Number((e.target as HTMLInputElement).value);
  if (val < 1) val = 1;
  if (val > 14) val = 14;
  daysShownSlider.value = val.toString();
  updateChart();
});

thresholdSlider.addEventListener('input', (e) => {
  thresholdInput.value = (e.target as HTMLInputElement).value;
  updateChart();
});
thresholdInput.addEventListener('input', (e) => {
  let val = Math.round(Number((e.target as HTMLInputElement).value));
  if (val < 10) val = 10;
  if (val > 90) val = 90;
  thresholdSlider.value = val.toString();
  updateChart();
});

document.getElementById('dose-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const timeInput = document.getElementById('time') as HTMLInputElement;
  const amountInput = document.getElementById('amount') as HTMLInputElement;
  
  doses.push({
    id: Date.now().toString(),
    time: timeInput.value,
    amount: Number(amountInput.value)
  });
  
  saveData();
  renderDoseList();
  updateChart();
});

// Init
loadData();
renderDoseList();
updateChart();
