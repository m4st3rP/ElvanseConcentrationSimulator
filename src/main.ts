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

let dosesA: Dose[] = [];
let dosesB: Dose[] = [];
let compareMode = false;
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

interface PlotStats {
  maxC: number; minC: number; maxTime: string; minTime: string;
  diffC: number; meanC: number; medianC: number;
  durationHours: number; durationPct: number;
  durationStart: string; durationEnd: string;
}

function calculateDatasetStats(pointsPerHour: number, data: number[], labels: string[], thresholdPct: number, referenceMaxC: number | null = null): PlotStats {
  let maxC = -Infinity, minC = Infinity;
  let maxTime = '', minTime = '';
  
  data.forEach((c, idx) => {
    if (c > maxC) { maxC = c; maxTime = labels[idx]; }
    if (c < minC) { minC = c; minTime = labels[idx]; }
  });
  
  if (data.length === 0 || minC === Infinity) {
    minC = 0; maxC = 0;
  }
  
  const diffC = Number(maxC.toFixed(1)) - Number(minC.toFixed(1));
  const meanC = data.length > 0 ? (data.reduce((a, b) => a + b, 0) / data.length) : 0;
  const sortedData = [...data].sort((a, b) => a - b);
  const medianC = sortedData.length > 0 ? sortedData[Math.floor(sortedData.length / 2)] : 0;
  
  const thresholdRatio = thresholdPct / 100;
  const effectiveMax = referenceMaxC !== null ? referenceMaxC : maxC;
  const thresholdVal = effectiveMax * thresholdRatio;
  
  const durationCount = data.filter(c => c > thresholdVal).length;
  const durationHours = durationCount / pointsPerHour;
  const durationPct = data.length > 0 ? (durationCount / data.length) * 100 : 0;

  let firstOverIdx = -1;
  let firstUnderAfterIdx = -1;
  
  for (let i = 0; i < data.length; i++) {
    if (data[i] > thresholdVal) {
      if (firstOverIdx === -1) firstOverIdx = i;
    } else if (firstOverIdx !== -1 && firstUnderAfterIdx === -1) {
      firstUnderAfterIdx = i - 1;
    }
  }
  if (firstOverIdx !== -1 && firstUnderAfterIdx === -1) {
    firstUnderAfterIdx = data.length - 1;
  }

  const durationStart = firstOverIdx !== -1 ? labels[firstOverIdx] : '';
  const durationEnd = firstUnderAfterIdx !== -1 ? labels[firstUnderAfterIdx] : '';
  
  return { maxC, minC, maxTime, minTime, diffC, meanC, medianC, durationHours, durationPct, durationStart, durationEnd };
}

