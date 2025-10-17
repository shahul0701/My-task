
// Firebase config and init
const firebaseConfig = {
  apiKey: "AIzaSyD9ymWqihHWbVb4IRop1lXT-huLjBvS50w",
  authDomain: "task-manager-602da.firebaseapp.com",
  projectId: "task-manager-602da",
  storageBucket: "task-manager-602da.appspot.com",
  messagingSenderId: "438978699329",
  appId: "1:438978699329:web:9f475d04352bbdaa5ce6c0"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const ctxs = {
  status: document.getElementById('statusChart').getContext('2d'),
  owner: document.getElementById('ownerChart').getContext('2d'),
  type: document.getElementById('typeChart').getContext('2d'),
  assignedBy: document.getElementById('assignedByChart').getContext('2d'),
  monthly: document.getElementById('monthlyChart').getContext('2d'),
  avgWork: document.getElementById('avgWorkChart').getContext('2d'),
  avgPause: document.getElementById('avgPauseChart').getContext('2d'),
  completeTimeline: document.getElementById('completeTimelineChart').getContext('2d'),
  company: document.getElementById('companyChart').getContext('2d'),
  avgDuration: document.getElementById('avgDurationChart').getContext('2d'),
  avgDurationOwner: document.getElementById('avgDurationOwnerChart').getContext('2d'),
  radar: document.getElementById('radarChart').getContext('2d'),
  bubble: document.getElementById('bubbleChart').getContext('2d'),
};

let charts = {};
let alltasks = [], filteredtasks = [];

// Inject filter UI
const filterHTML = `
  <div id="filterSection" style="margin: 20px 0;">
    <button id="showAllBtn">Show All</button>
    <button id="prevMonthBtn">Previous Month</button>
    <button id="thisMonthBtn">This Month</button>
    <label for="startDate">From:</label>
    <input type="date" id="startDate" />
    <label for="endDate">To:</label>
    <input type="date" id="endDate" />
    <button id="applyCustomBtn">Apply</button>
  </div>
`;
document.body.insertAdjacentHTML("afterbegin", filterHTML);

// --- UTILS ---
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value.toDate) return value.toDate();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value);
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function parseTimeToMinutes(str) {
  if (!str) return 0;
  const [h, m, s] = str.split(':').map(Number);
  return h * 60 + m + (s || 0) / 60;
}

function countByField(tasks, field) {
  const counts = {};
  tasks.forEach(t => {
    const val = t[field] || 'Unknown';
    counts[val] = (counts[val] || 0) + 1;
  });
  return counts;
}

function monthlyCompletedtasks(tasks) {
  const now = new Date();
  const counts = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleString('default', { year: 'numeric', month: 'short' });
    counts[key] = 0;
  }
  tasks.forEach(t => {
    if (t.Status === 'Complete') {
      const d = toDate(t['Due date']);
      if (!d) return;
      const key = d.toLocaleString('default', { year: 'numeric', month: 'short' });
      if (counts[key] !== undefined) counts[key]++;
    }
  });
  return counts;
}

function avgWorkPause(tasks) {
  const work = [], pause = [];
  tasks.forEach(t => {
    if (t.Status === 'Complete') {
      work.push(parseTimeToMinutes(t['TOTAL OUT OF HOURS'] || '0:00:00'));
      pause.push(parseTimeToMinutes(t.TotalPauseHours || '0:00:00'));
    }
  });
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  return { avgWorkMins: avg(work), avgPauseMins: avg(pause) };
}

function completionTimeline(tasks) {
  const now = new Date();
  const counts = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    counts[d.toISOString().slice(0, 10)] = 0;
  }
  tasks.forEach(t => {
    if (t.Status === 'Complete') {
      const d = toDate(t['Due date']);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      if (counts[key] !== undefined) counts[key]++;
    }
  });
  return counts;
}

function avgDurationByField(tasks, field) {
  const map = {};
  tasks.forEach(t => {
    if (t.Status === 'Complete') {
      const key = t[field] || 'Unknown';
      const dur = parseTimeToMinutes(t['TOTAL OUT OF HOURS']);
      if (!map[key]) map[key] = [];
      if (dur) map[key].push(dur);
    }
  });
  const result = {};
  for (const key in map) {
    const arr = map[key];
    result[key] = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }
  return result;
}

function buildRadarData(tasks) {
  const companiesAvg = avgDurationByField(tasks, 'Company');
  const ownersAvg = avgDurationByField(tasks, 'Owner');
  const labels = [...new Set([...Object.keys(companiesAvg), ...Object.keys(ownersAvg)])];
  return {
    labels,
    companyData: labels.map(l => companiesAvg[l] || 0),
    ownerData: labels.map(l => ownersAvg[l] || 0)
  };
}

function buildBubbleData(tasks) {
  const counts = countByField(tasks, 'Company');
  const avgs = avgDurationByField(tasks, 'Company');
  return Object.keys(counts).map(c => ({
    x: counts[c],
    y: avgs[c] || 0,
    r: Math.max(5, Math.min(20, Math.sqrt(counts[c]) * 3))
  }));
}

function generateColors(n) {
  return Array.from({ length: n }, (_, i) => `hsl(${(i * 360) / n}, 70%, 60%)`);
}

function formatPie(obj) {
  const labels = Object.keys(obj);
  const data = Object.values(obj);
  return {
    labels,
    datasets: [{
      label: 'Count',
      data,
      backgroundColor: generateColors(labels.length)
    }]
  };
}

// CHART RENDERER
function createChart(ctx, config) {
  if (charts[ctx.canvas.id]) charts[ctx.canvas.id].destroy();
  charts[ctx.canvas.id] = new Chart(ctx, config);
}

