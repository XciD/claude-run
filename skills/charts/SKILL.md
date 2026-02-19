---
name: charts
description: Generate interactive charts and data visualizations using html:preview blocks. Use this skill when the user asks to create charts, graphs, dashboards, or data visualizations. Examples include "make a chart", "graph this data", "visualize", "plot", "dashboard", "bar chart", "line chart", "pie chart".
---

# Charts & Data Visualization

Generate charts using `html:preview` fenced code blocks. claude-run renders these in sandboxed iframes.

## Constraints

- **No external dependencies**: sandboxed iframes block CDN/external scripts. Use Canvas API only.
- **Self-contained**: each preview must be a complete HTML document with inline CSS and JS.
- **Auto-height**: claude-run injects a ResizeObserver — don't set fixed body height.
- **Dark theme by default**: use dark backgrounds (#1a1a2e or similar), light text, vibrant colors for data.

## Output Format

Wrap the full HTML in a fenced code block with the `html:preview` language tag:

````
```html:preview
<!DOCTYPE html>
<html><head><style>...</style></head><body>...<script>...</script></body></html>
```
````

## Chart Drawing Library

Use this minimal Canvas helper pattern for all charts. It handles DPI scaling, axis drawing, and gridlines.

### Canvas Setup (copy into every chart)

```javascript
function setupCanvas(id, padding) {
  const canvas = document.getElementById(id);
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  const p = padding || { top: 30, right: 20, bottom: 40, left: 55 };
  const plotW = w - p.left - p.right;
  const plotH = h - p.top - p.bottom;
  return { canvas, ctx, w, h, p, plotW, plotH, dpr };
}
```

### Axis & Grid Helper

```javascript
function drawAxes(ctx, p, plotW, plotH, xLabels, yMin, yMax, ySteps, opts) {
  opts = opts || {};
  const gridColor = opts.gridColor || 'rgba(255,255,255,0.07)';
  const textColor = opts.textColor || 'rgba(255,255,255,0.5)';
  const axisColor = opts.axisColor || 'rgba(255,255,255,0.15)';

  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;
  // Y axis
  ctx.beginPath();
  ctx.moveTo(p.left, p.top);
  ctx.lineTo(p.left, p.top + plotH);
  ctx.stroke();
  // X axis
  ctx.beginPath();
  ctx.moveTo(p.left, p.top + plotH);
  ctx.lineTo(p.left + plotW, p.top + plotH);
  ctx.stroke();

  // Y gridlines + labels
  ctx.font = '11px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (var i = 0; i <= ySteps; i++) {
    var y = p.top + plotH - (i / ySteps) * plotH;
    var val = yMin + (i / ySteps) * (yMax - yMin);
    ctx.strokeStyle = gridColor;
    ctx.beginPath();
    ctx.moveTo(p.left, y);
    ctx.lineTo(p.left + plotW, y);
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.fillText(opts.formatY ? opts.formatY(val) : val.toFixed(0), p.left - 8, y);
  }

  // X labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  var step = Math.max(1, Math.floor(xLabels.length / 8));
  for (var j = 0; j < xLabels.length; j += step) {
    var x = p.left + (j / (xLabels.length - 1)) * plotW;
    ctx.fillStyle = textColor;
    ctx.fillText(xLabels[j], x, p.top + plotH + 6);
  }
}
```

---

## Templates

### Line Chart

```html
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; color: #e0e0e0; font-family: -apple-system, system-ui, sans-serif; padding: 20px; }
  h2 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 16px; }
  canvas { width: 100%; height: 250px; }
  .legend { display: flex; gap: 16px; margin-top: 10px; justify-content: center; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: rgba(255,255,255,0.6); }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
</style>
</head>
<body>
<h2>TITLE</h2>
<div class="subtitle">SUBTITLE</div>
<canvas id="chart"></canvas>
<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:#6366f1"></div>Series A</div>
  <div class="legend-item"><div class="legend-dot" style="background:#22d3ee"></div>Series B</div>
</div>
<script>
// DATA
var labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
var series = [
  { data: [12, 19, 15, 25, 22, 30, 28], color: '#6366f1', width: 2 },
  { data: [8, 14, 10, 18, 16, 22, 20], color: '#22d3ee', width: 2 },
];

window.onload = function() {
  // setupCanvas + drawAxes helpers here (see above)
  // ... draw lines with ctx.beginPath/lineTo
};
</script>
</body>
</html>
```

### Bar Chart

```html
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; color: #e0e0e0; font-family: -apple-system, system-ui, sans-serif; padding: 20px; }
  h2 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 16px; }
  canvas { width: 100%; height: 250px; }
</style>
</head>
<body>
<h2>TITLE</h2>
<div class="subtitle">SUBTITLE</div>
<canvas id="chart"></canvas>
<script>
var labels = ['A','B','C','D','E'];
var values = [42, 78, 55, 91, 63];
var colors = ['#6366f1','#22d3ee','#f59e0b','#10b981','#f43f5e'];

window.onload = function() {
  // setupCanvas + drawAxes
  // var barW = plotW / values.length * 0.6;
  // for each bar: ctx.fillRect(x, y, barW, barH)
};
</script>
</body>
</html>
```

### Pie / Donut Chart

```html
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; color: #e0e0e0; font-family: -apple-system, system-ui, sans-serif; padding: 20px; }
  h2 { font-size: 15px; font-weight: 600; margin-bottom: 4px; text-align: center; }
  .subtitle { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 16px; text-align: center; }
  canvas { width: 100%; height: 280px; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; justify-content: center; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: rgba(255,255,255,0.6); }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
</style>
</head>
<body>
<h2>TITLE</h2>
<div class="subtitle">SUBTITLE</div>
<canvas id="chart"></canvas>
<div class="legend" id="legend"></div>
<script>
var slices = [
  { label: 'Category A', value: 40, color: '#6366f1' },
  { label: 'Category B', value: 30, color: '#22d3ee' },
  { label: 'Category C', value: 20, color: '#f59e0b' },
  { label: 'Category D', value: 10, color: '#10b981' },
];

window.onload = function() {
  var canvas = document.getElementById('chart');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  var cx = rect.width / 2, cy = rect.height / 2;
  var r = Math.min(cx, cy) - 20;
  var inner = r * 0.55; // 0 for pie, >0 for donut
  var total = slices.reduce(function(s, d) { return s + d.value; }, 0);
  var angle = -Math.PI / 2;

  slices.forEach(function(s) {
    var sweep = (s.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, angle, angle + sweep);
    ctx.arc(cx, cy, inner, angle + sweep, angle, true);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    // percentage label
    var mid = angle + sweep / 2;
    var lx = cx + Math.cos(mid) * (r + inner) / 2;
    var ly = cy + Math.sin(mid) * (r + inner) / 2;
    if (s.value / total > 0.05) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(s.value / total * 100) + '%', lx, ly);
    }
    angle += sweep;
  });

  // legend
  var leg = document.getElementById('legend');
  slices.forEach(function(s) {
    leg.innerHTML += '<div class="legend-item"><div class="legend-dot" style="background:' + s.color + '"></div>' + s.label + ' (' + s.value + ')</div>';
  });
};
</script>
</body>
</html>
```

### Stat Cards (KPI Dashboard)

```html
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; color: #e0e0e0; font-family: -apple-system, system-ui, sans-serif; padding: 20px; }
  h2 { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; }
  .card-label { font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; }
  .card-value { font-size: 28px; font-weight: 700; margin: 6px 0 4px; }
  .card-delta { font-size: 11px; }
  .up { color: #10b981; }
  .down { color: #f43f5e; }
</style>
</head>
<body>
<h2>TITLE</h2>
<div class="grid">
  <div class="card">
    <div class="card-label">Metric 1</div>
    <div class="card-value" style="color:#6366f1">1,234</div>
    <div class="card-delta up">+12.5%</div>
  </div>
  <div class="card">
    <div class="card-label">Metric 2</div>
    <div class="card-value" style="color:#22d3ee">567ms</div>
    <div class="card-delta down">-3.2%</div>
  </div>
  <div class="card">
    <div class="card-label">Metric 3</div>
    <div class="card-value" style="color:#f59e0b">89.2%</div>
    <div class="card-delta up">+0.8%</div>
  </div>
  <div class="card">
    <div class="card-label">Metric 4</div>
    <div class="card-value" style="color:#10b981">42</div>
    <div class="card-delta">-</div>
  </div>
</div>
</body>
</html>
```

### Multi-Chart Dashboard

For dashboards combining multiple chart types, use a CSS grid layout:

```html
<style>
  .dashboard { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .panel { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; }
  .panel-title { font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  /* On small screens, stack */
  @media (max-width: 500px) { .dashboard { grid-template-columns: 1fr; } }
</style>
<div class="dashboard">
  <div class="panel"><div class="panel-title">Chart 1</div><canvas id="c1"></canvas></div>
  <div class="panel"><div class="panel-title">Chart 2</div><canvas id="c2"></canvas></div>
</div>
```

---

## Color Palettes

### Default (vibrant on dark)
```
#6366f1 (indigo), #22d3ee (cyan), #f59e0b (amber), #10b981 (emerald), #f43f5e (rose), #a855f7 (purple), #3b82f6 (blue), #ef4444 (red)
```

### Gradient fills for area charts
```javascript
var grad = ctx.createLinearGradient(0, p.top, 0, p.top + plotH);
grad.addColorStop(0, 'rgba(99,102,241,0.3)');
grad.addColorStop(1, 'rgba(99,102,241,0)');
ctx.fillStyle = grad;
```

## Time Series Tips

- For unix timestamps: `new Date(ts * 1000).toLocaleTimeString('en', {hour:'2-digit', minute:'2-digit'})`
- For date labels: `new Date(ts * 1000).toLocaleDateString('en', {month:'short', day:'numeric'})`
- Show ~6-8 x-axis labels max — skip intermediate ones with `Math.floor(data.length / 7)`

## Formatting Helpers

```javascript
function fmtBytes(b) {
  if (b >= 1e12) return (b/1e12).toFixed(1) + ' TB';
  if (b >= 1e9) return (b/1e9).toFixed(1) + ' GB';
  if (b >= 1e6) return (b/1e6).toFixed(1) + ' MB';
  if (b >= 1e3) return (b/1e3).toFixed(1) + ' KB';
  return b + ' B';
}
function fmtNum(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n.toFixed(0); }
function fmtPct(n) { return n.toFixed(1) + '%'; }
function fmtMs(n) { return n >= 1000 ? (n/1000).toFixed(1) + 's' : n.toFixed(0) + 'ms'; }
```

## Important Rules

1. **Always use `window.onload`** — canvas `getBoundingClientRect()` returns 0 before layout.
2. **Always handle DPI** — use `devicePixelRatio` for sharp rendering on retina displays.
3. **Keep it complete** — every `html:preview` block must be a fully working standalone HTML document. Don't leave placeholders or "// ... draw here" comments — write the actual drawing code.
4. **Real data only** — when the user provides data, use it directly. Don't generate fake data unless explicitly asked for a demo.
5. **Responsive width** — use `width: 100%` on canvas, read `getBoundingClientRect()` for actual pixel dimensions.