function formatDiff(b: number, a: number, unit = ''): string {
  const diff = Number(b.toFixed(1)) - Number(a.toFixed(1));
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}${unit}`;
}

function updateChart() {
  const ctx = document.getElementById('level-chart') as HTMLCanvasElement;
  const startFresh = (document.getElementById('start-fresh') as HTMLInputElement).checked;
  const halfLife = Number((document.getElementById('half-life-input') as HTMLInputElement).value);
  const daysShown = Number((document.getElementById('days-shown-input') as HTMLInputElement).value);
  const thresholdPct = Number((document.getElementById('threshold-input') as HTMLInputElement).value);
  const ke = 0.693 / halfLife;
  
  // Start Fresh = plot from Hour 0
  // Steady state = plot after 21 days of buildup (Hour 504) to ensure accuracy even with 34h half-life
  const startPlotHour = startFresh ? 0 : 504; 
  const endPlotHour = startPlotHour + (daysShown * 24);
  const pointsPerHour = 12;  // evaluate every 5 minutes
  
  const labels: string[] = [];
  const dataA: number[] = [];
  const dataB: number[] = [];
  
  const totalSteps = (endPlotHour - startPlotHour) * pointsPerHour;
  for (let step = 0; step <= totalSteps; step++) {
    const h = startPlotHour + (step / pointsPerHour);
    
    const hourOfDay = h % 24;
    const dayOfPlot = Math.floor((h - startPlotHour) / 24) + 1;
    const hDisplay = Math.floor(hourOfDay).toString().padStart(2, '0');
    // small round needed for floating point precision of steps like 0.08333333333333333
    const mDisplay = Math.round((hourOfDay % 1) * 60).toString().padStart(2, '0');
    
    const timeLabel = `Day ${dayOfPlot} ${hDisplay}:${mDisplay}`;
    labels.push(timeLabel);
    
    dataA.push(calculateTotalConcentration(h, dosesA, ke));
    if (compareMode) {
      dataB.push(calculateTotalConcentration(h, dosesB, ke));
    }
  }
  
  const statsA = calculateDatasetStats(pointsPerHour, dataA, labels, thresholdPct);
  const statsB = compareMode ? calculateDatasetStats(pointsPerHour, dataB, labels, thresholdPct, statsA.maxC) : null;
  
  document.getElementById('stat-window')!.innerText = (daysShown * 24).toString();
  
  // Update Table
  const tbody = document.getElementById('stats-tbody')!;
  tbody.innerHTML = '';
  
  const metrics = [
    { name: 'Max', valA: statsA.maxC, valB: statsB?.maxC, unit: ' ng/mL', subA: ` (at ${statsA.maxTime})`, subB: statsB ? ` (at ${statsB.maxTime})` : '' },
    { name: 'Min', valA: statsA.minC, valB: statsB?.minC, unit: ' ng/mL', subA: ` (at ${statsA.minTime})`, subB: statsB ? ` (at ${statsB.minTime})` : '' },
    { name: 'Fluctuation', valA: statsA.diffC, valB: statsB?.diffC, unit: ' ng/mL' },
    { name: 'Mean', valA: statsA.meanC, valB: statsB?.meanC, unit: ' ng/mL' },
    { name: 'Median', valA: statsA.medianC, valB: statsB?.medianC, unit: ' ng/mL' },
    { 
      name: `Time >${thresholdPct}% of A's Peak`, 
      valA: statsA.durationHours, 
      valB: statsB?.durationHours, 
      unit: 'h', 
      subA: statsA.durationStart ? `<br/>(from ${statsA.durationStart} to ${statsA.durationEnd})` : '', 
      subB: statsB?.durationStart ? `<br/>(from ${statsB.durationStart} to ${statsB.durationEnd})` : '' 
    },
  ];
  
  metrics.forEach(m => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border)';
    
    let html = `<td style="padding: 0.5rem 0;"><strong>${m.name}</strong></td>`;
    html += `<td style="padding: 0.5rem 0;">${m.valA.toFixed(1)}${m.unit} <span style="color:#bcbcbc;font-size:0.85em">${m.subA || ''}</span></td>`;
    
    if (compareMode && statsB) {
      html += `<td style="padding: 0.5rem 0;">${m.valB!.toFixed(1)}${m.unit} <span style="color:#bcbcbc;font-size:0.85em">${m.subB || ''}</span></td>`;
      html += `<td style="padding: 0.5rem 0;">${formatDiff(m.valB!, m.valA)}${m.unit}</td>`;
    } else {
      html += `<td style="display:none;"></td><td style="display:none;"></td>`;
    }
    
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });
  
  document.getElementById('th-scenario-b')!.style.display = compareMode ? 'table-cell' : 'none';
  document.getElementById('th-difference')!.style.display = compareMode ? 'table-cell' : 'none';

  if (chartInstance) {
    chartInstance.destroy();
  }
  
  Chart.defaults.color = '#a3a3a3';
  Chart.defaults.borderColor = '#333333';
  
  const datasets = [{
    label: (compareMode ? 'Scenario A (ng/mL)' : 'Dextroamphetamine (ng/mL)'),
    data: dataA,
    borderColor: '#059669',
    backgroundColor: 'rgba(5, 150, 105, 0.2)',
    borderWidth: 2,
    fill: true,
    tension: 0.4,
    pointRadius: 0,
    pointHitRadius: 10
  }];
  
  if (compareMode) {
    datasets.push({
      label: 'Scenario B (ng/mL)',
      data: dataB,
      borderColor: '#9333ea', // Purple
      backgroundColor: 'rgba(147, 51, 234, 0.2)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHitRadius: 10
    });
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets
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

function renderDoseList(targetListId: string, doseArray: Dose[]) {
  const list = document.getElementById(targetListId)!;
  list.innerHTML = '';
  
  // Sort doses by time
  const sorted = [...doseArray].sort((a, b) => timeToHours(a.time) - timeToHours(b.time));
  
  sorted.forEach(dose => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span><strong>${dose.time}</strong> - ${dose.amount}mg</span>
      <button class="remove-dose" data-id="${dose.id}" data-target="${targetListId}">Remove</button>
    `;
    list.appendChild(li);
  });
  
  document.querySelectorAll(`#${targetListId} .remove-dose`).forEach(btn => {
    btn.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const id = el.getAttribute('data-id');
      const target = el.getAttribute('data-target');
      
      if (target === 'dose-list-a') {
        dosesA = dosesA.filter(d => d.id !== id);
      } else {
        dosesB = dosesB.filter(d => d.id !== id);
      }
      
      saveData();
      renderAllDoseLists();
      updateChart();
    });
  });
}

