// ============ 全局状态 ============
let allData = [];
let filteredData = [];
let currentPage = 1;
const PAGE_SIZE = 100;
let sortCol = null;
let sortAsc = true;
let drillMode = false;
let drillStack = [];
let rawBomData = [];   // 原始清洗数据_物料清单
let materialData = []; // 物料主数据

// ============ 字段配置 ============
const COLUMNS = [
  { key: 'id',          label: '序号', width: 50, sortable: true },
  { key: 'BOMid',       label: 'BOMid', width: 80, sortable: true },
  { key: '父项物料编码', label: '父项编码', width: 130, sortable: true },
  { key: '父项物料名称', label: '父项名称', width: 150, sortable: false },
  { key: 'Level_no',    label: '层级', width: 60, sortable: true },
  { key: '展开项次',     label: '展开项次', width: 90, sortable: true },
  { key: '项次',        label: '项次', width: 60, sortable: true },
  { key: '子项物料编码', label: '子项编码', width: 130, sortable: true },
  { key: '子项物料名称', label: '子项名称', width: 150, sortable: false },
  { key: '子项规格型号', label: '规格型号', width: 180, sortable: false },
  { key: '子项单位',     label: '单位', width: 50, sortable: true },
  { key: '用量_分子',    label: '用量(分子)', width: 80, sortable: true, align: 'right' },
  { key: '用量_分母',    label: '用量(分母)', width: 80, sortable: true, align: 'right' },
  { key: '子项物料属性', label: '物料属性', width: 80, sortable: true },
  { key: 'path',        label: '路径', width: 200, sortable: false },
  { key: '创建时间',    label: '创建时间', width: 140, sortable: true }
];

// ============ DOM 就绪 ============
document.addEventListener('DOMContentLoaded', () => {
  initTableHeader();
  bindEvents();
  loadRawBomData();
  loadMaterialData();
  // 注意：不再自动加载 bom展开20260930.csv，只靠实时递归展开
  updateSummary(); // 初始显示"共 0 条"
});

// ============ 加载原始BOM清单（清洗数据） ============
function loadRawBomData() {
  fetch('bomdata/_清洗数据_物料清单_测试_new3__202610041012.csv')
    .then(r => r.arrayBuffer())
    .then(buf => {
      const text = new TextDecoder('gb18030', { fatal: false }).decode(buf);
      rawBomData = parseRawBomCSV(text);
      console.log('原始BOM数据加载完成，行数:', rawBomData.length);

      // 加载完成后打印前3行的所有字段名，方便调试
      if (rawBomData.length > 0) {
        console.log('CSV字段名:', Object.keys(rawBomData[0]));
        console.log('第1行示例:', rawBomData[0]);
      }
    })
    .catch(err => {
      console.error('原始BOM加载失败:', err);
      alert('原始BOM数据加载失败，请检查 bomdata/ 目录下文件是否存在');
    });
}

function parseRawBomCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = [];
    let current = '', inQuote = false;
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j];
      if (ch === '"') inQuote = !inQuote;
      else if (ch === ',' && !inQuote) { cols.push(current.trim().replace(/^"|"$/g, '')); current = ''; }
      else current += ch;
    }
    cols.push(current.trim().replace(/^"|"$/g, ''));

    if (cols.length < headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
    result.push(row);
  }
  return result;
}

// ============ 加载物料主数据 ============
function loadMaterialData() {
  fetch('bomdata/_物料主数据__202610041012.csv')
    .then(r => r.arrayBuffer())
    .then(buf => {
      const text = new TextDecoder('gb18030', { fatal: false }).decode(buf);
      materialData = parseMaterialCSV(text);
      console.log('物料主数据加载完成，行数:', materialData.length);
    })
    .catch(err => console.error('物料主数据加载失败:', err));
}

function parseMaterialCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = [];
    let current = '', inQuote = false;
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j];
      if (ch === '"') inQuote = !inQuote;
      else if (ch === ',' && !inQuote) { cols.push(current.trim().replace(/^"|"$/g, '')); current = ''; }
      else current += ch;
    }
    cols.push(current.trim().replace(/^"|"$/g, ''));
    if (cols.length < headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
    result.push(row);
  }
  return result;
}

