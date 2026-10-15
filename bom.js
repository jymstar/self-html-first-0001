// ============ 全局 ============
const PAGE_SIZE = 50;
let allData = [];
let filteredData = [];
let currentPage = 1;
let drillStack = [];

const tbody = document.getElementById('bomBody');
const summary = document.getElementById('summary');
const pagination = document.getElementById('pagination');
const fileInput = document.getElementById('fileInput');
const searchInput = document.getElementById('searchInput');
const levelFilter = document.getElementById('levelFilter');
const propertyFilter = document.getElementById('propertyFilter');
const btnReset = document.getElementById('btnReset');
const btnDrill = document.getElementById('btnDrill');


// ============ 文件导入 ============
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const text = evt.target.result;
    const data = parseCSV(text);
    if (data.length === 0) {
      alert('解析失败，请检查文件格式');
      return;
    }
    allData = data;
    filteredData = [...allData];
    initFilters();
    currentPage = 1;
    renderPage(1);
    updateSummary();
  };
  reader.readAsText(file, 'GBK');
});

// ============ CSV 解析 ============
function parseCSV(text) {
  // 去 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // 解析表头
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const result = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    // 处理引号内的逗号
    const cols = [];
    let current = '';
    let inQuote = false;
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cols.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current.trim().replace(/^"|"$/g, ''));

    if (cols.length < headers.length) continue;

    // 按原表列名取值，不做任何推导
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });

    // 计算用量（分子/分母），仅用于汇总
    const num = parseFloat(row['用量_分子']) || 0;
    const den = parseFloat(row['用量_分母']) || 1;
    row._qty = den !== 0 ? (num / den) : 0;

    // Level_no 原样
    row._levelRaw = row['Level_no'] || '0';
    row._levelNum = parseInt(row['Level_no']) || 0;

    result.push(row);
  }

  return result;
}

// ============ 渲染表格 ============
function renderPage(page) {
  currentPage = page;
  const start = (page - 1) * PAGE_SIZE;
  const pageData = filteredData.slice(start, start + PAGE_SIZE);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#999;padding:40px;">无数据</td></tr>';
    pagination.innerHTML = '';
    return;
  }

  let html = '';
  pageData.forEach((row, i) => {
    const idx = start + i + 1;
    const lv = row._levelNum;
    const lvClass = 'l' + Math.min(lv, 4);
    const indent = lv > 0 ? '&nbsp;'.repeat(lv * 3) + '├─ ' : '';

    html += '<tr>';
    html += `<td>${idx}</td>`;
    
    html += `<td><span class="${lvClass}">${esc(row['Level_no'])}</span></td>`;
    html += `<td>${esc(row['展开项次'])}</td>`;
    html += `<td>${esc(row['子项物料编码'])}</td>`;
    html += `<td>${esc(row['子项物料名称'])}</td>`;
    html += `<td>${esc(row['子项规格型号'])}</td>`;
    html += `<td>${esc(row['子项单位'])}</td>`;
    html += `<td>${esc(row['用量_分子'])}</td>`;
    html += `<td>${esc(row['用量_分母'])}</td>`;
    html += `<td>${esc(row['子项物料属性'])}</td>`;
    html += '</tr>';
  });

  tbody.innerHTML = html;

  // 绑定钻取
  document.querySelectorAll('.child-code').forEach(el => {
    el.addEventListener('click', () => {
      drillToCode(el.getAttribute('data-code'));
    });
  });

  // 分页
  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
  let pg = '';
  if (totalPages > 0) {
    pg += `<button ${page <= 1 ? 'disabled' : ''} onclick="renderPage(${page - 1})">上一页</button>`;
    pg += ` 第 ${page} / ${totalPages} 页（共 ${filteredData.length} 行） `;
    pg += `<button ${page >= totalPages ? 'disabled' : ''} onclick="renderPage(${page + 1})">下一页</button>`;
  }
  pagination.innerHTML = pg;
}