function updateCharts(tasks) {
  createChart(ctxs.status, {
    type: 'pie',
    data: formatPie(countByField(tasks, 'Status')),
    options: { plugins: { title: { display: true, text: 'Status' } } }
  });

  createChart(ctxs.owner, {
    type: 'pie',
    data: formatPie(countByField(tasks, 'Owner')),
    options: { plugins: { title: { display: true, text: 'Owner' } } }
  });

  createChart(ctxs.type, {
    type: 'bar',
    data: formatPie(countByField(tasks, 'TYPE OF WORK')),
    options: { plugins: { title: { display: true, text: 'Type of Work' } }, indexAxis: 'y' }
  });

  createChart(ctxs.assignedBy, {
    type: 'bar',
    data: formatPie(countByField(tasks, 'Assigned By')),
    options: { plugins: { title: { display: true, text: 'Assigned By' } }, indexAxis: 'y' }
  });

  createChart(ctxs.monthly, {
    type: 'bar',
    data: formatPie(monthlyCompletedtasks(tasks)),
    options: { plugins: { title: { display: true, text: 'Monthly Completed tasks' } } }
  });

  const avg = avgWorkPause(tasks);
  createChart(ctxs.avgWork, {
    type: 'bar',
    data: {
      labels: ['Average Work Minutes'],
      datasets: [{ label: 'Avg Work Time', data: [avg.avgWorkMins], backgroundColor: 'green' }]
    }
  });

  createChart(ctxs.avgPause, {
    type: 'bar',
    data: {
      labels: ['Average Pause Minutes'],
      datasets: [{ label: 'Avg Pause Time', data: [avg.avgPauseMins], backgroundColor: 'orange' }]
    }
  });

  createChart(ctxs.completeTimeline, {
    type: 'line',
    data: formatPie(completionTimeline(tasks)),
    options: {
      plugins: { title: { display: true, text: 'Daily Completed tasks (30 Days)' } },
      scales: { x: { ticks: { maxRotation: 90, minRotation: 45 } } }
    }
  });

  createChart(ctxs.company, {
    type: 'pie',
    data: formatPie(countByField(tasks, 'Company')),
    options: { plugins: { title: { display: true, text: 'Company tasks' } } }
  });

  createChart(ctxs.avgDuration, {
    type: 'bar',
    data: formatPie(avgDurationByField(tasks, 'Company')),
    options: { plugins: { title: { display: true, text: 'Avg Duration per Company' } }, indexAxis: 'y' }
  });

  createChart(ctxs.avgDurationOwner, {
    type: 'bar',
    data: formatPie(avgDurationByField(tasks, 'Owner')),
    options: { plugins: { title: { display: true, text: 'Avg Duration per Owner' } }, indexAxis: 'y' }
  });

  const radar = buildRadarData(tasks);
  createChart(ctxs.radar, {
    type: 'radar',
    data: {
      labels: radar.labels,
      datasets: [
        { label: 'Companies', data: radar.companyData, fill: true, backgroundColor: 'rgba(0,99,132,0.2)', borderColor: 'rgb(0,99,132)' },
        { label: 'Owners', data: radar.ownerData, fill: true, backgroundColor: 'rgba(255,159,64,0.2)', borderColor: 'rgb(255,159,64)' }
      ]
    },
    options: { plugins: { title: { display: true, text: 'Radar: Company vs Owner Duration' } } }
  });

  createChart(ctxs.bubble, {
    type: 'bubble',
    data: {
      datasets: [{
        label: 'Company: Duration vs Count',
        data: buildBubbleData(tasks),
        backgroundColor: 'rgba(255,99,132,0.5)'
      }]
    },
    options: {
      plugins: { title: { display: true, text: 'Bubble Chart - Company tasks' } },
      scales: {
        x: { title: { display: true, text: 'Number of tasks' } },
        y: { title: { display: true, text: 'Avg Duration (min)' } }
      }
    }
  });
}

// FILTERS
function applyFilter(filterFunc) {
  filteredtasks = alltasks.filter(filterFunc);
  updateCharts(filteredtasks);
}

function loadtasks() {
  db.collection('tasks').get()
    .then(snapshot => {
      alltasks = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          'Due date': toDate(data['Due date']),
          'Time Started': toDate(data['Time Started']),
          'Time End': toDate(data['Time End']),
          'TOTAL OUT OF HOURS': data['TOTAL OUT OF HOURS'] || '0:00:00',
          'TotalPauseHours': data['TotalPauseHours'] || '0:00:00',
          'Company': data['Existing Company Name'] || 'Unknown'
        };
      });
      filteredtasks = [...alltasks];
      updateCharts(filteredtasks);
    })
    .catch(error => console.error("Error loading tasks:", error));
}

// Event listeners
document.getElementById('showAllBtn').onclick = () => applyFilter(() => true);

document.getElementById('thisMonthBtn').onclick = () => {
  const now = new Date();
  applyFilter(t => {
    const d = toDate(t['Due date']);
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
};

document.getElementById('prevMonthBtn').onclick = () => {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  applyFilter(t => {
    const d = toDate(t['Due date']);
    return d && d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
  });
};

document.getElementById('applyCustomBtn').onclick = () => {
  const start = new Date(document.getElementById('startDate').value);
  const end = new Date(document.getElementById('endDate').value);
  if (!start || !end) return alert('Please select valid dates');
  applyFilter(t => {
    const d = toDate(t['Due date']);
    return d && d >= start && d <= end;
  });
};

// Initial load
loadtasks();
