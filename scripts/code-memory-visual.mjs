import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileSync, safeWriteJsonSync } from './code-memory-index/file-system.mjs';

const ROOT = process.cwd();
const memoryDir = path.join(ROOT, '.memory');
const indexPath = path.join(memoryDir, 'code-index.json');
const htmlPath = path.join(memoryDir, 'index.html');
const dataPath = path.join(memoryDir, 'index-data.json');
const reportPath = path.join(memoryDir, 'visual-report.md');

const parseArgs = (argv) => {
  const options = {
    detailLevel: 'summary',
    maxSignals: 5,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--detail-level') {
      const value = String(argv[i + 1] || '')
        .toLowerCase()
        .trim();
      if (value === 'summary' || value === 'full') options.detailLevel = value;
      i += 1;
      continue;
    }
    if (token === '--max-signals') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value >= 1 && value <= 20)
        options.maxSignals = Math.floor(value);
      i += 1;
    }
  }
  return options;
};

const options = parseArgs(process.argv.slice(2));

if (!fs.existsSync(indexPath)) {
  console.error('Missing .memory/code-index.json. Run: npm run memory:index');
  process.exit(1);
}

let index;
try {
  index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
} catch (error) {
  console.error(`Unable to parse ${indexPath}: ${error?.message || 'invalid JSON'}`);
  process.exit(1);
}

const isIndexHtmlPath = (p) => /(^|\/)index\.html$/i.test(String(p || '').replace(/\\/g, '/'));
const hideIndexHtmlRows = (rows = []) => rows.filter((row) => !isIndexHtmlPath(row.path));
const visibleFiles = (index.files || []).filter((f) => !isIndexHtmlPath(f.path));
const shapeFileForVisual = (file) => {
  const minimal = {
    path: file.path,
    extension: file.extension,
    lines: file.lines,
    symbolCount: file.symbolCount || 0,
    complexityScore: file.complexityScore || 0,
    riskScore: file.riskScore || 0,
    tagCount: file.tagCount || 0,
    tags: file.tags || [],
  };
  if (options.detailLevel === 'full') {
    return {
      ...minimal,
      symbols: file.symbols || [],
      importSpecifiers: file.importSpecifiers || [],
      importsDetailed: file.importsDetailed || [],
      keywordCounts: file.keywordCounts || {},
    };
  }
  return {
    ...minimal,
    topSignals: [
      ...(file.tags || []).slice(0, options.maxSignals),
      ...(file.importSpecifiers || []).slice(0, options.maxSignals),
      ...(file.symbols || []).slice(0, options.maxSignals),
    ].slice(0, options.maxSignals),
    importCount: (file.importSpecifiers || []).length,
  };
};