// ============ 前端 BOM 递归展开（修复版） ============
function expandBOM(topCodeRaw) {
  // const topCode = topCodeRaw.trim().replace(/[\uFEFF\s]/g, '');
     const topCode = (topCodeRaw || '').trim().replace(/[\uFEFF\s]/g, '');
  if (!topCode) {
    alert('请输入成品物料编码');
    return;
  }

  if (rawBomData.length === 0) {
    alert('原始BOM数据尚未加载完成，请稍候再试（或检查CSV文件）');
    return;
  }

  console.log('开始展开BOM，输入编码:', topCode, '| 原始数据行数:', rawBomData.length);

  // ---- 多字段名兜底匹配 ----
  // CSV里父项编码可能叫：父项物料编码 / 物料编码 / 父项编码 / 成品编码
  const parentFieldCandidates = ['父项物料编码', '物料编码', '父项编码', '成品编码', 'parent_code', 'bom_code'];

  // 找到实际存在的字段名
  let actualParentField = null;
  if (rawBomData.length > 0) {
    const firstRowKeys = Object.keys(rawBomData[0]);
    for (const candidate of parentFieldCandidates) {
      if (firstRowKeys.some(k => k.toLowerCase().includes(candidate.toLowerCase()) || candidate.toLowerCase().includes(k.toLowerCase()))) {
        // 精确匹配优先
        const exact = firstRowKeys.find(k => k === candidate);
        if (exact) { actualParentField = exact; break; }
      }
    }
    // 如果没匹配到，用第一个看起来像编码的字段
    if (!actualParentField) {
      actualParentField = firstRowKeys.find(k => k.includes('编码') || k.includes('code') || k.includes('物料')) || firstRowKeys[0];
    }
  }
     // 强制修正：解决误判为 BOMid 导致递归匹配不到子项（层级全0）的问题
    actualParentField = '父项编码';
  const actualChildField = '子项编码'; // 真实子项字段

        // 若你的CSV表头实际叫“父项编码”，请改成 '父项编码'
  console.log('使用的父项字段名:', actualParentField);

  // ---- 1. 精确匹配 ----
  // 顶层：精确匹配输入编码（topCode 已 trim）
const topItems = rawData.filter(row => 
  String(row[actualParentField] || '').trim() === topCode
);
console.log('顶层匹配行数:', topItems.length); // 应为 36 左右，非 10865

// 构建父项→子项 Map（用子项编码作为下一级的父项）
const parentMap = {};
rawData.forEach(row => {
  const p = String(row[actualParentField] || '').trim();
  if (p) (parentMap[p] = parentMap[p] || []).push(row);
});

// 递归展开（确保你已有此函数，若没有则按此补）
function expand(row, level) {
  output.push({ ...row, 层级: level, 路径: path.join('->') });
  const childCode = String(row[actualChildField] || '').trim();
  const children = parentMap[childCode] || [];
  children.forEach(c => expand(c, level + 1, [...path, level]));
}
topItems.forEach(t => expand(t, 0, [0]));

  // ---- 找到该编码所有已审核的BOM版本 ----
  const reviewedItems = topItems.filter(r => {
    const state = (r['数据状态'] || r['状态'] || '').toString().trim();
    return state === '已审核' || state === '' || !state; // 空状态也放行
  });

  const itemsToUse = reviewedItems.length > 0 ? reviewedItems : topItems;
  console.log('可用BOM行数:', itemsToUse.length, '(已审核:', reviewedItems.length, ')');

  // 取最大版本号
  const allVersions = [...new Set(itemsToUse.map(r => r['BOM版本'] || r['版本'] || '1.0'))];
  const latestVersion = allVersions.sort((a, b) => {
    const pa = parseFloat((a.split('_V')[1]) || a) || 0;
    const pb = parseFloat((b.split('_V')[1]) || b) || 0;
    return pb - pa;
  })[0] || '1.0';

  console.log('使用版本:', latestVersion);

  // ---- 递归展开 ----
  const result = [];
  let idCounter = 1;

  // 获取成品名称
  const topMaterial = materialData.find(m => {
    const mc = (m['物料编码'] || m['编码'] || '').toString().trim();
    return mc === topCode || mc.includes(topCode);
  });
  const topName = topMaterial ? (topMaterial['物料名称'] || topMaterial['名称'] || '') : '';

  // 递归函数
  function recurse(parentCode, level, path, expandSeq, parentName) {
    const children = itemsToUse.filter(r => {
      const val = (r[actualParentField] || '').toString().trim().replace(/[\uFEFF\s]/g, '');
      return val === parentCode;
    });

    children.forEach((child, idx) => {
      const itemSeq = child['项次'] || child['序号'] || (idx + 1);
      const currentExpandSeq = expandSeq
        ? `${expandSeq}_${String(itemSeq).padStart(2, '0')}`
        : String(itemSeq).padStart(2, '0');

      const num = parseFloat(child['用量_分子'] || child['用量'] || '0') || 0;
      const den = parseFloat(child['用量_分母'] || '1') || 1;

      result.push({
        'id': idCounter++,
        'BOMid': child['BOMid'] || child['BOMID'] || '',
        '父项物料编码': parentCode,
        '父项物料名称': parentName || '',
        'Level_no': level,
        '展开项次': currentExpandSeq,
        '项次': itemSeq,
        '子项物料编码': child['子项物料编码'] || child['子项编码'] || child['物料编码'] || '',
        '子项物料名称': child['子项物料名称'] || child['子项名称'] || child['物料名称'] || '',
        '子项规格型号': child['子项规格型号'] || child['规格型号'] || child['规格'] || '',
        '子项单位': child['子项单位'] || child['单位'] || '',
        '用量_分子': child['用量_分子'] || child['用量'] || '',
        '用量_分母': child['用量_分母'] || '1',
        '子项物料属性': child['子项物料属性'] || child['物料属性'] || '',
        'path': path + ' -> ' + (child['子项物料编码'] || child['子项编码'] || ''),
        '创建时间': new Date().toLocaleString(),
        '_qty': den !== 0 ? num / den : 0,
        '_levelNum': level,
        '_levelRaw': String(level)
      });

      // 防循环 + 限制层级 ≤ 10
      const childCode = child['子项物料编码'] || child['子项编码'] || '';
      if (level < 10 && childCode && !path.includes('|' + childCode + '|')) {
        recurse(
          childCode,
          level + 1,
          path + '|' + childCode,
          currentExpandSeq,
          child['子项物料名称'] || child['子项名称'] || ''
        );
      }
    });
  }

  // 从顶层开始展开
  itemsToUse.forEach((top, idx) => {
    const topSeq = top['项次'] || top['序号'] || (idx + 1);
    const level = 0; // ✅ 修复 te.js:315 报错，明确声明层级
    const topExpandSeq = String(topSeq).padStart(2, '0');
    const topChildCode = top['子项物料编码'] || top['子项编码'] || top['物料编码'] || '';

    result.push({
      'id': idCounter++,
      'BOMid': top['BOMid'] || top['BOMID'] || '',
      '父项物料编码': topCode,
      '父项物料名称': topName,
      'Level_no': 0,
      '展开项次': topExpandSeq,
      '项次': topSeq,
      '子项物料编码': topChildCode,
      '子项物料名称': top['子项物料名称'] || top['子项名称'] || top['物料名称'] || '',
      '子项规格型号': top['子项规格型号'] || top['规格型号'] || top['规格'] || '',
      '子项单位': top['子项单位'] || top['单位'] || '',
      '用量_分子': top['用量_分子'] || top['用量'] || '',
      '用量_分母': top['用量_分母'] || '1',
      '子项物料属性': top['子项物料属性'] || top['物料属性'] || '',
      'path': '0 -> ' + topChildCode,
      '创建时间': new Date().toLocaleString(),
      '_qty': (parseFloat(top['用量_分子'] || top['用量'] || '0') || 0) / ((parseFloat(top['用量_分母'] || '1') || 1)),
      '_levelNum': 0,
      '_levelRaw': '0'
    });

    if (level < 10 && topChildCode) {
      recurse(
        topChildCode,
        1,
        '0|' + topChildCode,
        topExpandSeq,
        top['子项物料名称'] || top['子项名称'] || ''
      );
    }
  });

  console.log('展开完成，共', result.length, '行');
  return result;
}