// ============ 汇总 ============
function updateSummary() {
  const rows = filteredData.length;
  const parts = new Set(filteredData.map(r => r['子项物料编码']).filter(Boolean)).size;
  const totalQty = filteredData.reduce((s, r) => s + (r._qty || 0), 0);
  const levels = [...new Set(filteredData.map(r => r._levelNum))].sort((a, b) => a - b);
  const lvRange = levels.length ? `L${levels[0]} ~ L${levels[levels.length - 1]}` : '-';
  summary.innerHTML = `共 <b>${rows}</b> 行 | 涉及物料 <b>${parts}</b> 种 | 总用量 <b>${totalQty.toFixed(4)}</b> | 层级 <b>${lvRange}</b>`;
}

// ============ 筛选 ============
function initFilters() {
  const levels = [...new Set(allData.map(r => r._levelNum))].sort((a, b) => a - b);
  levelFilter.innerHTML = '<option value="all">全部层级</option>';
  levels.forEach(l => {
    levelFilter.innerHTML += `<option value="${l}">L${l}</option>`;
  });

  const props = [...new Set(allData.map(r => r['子项物料属性']).filter(Boolean))];
  propertyFilter.innerHTML = '<option value="all">全部属性</option>';
  props.forEach(p => {
    propertyFilter.innerHTML += `<option value="${p}">${p}</option>`;
  });
}

function applyFilter() {
  const kw = searchInput.value.trim().toLowerCase();
  const lv = levelFilter.value;
  const prop = propertyFilter.value;

  filteredData = allData.filter(row => {
    if (lv !== 'all' && row._levelNum != parseInt(lv)) return false;
    if (prop !== 'all' && row['子项物料属性'] !== prop) return false;
    if (kw) {
      const str = [
        row['子项物料编码'], row['子项物料名称'],
        row['父项物料编码'], row['父项物料名称']
      ].join(' ').toLowerCase();
      if (!str.includes(kw)) return false;
    }
    return true;
  });

  currentPage = 1;
  renderPage(1);
  updateSummary();
}

searchInput.addEventListener('input', applyFilter);
levelFilter.addEventListener('change', applyFilter);
propertyFilter.addEventListener('change', applyFilter);

btnReset.addEventListener('click', () => {
  searchInput.value = '';
  levelFilter.value = 'all';
  propertyFilter.value = 'all';
  drillStack = [];
  btnDrill.disabled = true;
  filteredData = [...allData];
  currentPage = 1;
  renderPage(1);
  updateSummary();
});

// ============ 钻取 ============
function drillToCode(code) {
  if (!code) return;
  drillStack.push({ filteredData: [...filteredData], page: currentPage });
  filteredData = allData.filter(r => r['子项物料编码'] === code || r['父项物料编码'] === code);
  btnDrill.disabled = false;
  currentPage = 1;
  renderPage(1);
  updateSummary();
}

btnDrill.addEventListener('click', () => {
  if (drillStack.length === 0) return;
  const prev = drillStack.pop();
  filteredData = prev.filteredData;
  currentPage = prev.page;
  btnDrill.disabled = drillStack.length === 0;
  renderPage(currentPage);
  updateSummary();
});

// ============ 工具 ============
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}




  // ============ 自动加载（整合版：GBK解码 + 强制初始化 + 手动兜底）============
fetch('bomdata/bom展开20260930.csv')
  .then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.arrayBuffer();
  })
  .then(buf => {
    const text = new TextDecoder('gbk').decode(buf);
    const data = parseCSV(text);
    if (data.length > 0) {
      allData = data;
      filteredData = [...allData];
      initFilters(); // 核心：确保筛选器初始化
      currentPage = 1;
      renderPage(1);
      updateSummary();
      console.log('自动加载成功，行数:', data.length);
    } else {
      // 解析为空也强制初始化，保证手动导入可用
      initFilters();
      renderPage(1);
      updateSummary();
    }
  })
  .catch(err => {
    console.error('自动加载失败，等待手动导入:', err);
    // 核心兜底：即使请求失败，也强制初始化UI，确保手动导入不瘫痪
    initFilters();
    renderPage(1);
    updateSummary();
  });

  document.getElementById('backtooa').onclick = () => location.href = './zhaolin.html';