const payload = {
  generatedAt: index.generatedAt,
  schema: index.schema || `legacy-v${index.version || 1}`,
  totals: index.totals || {},
  quality: index.quality || {},
  trend: index.trend || null,
  history: index.history || null,
  riskSummary: index.riskSummary || {},
  extensionStats: index.extensionStats || [],
  hotspots: {
    ...(index.hotspots || {}),
    largestByLines: hideIndexHtmlRows(index.hotspots?.largestByLines),
    largestByBytes: hideIndexHtmlRows(index.hotspots?.largestByBytes),
    mostSymbols: hideIndexHtmlRows(index.hotspots?.mostSymbols),
    highestComplexity: hideIndexHtmlRows(index.hotspots?.highestComplexity),
    mostImports: hideIndexHtmlRows(index.hotspots?.mostImports),
    mostTags: hideIndexHtmlRows(index.hotspots?.mostTags),
    highestRisk: hideIndexHtmlRows(index.hotspots?.highestRisk),
    highestAsyncDensity: hideIndexHtmlRows(index.hotspots?.highestAsyncDensity),
  },
  dependencyStats: index.dependencyStats || {
    hubsByInDegree: [],
    hubsByOutDegree: [],
    missingRelativeTargets: [],
    totals: {},
  },
  changes: index.changes || { counts: {}, changed: [], added: [], removed: [] },
  recommendations: index.recommendations || [],
  files: visibleFiles.map(shapeFileForVisual),
  renderOptions: options,
};

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Code Memory Visual</title>
<style>
:root{--bg:#081018;--card:#0f1d2d;--line:#25415e;--ink:#ebf6ff;--muted:#8eabc7;--acc:#4ad5b2;--warn:#f2c25e;--danger:#ff7b92}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 8% 0%,#13385c,var(--bg));color:var(--ink);font:14px/1.45 "IBM Plex Sans","Segoe UI",sans-serif}
.wrap{max-width:1520px;margin:18px auto;padding:0 14px 28px}.card{background:linear-gradient(180deg,var(--card),#0c1727);border:1px solid var(--line);border-radius:12px;padding:12px}
.grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.split{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:1200px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.split{grid-template-columns:1fr}}
h1{margin:0 0 4px;font-size:30px}.muted{color:var(--muted)}h2{margin:0 0 8px;font-size:17px}.k{font-size:11px;text-transform:uppercase;color:var(--muted)}.v{font-size:23px;font-weight:700}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}input,select,button{background:#0a1422;border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:8px 10px}
button{cursor:pointer}button:hover{border-color:#3d6794}
table{width:100%;border-collapse:collapse;background:#0a1422;border:1px solid var(--line);border-radius:10px;overflow:hidden}th,td{padding:8px 9px;border-bottom:1px solid #1e3550;text-align:left;vertical-align:top}
th{font-size:12px;color:var(--muted);text-transform:uppercase}tr:last-child td{border-bottom:none}
.mono{font-family:ui-monospace,Consolas,monospace;font-size:12px}.tiny{font-size:12px;color:var(--muted)}.pill{display:inline-block;margin:2px;padding:2px 7px;border:1px solid #2f5272;border-radius:999px;font-size:11px}
.warn{color:var(--warn)}.danger{color:var(--danger)}.ok{color:var(--acc)}.bars{display:grid;gap:6px}
.bar{display:grid;grid-template-columns:220px 1fr 80px;gap:8px;align-items:center}.track{height:10px;border-radius:999px;background:#12253a;border:1px solid #223f5d;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#2a6f9f,#4ad5b2)}
.file-path{max-width:560px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style></head><body>
<div class="wrap">
<h1>Code Memory Visual Explorer</h1>
<div class="muted">Schema: <span class="mono" id="schema"></span> | Generated: <span id="generated"></span></div>
<div class="grid" id="kpis" style="margin-top:10px"></div>
<div class="split" style="margin-top:10px"><div class="card"><h2>Trend</h2><div id="trend"></div></div><div class="card"><h2>Recommendations</h2><div id="reco"></div></div></div>
<div class="split" style="margin-top:10px"><div class="card"><h2>Extension Distribution</h2><div id="extBars" class="bars"></div></div><div class="card"><h2>Health Signals</h2><div id="health"></div></div></div>
<div class="split" style="margin-top:10px"><div class="card"><h2>Hotspots</h2><div class="row"><select id="hotspotMode"><option value="highestRisk">Highest Risk</option><option value="highestComplexity">Highest Complexity</option><option value="highestAsyncDensity">Async Density</option><option value="largestByLines">Largest By Lines</option></select><button id="exportHotspots">Export Hotspots CSV</button></div><table><thead><tr><th>File</th><th>Risk</th><th>Lines</th><th>Complexity</th></tr></thead><tbody id="hotspots"></tbody></table></div><div class="card"><h2>Missing Relative Targets</h2><table><thead><tr><th>From</th><th>Specifier</th></tr></thead><tbody id="missing"></tbody></table></div></div>
<div class="split" style="margin-top:10px"><div class="card"><h2>Top Changed Files</h2><table><thead><tr><th>File</th><th>Delta Lines</th><th>Delta Symbols</th></tr></thead><tbody id="changed"></tbody></table></div><div class="card"><h2>Dependency Hubs</h2><table><thead><tr><th>File</th><th>In</th><th>Out</th></tr></thead><tbody id="hubs"></tbody></table></div></div>
<div class="card" style="margin-top:10px"><h2>File Explorer</h2><div class="row"><input id="q" placeholder="Search path/symbol/import/tag" /><select id="extFilter"><option value="">All Ext</option></select><select id="riskFilter"><option value="">All Risk</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><input id="tagFilter" placeholder="Tag contains (TODO/FIXME)" /><input id="minLines" type="number" min="0" placeholder="Min lines" /><select id="sortBy"><option value="riskScore">Risk</option><option value="complexityScore">Complexity</option><option value="lines">Lines</option><option value="symbolCount">Symbols</option><option value="importCount">Imports</option><option value="path">Path</option></select><select id="pageSize"><option>40</option><option selected>80</option><option>120</option><option>200</option></select><button id="prev">Prev</button><button id="next">Next</button><span class="tiny" id="pageInfo"></span><button id="exportFiles">Export Page CSV</button></div><table><thead><tr><th>File</th><th>Metrics</th><th>Signals</th></tr></thead><tbody id="files"></tbody></table></div>
</div>
<script>
const data = __PAYLOAD__;
const fmt = new Intl.NumberFormat();
const esc = (s) => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const lineCount = (f) => typeof f.lines === 'number' ? f.lines : ((f.lines && f.lines.total) || 0);
const importCount = (f) => Number(f.importCount || ((f.importSpecifiers || []).length));
const riskBand = (s) => s >= 55 ? 'critical' : s >= 40 ? 'high' : s >= 25 ? 'medium' : 'low';
const toCsv = (rows) => rows.map((r) => r.map((v) => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\\n');
const dl = (name, rows) => { const b = new Blob([toCsv(rows)], {type:'text/csv;charset=utf-8;'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); };
const debounce = (fn, ms=150) => { let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; };

document.getElementById('schema').textContent = data.schema;
document.getElementById('generated').textContent = data.generatedAt || 'n/a';
const kpis = [['Files',data.totals.filesIndexed||0],['Lines',data.totals.linesIndexed||0],['Symbols',data.totals.symbolCount||0],['Imports',data.totals.importCount||0],['Avg Risk',data.quality.avgRiskPerFile||0],['Changed',data.changes.counts?.changed||0],['Critical',data.riskSummary.critical||0],['History',data.history?.historyCount||0],['Missing Imports',data.dependencyStats.totals?.missingRelativeTargets||0],['Comment Density',data.quality.commentDensity||0],['Blank Ratio',data.quality.blankLineRatio||0],['TODO Ratio',data.quality.todoFilesRatio||0]];
document.getElementById('kpis').innerHTML = kpis.map((x)=>'<div class="card"><div class="k">'+esc(x[0])+'</div><div class="v">'+fmt.format(x[1])+'</div></div>').join('');

document.getElementById('trend').innerHTML = data.trend ? Object.entries(data.trend).map(([k,v])=>'<div><span class="k">'+esc(k)+'</span> <span class="v" style="font-size:18px">'+(v>=0?'+':'')+esc(v)+'</span></div>').join('') : '<div class="tiny">No previous run trend available</div>';
document.getElementById('reco').innerHTML = (data.recommendations||[]).length ? data.recommendations.map((x)=>'<div class="pill">'+esc(x)+'</div>').join('') : '<div class="tiny">No recommendations</div>';

const extRows = (data.extensionStats || []).slice(0, 12);
const maxExtFiles = Math.max(1, ...extRows.map((e)=>e.files || 0));
document.getElementById('extBars').innerHTML = extRows.length ? extRows.map((e)=>{
  const width = Math.max(2, Math.round(((e.files || 0) / maxExtFiles) * 100));
  return '<div class="bar"><div class="mono">'+esc(e.extension || '(none)')+'</div><div class="track"><div class="fill" style="width:'+width+'%"></div></div><div class="tiny">'+fmt.format(e.files || 0)+' files</div></div>';
}).join('') : '<div class="tiny">No extension data</div>';

const health = [];
const missingRel = data.dependencyStats.totals?.missingRelativeTargets || 0;
const todoRatio = Number(data.quality.todoFilesRatio || 0);
const avgRisk = Number(data.quality.avgRiskPerFile || 0);
health.push('<div>' + (missingRel ? '<span class="danger">Needs attention</span>' : '<span class="ok">Healthy</span>') + ': Missing relative targets = ' + fmt.format(missingRel) + '</div>');
health.push('<div>' + (todoRatio > 0.25 ? '<span class="warn">Watchlist</span>' : '<span class="ok">Stable</span>') + ': TODO file ratio = ' + esc(todoRatio) + '</div>');
health.push('<div>' + (avgRisk >= 40 ? '<span class="danger">High risk</span>' : avgRisk >= 25 ? '<span class="warn">Medium risk</span>' : '<span class="ok">Low risk</span>') + ': Avg risk per file = ' + esc(avgRisk) + '</div>');
document.getElementById('health').innerHTML = health.join('');

const renderHotspots = () => {
  const mode = document.getElementById('hotspotMode').value;
  const rows = data.hotspots[mode] || [];
  document.getElementById('hotspots').innerHTML = rows.map((f)=>'<tr><td class="mono file-path" title="'+esc(f.path)+'">'+esc(f.path)+'</td><td class="'+((f.riskScore||0)>=55?'danger':'')+'">'+(f.riskScore||0)+'</td><td>'+lineCount(f)+'</td><td>'+(f.complexityScore||0)+'</td></tr>').join('') || '<tr><td colspan="4" class="tiny">No data</td></tr>';
  return rows;
};
renderHotspots();
document.getElementById('hotspotMode').addEventListener('change', renderHotspots);

document.getElementById('missing').innerHTML = (data.dependencyStats.missingRelativeTargets || []).slice(0, 80).map((m)=>'<tr><td class="mono file-path" title="'+esc(m.from)+'">'+esc(m.from)+'</td><td class="mono">'+esc(m.specifier)+'</td></tr>').join('') || '<tr><td colspan="2" class="tiny">No missing targets</td></tr>';
document.getElementById('changed').innerHTML = (data.changes.changed || []).slice(0, 50).map((c)=>'<tr><td class="mono file-path" title="'+esc(c.path)+'">'+esc(c.path)+'</td><td>'+(c.deltaLines>=0?'+':'')+c.deltaLines+'</td><td>'+(c.deltaSymbols>=0?'+':'')+c.deltaSymbols+'</td></tr>').join('') || '<tr><td colspan="3" class="tiny">No changed files</td></tr>';

const indeg = new Map((data.dependencyStats.hubsByInDegree || []).map((x)=>[x.path,x.inDegree]));
const outdeg = new Map((data.dependencyStats.hubsByOutDegree || []).map((x)=>[x.path,x.outDegree]));
const hubRows = [...new Set([...(data.dependencyStats.hubsByInDegree||[]).slice(0,20).map(x=>x.path), ...(data.dependencyStats.hubsByOutDegree||[]).slice(0,20).map(x=>x.path)])];
document.getElementById('hubs').innerHTML = hubRows.map((p)=>'<tr><td class="mono file-path" title="'+esc(p)+'">'+esc(p)+'</td><td>'+(indeg.get(p)||0)+'</td><td>'+(outdeg.get(p)||0)+'</td></tr>').join('') || '<tr><td colspan="3" class="tiny">No hubs</td></tr>';

const extFilter = document.getElementById('extFilter');
extFilter.innerHTML += (data.extensionStats || []).map((e)=>'<option value="'+esc(e.extension)+'">'+esc(e.extension)+'</option>').join('');

let page = 1;
let filtered = [];
const renderFiles = () => {
  const q = (document.getElementById('q').value || '').toLowerCase();
  const ext = extFilter.value;
  const risk = document.getElementById('riskFilter').value;
  const tagQ = (document.getElementById('tagFilter').value || '').toLowerCase();
  const minLines = Number(document.getElementById('minLines').value || 0);
  const sortBy = document.getElementById('sortBy').value;
  const pageSize = Number(document.getElementById('pageSize').value || 80);

  filtered = (data.files || [])
    .filter((f)=>!ext || f.extension === ext)
    .filter((f)=>!risk || riskBand(f.riskScore || 0) === risk)
    .filter((f)=>lineCount(f) >= minLines)
    .filter((f)=>!tagQ || (f.tags || []).some((t)=>String(t).toLowerCase().includes(tagQ)))
    .filter((f)=>{ if(!q) return true; const hay = [f.path].concat(f.symbols||[], f.importSpecifiers||[], f.tags||[]).join(' ').toLowerCase(); return hay.includes(q); })
    .sort((a,b)=>{
      if (sortBy === 'path') return a.path.localeCompare(b.path);
      const av = sortBy === 'lines' ? lineCount(a) : sortBy === 'importCount' ? importCount(a) : (a[sortBy] || 0);
      const bv = sortBy === 'lines' ? lineCount(b) : sortBy === 'importCount' ? importCount(b) : (b[sortBy] || 0);
      return bv - av;
    });

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (page > pages) page = pages;
  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);
  document.getElementById('pageInfo').textContent = 'Page ' + page + '/' + pages + ' (' + filtered.length + ' files)';

  document.getElementById('files').innerHTML = rows.map((f)=>{
    const metrics = 'risk='+(f.riskScore||0)+' | lines='+lineCount(f)+' | complexity='+(f.complexityScore||0)+' | imports='+importCount(f)+' | symbols='+(f.symbolCount||0);
    const signalList = (data.renderOptions?.detailLevel === 'summary')
      ? (f.topSignals || [])
      : (f.tags||[]).concat((f.importSpecifiers||[]).slice(0,5));
    const sig = signalList.map((x)=>'<span class="pill">'+esc(x)+'</span>').join('') || '<span class="tiny">No signals</span>';
    return '<tr><td class="mono file-path" title="'+esc(f.path)+'">'+esc(f.path)+'</td><td class="mono">'+esc(metrics)+'</td><td>'+sig+'</td></tr>';
  }).join('') || '<tr><td colspan="3" class="tiny">No matches</td></tr>';
};

const rerender = debounce(()=>{ page = 1; renderFiles(); }, 120);
['q','extFilter','riskFilter','tagFilter','minLines','sortBy','pageSize'].forEach((id)=>document.getElementById(id).addEventListener('input', rerender));
document.getElementById('prev').addEventListener('click', ()=>{page=Math.max(1,page-1); renderFiles();});
document.getElementById('next').addEventListener('click', ()=>{page=page+1; renderFiles();});
renderFiles();

document.getElementById('exportHotspots').addEventListener('click', ()=>{
  const rows = [['path','riskScore','lines','complexity']].concat((data.hotspots[document.getElementById('hotspotMode').value] || []).map((f)=>[f.path, f.riskScore||0, lineCount(f), f.complexityScore||0]));
  dl('code-memory-hotspots.csv', rows);
});

document.getElementById('exportFiles').addEventListener('click', ()=>{
  const pageSize = Number(document.getElementById('pageSize').value || 80);
  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);
  const csv = [['path','extension','riskScore','lines','complexity','symbols','imports','tags']].concat(rows.map((f)=>[f.path,f.extension,f.riskScore||0,lineCount(f),f.complexityScore||0,f.symbolCount||0,importCount(f),(f.tags||[]).join('|')]));
  dl('code-memory-files-page.csv', csv);
});
</script></body></html>`;

safeWriteFileSync(htmlPath, html.replace('__PAYLOAD__', JSON.stringify(payload)));
safeWriteJsonSync(dataPath, payload, 2);
const reportLines = [
  '# Code Memory Visual Report',
  '',
  `Generated: ${payload.generatedAt || 'n/a'}`,
  `Schema: ${payload.schema}`,
  `Detail Level: ${options.detailLevel}`,
  `Files in Visual: ${payload.files.length}`,
  '',
  '## Totals',
  `- Indexed Files: ${payload.totals.filesIndexed || 0}`,
  `- Lines: ${payload.totals.linesIndexed || 0}`,
  `- Symbols: ${payload.totals.symbolCount || 0}`,
  `- Imports: ${payload.totals.importCount || 0}`,
  '',
  '## Risk',
  `- Critical: ${payload.riskSummary.critical || 0}`,
  `- High: ${payload.riskSummary.high || 0}`,
  `- Medium: ${payload.riskSummary.medium || 0}`,
  `- Low: ${payload.riskSummary.low || 0}`,
];
safeWriteFileSync(reportPath, `${reportLines.join('\n')}\n`);
console.log(
  `Code memory visual created: ${htmlPath} | data=${dataPath} | report=${reportPath} | schema=${payload.schema} | files=${payload.files.length} | detail=${options.detailLevel}`,
);