// ============ 事件绑定 ============
function bindEvents() {
  // 展开BOM按钮
  const btnExpand = document.getElementById('btnExpand');
  if (btnExpand) {
    btnExpand.addEventListener('click', () => {
      const topCode = document.getElementById('topCodeInput').value;
      if (!topCode) { alert('请输入成品物料编码'); return; }

      const expanded = expandBOM(topCode);
      if (expanded && expanded.length > 0) {
        allData = expanded;
        filteredData = [...allData];
        initFilters();
        currentPage = 1;
        renderPage(1);
        updateSummary();
        console.log(`BOM展开完成：${topCode}，共 ${expanded.length} 行`);
      }
    });
  }

  // 回车触发
  const topInput = document.getElementById('topCodeInput');
  if (topInput) {
    topInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btnExpand')?.click();
    });
  }

  // 搜索
  let searchTimer = null;
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { applyFilters(); }, 300);
    });
  }

  const levelFilter = document.getElementById('levelFilter');
  if (levelFilter) levelFilter.addEventListener('change', applyFilters);

  const unitFilter = document.getElementById('unitFilter');
  if (unitFilter) unitFilter.addEventListener('change', applyFilters);

  const propFilter = document.getElementById('propFilter');
  if (propFilter) propFilter.addEventListener('change', applyFilters);

  const btnReset = document.getElementById('btnReset');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      const si = document.getElementById('searchInput');
      if (si) si.value = '';
      if (levelFilter) levelFilter.value = '';
      if (unitFilter) unitFilter.value = '';
      if (propFilter) propFilter.value = '';
      filteredData = [...allData];
      currentPage = 1;
      renderPage(1);
      updateSummary();
    });
  }

  const btnExport = document.getElementById('btnExport');
  if (btnExport) btnExport.addEventListener('click', exportCSV);

  // 钻取模式
  const btnDrill = document.getElementById('btnDrillMode');
  if (btnDrill) {
    btnDrill.addEventListener('click', () => {
      drillMode = !drillMode;
      btnDrill.textContent = drillMode ? '钻取模式：开' : '钻取模式：关';
      btnDrill.classList.toggle('active', drillMode);
      if (!drillMode && drillStack.length > 0) drillStack = [];
    });
  }

  // 弹窗关闭
  const modalClose = document.getElementById('modalClose');
  if (modalClose) modalClose.addEventListener('click', () => {
    document.getElementById('modal').classList.remove('show');
  });

  const modal = document.getElementById('modal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.remove('show');
    });
  }
}