function renderAllDoseLists() {
  renderDoseList('dose-list-a', dosesA);
  if (compareMode) {
    renderDoseList('dose-list-b', dosesB);
  }
}

function saveData() {
  localStorage.setItem('elvanse_doses', JSON.stringify(dosesA));
  localStorage.setItem('elvanse_doses_b', JSON.stringify(dosesB));
  localStorage.setItem('elvanse_compare_mode', JSON.stringify(compareMode));
}

function loadData() {
  const savedA = localStorage.getItem('elvanse_doses');
  if (savedA) {
    try { dosesA = JSON.parse(savedA); } catch (e) { dosesA = []; }
  } else {
    dosesA = [{ id: Date.now().toString(), time: "08:00", amount: 30 }];
  }
  
  const savedB = localStorage.getItem('elvanse_doses_b');
  if (savedB) {
    try { dosesB = JSON.parse(savedB); } catch (e) { dosesB = []; }
  } else {
    dosesB = [{ id: Date.now().toString(), time: "10:00", amount: 20 }];
  }
  
  const savedCompare = localStorage.getItem('elvanse_compare_mode');
  if (savedCompare) {
    try { compareMode = JSON.parse(savedCompare); } catch (e) { compareMode = false; }
  }
}

// Sync and react to setting changes
const compareModeCheckbox = document.getElementById('compare-mode') as HTMLInputElement;
compareModeCheckbox.checked = compareMode;
document.getElementById('scenario-b-container')!.style.display = compareMode ? 'block' : 'none';

compareModeCheckbox.addEventListener('change', (e) => {
  compareMode = (e.target as HTMLInputElement).checked;
  document.getElementById('scenario-b-container')!.style.display = compareMode ? 'block' : 'none';
  saveData();
  renderAllDoseLists();
  updateChart();
});
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

document.getElementById('dose-form-a')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const timeInput = document.getElementById('time-a') as HTMLInputElement;
  const amountInput = document.getElementById('amount-a') as HTMLInputElement;
  
  dosesA.push({
    id: Date.now().toString(),
    time: timeInput.value,
    amount: Number(amountInput.value)
  });
  
  saveData();
  renderAllDoseLists();
  updateChart();
});

document.getElementById('dose-form-b')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const timeInput = document.getElementById('time-b') as HTMLInputElement;
  const amountInput = document.getElementById('amount-b') as HTMLInputElement;
  
  dosesB.push({
    id: Date.now().toString(),
    time: timeInput.value,
    amount: Number(amountInput.value)
  });
  
  saveData();
  renderAllDoseLists();
  updateChart();
});

// Init
loadData();
compareModeCheckbox.checked = compareMode;
document.getElementById('scenario-b-container')!.style.display = compareMode ? 'block' : 'none';
renderAllDoseLists();
updateChart();