// ============ 表头 ============
function initTableHeader() {
  const thead = document.getElementById('tableHead');
  if (!thead) return;
  thead.innerHTML = '<tr>' + COLUMNS.map(c => {
    const sortMark = c.sortable ? ' <span class="sort-mark"></span>' : '';
    return `<th data-key="${c.key}" style="width:${c.width}px" ${c.sortable ? 'data-sortable="true"' : ''}>${c.label}${sortMark}</th>`;
  }).join('') + '</tr>';

  thead.querySelectorAll('th[data-sortable]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (sortCol === key) sortAsc = !sortAsc;
      else { sortCol = key; sortAsc = true; }
      applySort();
      renderPage(currentPage);
    });
  });
}

// ============ 渲染表格 ============
function renderPage(page) {
  currentPage = page;
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageData = filteredData.slice(start, end);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + COLUMNS.length + '" style="text-align:center;padding:40px;color:#999;">暂无数据（请输入成品编码后点击"展开BOM"）</td></tr>';
    renderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(row => {
    const levelNum = row['_levelNum'] || 0;
    const levelClass = 'level-' + Math.min(levelNum, 5);
    const badgeClass = 'level-badge-' + Math.min(levelNum, 5);

    return '<tr>' + COLUMNS.map(c => {
      let val = row[c.key];

      if (c.key === 'Level_no') {
        val = `<span class="level-badge ${badgeClass}">${val}</span>`;
      } else if (c.key === '子项物料编码') {
        val = `<span class="code-link" data-code="${val}">${val}</span>`;
      } else if (c.key === '用量_分子' || c.key === '用量_分母') {
        return `<td class="qty-col">${val || ''}</td>`;
      } else if (c.key === 'path') {
        val = `<span style="font-size:11px;color:#999;">${val || ''}</span>`;
      }

      const indent = c.key === '子项物料编码' ? `class="${levelClass}"` : '';
      const align = c.align === 'right' ? ' style="text-align:right"' : '';
      return `<td ${indent}${align}>${val || ''}</td>`;
    }).join('') + '</tr>';
  }).join('');

  tbody.querySelectorAll('.code-link').forEach(el => {
    el.addEventListener('click', () => {
      const code = el.dataset.code;
      if (drillMode) drillToChild(code);
      else showChildDetail(code);
    });
  });

  renderPagination();
}

// ============ 分页 ============
function renderPagination() {
  const total = filteredData.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const container = document.getElementById('pagination');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `<button ${currentPage === 1 ? 'disabled' : ''} onclick="goPage(${currentPage - 1})">上一页</button>`;
  html += `<span>第 ${currentPage} / ${totalPages} 页，共 ${total} 条</span>`;

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) pages.push(i);
  }
  let lastPage = 0;
  pages.forEach(p => {
    if (lastPage && p - lastPage > 1) html += '<span>...</span>';
    html += `<button class="${p === currentPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
    lastPage = p;
  });

  html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="goPage(${currentPage + 1})">下一页</button>`;
  container.innerHTML = html;
}

function goPage(p) {
  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
  if (p < 1 || p > totalPages) return;
  currentPage = p;
  renderPage(p);
  const tw = document.querySelector('.table-wrap');
  if (tw) tw.scrollTop = 0;
}

// ============ 筛选 ============
function initFilters() {
  const levelSet = new Set();
  const unitSet = new Set();
  const propSet = new Set();

  allData.forEach(r => {
    if (r['Level_no'] !== undefined && r['Level_no'] !== null && r['Level_no'] !== '') levelSet.add(String(r['Level_no']));
    if (r['子项单位']) unitSet.add(r['子项单位']);
    if (r['子项物料属性']) propSet.add(r['子项物料属性']);
  });

  fillSelect('levelFilter', levelSet, '全部层级');
  fillSelect('unitFilter', unitSet, '全部单位');
  fillSelect('propFilter', propSet, '全部属性');
}

function fillSelect(id, set, allLabel) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const current = sel.value;
  let html = `<option value="">${allLabel}</option>`;
  [...set].sort().forEach(v => { html += `<option value="${v}">${v}</option>`; });
  sel.innerHTML = html;
  if ([...set].includes(current)) sel.value = current;
}

function applyFilters() {
  const keywordEl = document.getElementById('searchInput');
  const keyword = keywordEl ? keywordEl.value.trim().toLowerCase() : '';
  const levelVal = document.getElementById('levelFilter')?.value || '';
  const unitVal = document.getElementById('unitFilter')?.value || '';
  const propVal = document.getElementById('propFilter')?.value || '';

  filteredData = allData.filter(r => {
    if (levelVal && String(r['Level_no']) !== levelVal) return false;
    if (unitVal && r['子项单位'] !== unitVal) return false;
    if (propVal && r['子项物料属性'] !== propVal) return false;

    if (keyword) {
      const searchFields = ['子项物料编码', '子项物料名称', '子项规格型号', '父项物料编码', '父项物料名称', 'BOMid', 'path'];
      const matched = searchFields.some(f => {
        const v = r[f];
        return v && String(v).toLowerCase().includes(keyword);
      });
      if (!matched) return false;
    }
    return true;
  });

  if (sortCol) applySort();
  currentPage = 1;
  renderPage(1);
  updateSummary();
}

function applySort() {
  if (!sortCol) return;
  filteredData.sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (va === undefined || va === null) va = '';
    if (vb === undefined || vb === null) vb = '';
    if (typeof va === 'number' && typeof vb === 'number') {
      return sortAsc ? va - vb : vb - va;
    }
    const sa = String(va), sb = String(vb);
    return sortAsc ? sa.localeCompare(sb, 'zh-CN') : sb.localeCompare(sa, 'zh-CN');
  });
}

// ============ 汇总 ============
function updateSummary() {
  const el = document.getElementById('summary');
  if (!el) return;

  const total = filteredData.length;
  const levelCounts = {};
  filteredData.forEach(r => {
    const l = r['Level_no'] || 0;
    levelCounts[l] = (levelCounts[l] || 0) + 1;
  });

  let html = `共 <strong>${total}</strong> 条记录`;
  const levelKeys = Object.keys(levelCounts).sort((a, b) => parseInt(a) - parseInt(b));
  if (levelKeys.length > 0) {
    html += ' | 层级分布：';
    levelKeys.forEach(k => { html += `L${k}: ${levelCounts[k]} `; });
  }
  el.innerHTML = html;
}

// ============ 钻取 ============
function drillToChild(code) {
  const children = filteredData.filter(r => r['父项物料编码'] === code);
  if (children.length === 0) {
    alert('该物料没有子项（已是最底层）');
    return;
  }
  drillStack.push({ data: filteredData, page: currentPage });
  filteredData = children;
  currentPage = 1;
  renderPage(1);
  updateSummary();
}

// ============ 弹窗明细 ============
function showChildDetail(code) {
  const children = allData.filter(r => r['父项物料编码'] === code);
  const modal = document.getElementById('modal');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  if (!modal || !title || !body) return;

  title.textContent = `子项明细 — ${code}`;
  if (children.length === 0) {
    body.innerHTML = '<p style="color:#999;">该物料没有子项</p>';
  } else {
    let html = `<table style="width:100%;font-size:12px;border-collapse:collapse;">
      <thead><tr>
        <th style="border:1px solid #e8e8e8;padding:6px;text-align:left;background:#fafafa;">子项编码</th>
        <th style="border:1px solid #e8e8e8;padding:6px;text-align:left;background:#fafafa;">子项名称</th>
        <th style="border:1px solid #e8e8e8;padding:6px;text-align:left;background:#fafafa;">规格</th>
        <th style="border:1px solid #e8e8e8;padding:6px;text-align:right;background:#fafafa;">用量</th>
        <th style="border:1px solid #e8e8e8;padding:6px;text-align:left;background:#fafafa;">单位</th>
        <th style="border:1px solid #e8e8e8;padding:6px;text-align:left;background:#fafafa;">属性</th>
      </tr></thead><tbody>`;
    children.forEach(c => {
      html += `<tr>
        <td style="border:1px solid #e8e8e8;padding:6px;">${c['子项物料编码'] || ''}</td>
        <td style="border:1px solid #e8e8e8;padding:6px;">${c['子项物料名称'] || ''}</td>
        <td style="border:1px solid #e8e8e8;padding:6px;">${c['子项规格型号'] || ''}</td>
        <td style="border:1px solid #e8e8e8;padding:6px;text-align:right;">${c['_qty'] || ''}</td>
        <td style="border:1px solid #e8e8e8;padding:6px;">${c['子项单位'] || ''}</td>
        <td style="border:1px solid #e8e8e8;padding:6px;">${c['子项物料属性'] || ''}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    body.innerHTML = html;
  }
  modal.classList.add('show');
}

// ============ 导出 ============
function exportCSV() {
  if (filteredData.length === 0) { alert('没有数据可导出'); return; }

  const headers = COLUMNS.map(c => c.label);
  const keys = COLUMNS.map(c => c.key);
  let csv = '\uFEFF' + headers.join(',') + '\n';

  filteredData.forEach(row => {
    const line = keys.map(k => {
      let v = row[k];
      if (v === null || v === undefined) v = '';
      v = String(v).replace(/"/g, '""');
      if (v.includes(',') || v.includes('"') || v.includes('\n')) v = '"' + v + '"';
      return v;
    });
    csv += line.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BOM展开_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== 双样本恢复（追加，不改动原代码） ==========
const SAMPLE_BOMS = [
  { code: 'C.6803.L.26.0634', name: '样本1' },
  { code: 'C.9503.L.26.0209', name: '样本2' }
];

(function restoreSamples() {
  const input = document.getElementById('topCodeInput');
  if (!input) return;
  // 默认填第一个
  input.value = SAMPLE_BOMS[0].code;
  // 触发展开
  if (typeof expandBOM === 'function') expandBOM();

  // 可选：下拉切换（不插 DOM 也行，至少保证默认能跑）
  if (!document.getElementById('sampleSel')) {
    const sel = document.createElement('select');
    sel.id = 'sampleSel';
    sel.innerHTML = '<option value="">--切换样本--</option>' +
      SAMPLE_BOMS.map(s => `<option value="${s.code}">${s.name}(${s.code})</option>`).join('');
    sel.onchange = () => {
      if (sel.value) { input.value = sel.value; expandBOM(); }
    };
    input.parentNode.insertBefore(sel, input.nextSibling);
  }
})();
