// ============ 全局状态 ============
let currentPage = 1;
const PAGE_SIZE = 100;
let sortCol = null;
let sortAsc = true;
let drillMode = false;
let drillStack = [];
let materialData = []; // 物料主数据
let sampleData = []; // 示例展开数据（bom展开20260930.csv）
let rawBomData = [];          // BOM原始数据
let rawMaterialData = [];     // 物料主数据原始
let allData = [];             // 展开后全量数据
let filteredData = [];        // 筛选后数据
let bomIdx = new Map();      // 原代码是 null，改为 Map（构建索引时可省去判断）
let latestMap = new Map();   // 【必须新增】确保全局可用，递归时不再报错
let materialMap = new Map();



// ============ 字段配置 ============
const COLUMNS = [
  { key: '序号',          label: '序号', width: 50, sortable: true },
  { key: 'BOMid',       label: 'BOMid', width: 80, sortable: true },
  { key: '父项物料编码', label: '父项物料编码', width: 130, sortable: true },
  { key: '父项物料名称', label: '父项物料名称', width: 150, sortable: false },
  { key: 'Level_no',    label: '层级', width: 60, sortable: true },
  { key: '展开项次',     label: '展开项次', width: 90, sortable: true },
  { key: '子项项次',        label: '子项项次', width: 60, sortable: true },
  { key: '子项物料编码', label: '子项物料编码', width: 130, sortable: true },
  { key: '子项物料名称', label: '子项物料名称', width: 150, sortable: false },
  { key: '规格型号', label: '规格型号', width: 180, sortable: false },
  { key: '单位',     label: '单位', width: 50, sortable: true },
  { key: '用量(分子)',    label: '用量(分子)', width: 80, sortable: true, align: 'right' },
  { key: '用量(分母)',    label: '用量(分母)', width: 80, sortable: true, align: 'right' },
  { key: '子项物料属性', label: '子项物料属性', width: 80, sortable: true },
 
];

// ============ CSV 行切割工具（唯一一处处理引号/逗号） ============
function splitCsvLine(line) {
  const cols = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) { cols.push(current.trim().replace(/^"|"$/g, '')); current = ''; }
    else current += ch;
  }
  cols.push(current.trim().replace(/^"|"$/g, ''));
  return cols;
}

/// ============ 加载原始BOM清单 ============
/// ============ 加载原始BOM清单 ============
// 统一加载函数（主数据映射 + BOM索引，仅fetch一次）
// 1. 加载函数：确保传给 loadMaterialMaster 的一定是数组
function loadRawBomData() {
  fetch('bomdata/清洗_物料清单主数据_202610041012.csv')
    .then(r => r.arrayBuffer())
    .then(buf => {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      const cleanText = text.replace(/^\uFEFF/, '');
      const lines = cleanText.split(/\r?\n/).filter(l => l.trim());
      
      let result = []; // 默认空数组
      if (lines.length >= 2) {
        const splitLine = (typeof splitCsvLine === 'function') ? splitCsvLine : (l) => l.split(',');
        const headers = splitLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());
        
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const cols = splitLine(lines[i]);
          if (cols.length < headers.length) continue;
          const row = {};
          for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = (cols[j] || '').trim();
          }
          result.push(row);
        }
      }
      
      console.log('解析完成，行数:', result.length);
      
      // 传进去的 result 绝对是数组（哪怕空 [])
     // loadMaterialMaster(result);
      //console.log('映射条数:', materialMap.size, '| 蒜泥机测试:', materialMap.get('C.9703.Y.26.0109'));
      
      rawBomData = result;
      buildBomIndex();
      console.log('BOM索引完成，父项种类:', bomIdx.size);
    })
    .catch(err => console.error('加载失败:', err));
}

// ============ 加载物料主数据 ============
function loadMaterialData() {
  fetch('bomdata/清洗_物料主数据__202610041012.csv')
    .then(r => r.arrayBuffer())
    .then(buf => {
      // ★ 仅替换这里的解码逻辑：自动探测 UTF-8 / GB18030
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch (e) {
        text = new TextDecoder('gb18030', { fatal: false }).decode(buf);
      }
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      
      // ↓↓↓ 你原来的代码从这里开始，完全不动 ↓↓↓
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { materialData = []; return; }
      const headers = splitCsvLine(lines[0]);
      const result = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = splitCsvLine(lines[i]);
        if (cols.length < headers.length) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
        result.push(row);
      }
      materialData = result;
      console.log('物料主数据加载完成，行数:', materialData.length);

      // ★ 加载完后立即建映射
      buildMaterialMap(materialData);
    })
    .catch(err => console.error('物料主数据加载失败:', err));
}


// ============ 从主数据构建编码→属性映射 ============
function buildMaterialMap(data) {
  materialMap.clear();
  if (!data || !data.length) return;
  
  const firstRow = data[0];
  const rawKeys = Object.keys(firstRow);
  // 精准清洗表头（干掉 \ufeff 和空格）
  const cleanKeys = rawKeys.map(k => k.replace(/^\ufeff/, '').trim());
  console.log('【映射】清洗后表头:', cleanKeys);
  
  // 硬编码找真实 Key（兼容带BOM的原始key）
  const codeKey = cleanKeys.indexOf('material_id') > -1 ? rawKeys[cleanKeys.indexOf('material_id')] : null;
  const attrKey = cleanKeys.indexOf('buy_type') > -1 ? rawKeys[cleanKeys.indexOf('buy_type')] : null;
  const nameKey = cleanKeys.indexOf('material_name') > -1 ? rawKeys[cleanKeys.indexOf('material_name')] : null;
  const paramKey = cleanKeys.indexOf('parametre') > -1 ? rawKeys[cleanKeys.indexOf('parametre')] : null;
  const unitKey = cleanKeys.indexOf('unit') > -1 ? rawKeys[cleanKeys.indexOf('unit')] : null;
  
  console.log('【映射】使用列:', codeKey, '| 属性列:', attrKey);
  
  // 【调试】打印首行真实取值，确认能读到编码
  console.log('【映射】首行原始值:', firstRow);
  console.log('【映射】首行编码取值:', codeKey ? firstRow[codeKey] : 'codeKey为空');
  
  if (!codeKey) {
    console.error('【映射失败】找不到 material_id 列，请检查表头');
    return;
  }
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    
    // 强清洗编码：去BOM、所有空白、全角、末尾点号
    let code = (row[codeKey] || '').toString()
      .replace(/^\ufeff/, '').replace(/[\s\t\r\n]/g, '').replace(/　/g, '').trim()
      .replace(/\.$/, '');
    if (!code) continue;
    
    const attr = attrKey ? (row[attrKey] || '').toString().trim() : '';
    const name = nameKey ? (row[nameKey] || '').toString().trim() : '';
    const param = paramKey ? (row[paramKey] || '').toString().trim() : '';
    const unit = unitKey ? (row[unitKey] || '').toString().trim() : '';
    
    materialMap.set(code, {
  name: row['material_name'],
  // 统一存为 parametre，兼容各种表头
  parametre: row['parametre'] || row['parameter'] || row['规格型号'] || '',
  buy_type: row['buy_type'] || '',
  unit: row['unit'] || ''
});
    
    // 存双key防不一致
    const rawCode = (row[codeKey] || '').toString().replace(/^\ufeff/, '').trim();
    if (rawCode !== code) materialMap.set(rawCode, materialMap.get(code));
  }
  
  console.log('【映射完成】大小:', materialMap.size, 
              '| 首键:', [...materialMap.keys()][0], 
              '| 首值:', materialMap.size ? JSON.stringify([...materialMap.values()][0]) : '空');
}








function buildBomIndex() {
  bomIdx.clear();
  rawBomData.forEach(row => {
    const father = (row['father_id'] || '').trim();
    if (!father) return;
    if (!bomIdx.has(father)) bomIdx.set(father, []);
    bomIdx.get(father).push(row);
  });
  console.log('BOM索引构建完成，父项种类：', bomIdx.size);
}

function buildLatestVersionMap() {
  latestMap.clear(); // 清空全局映射
  if (!bomIdx) return;
  
  for (const [father, rows] of bomIdx.entries()) {
    const verSet = new Set();
    rows.forEach(r => {
      const v = (r['bom_ver'] || '').trim();
      if (v) verSet.add(v);
    });
    
    if (verSet.size === 0) {
      latestMap.set(father, rows);
      continue;
    }
    
    // 找最大版本
    const maxVer = [...verSet].reduce((a, b) => a > b ? a : b, '');
    // 保留该版本所有行（同版本多子项全留）
    const latestRows = rows.filter(r => (r['bom_ver'] || '').trim() === maxVer);
    
    latestMap.set(father, latestRows.length ? latestRows : rows);
  }
  console.log('最新版本映射构建完成，父项种类：', latestMap.size);
}

// 初始化顺序（放在数据加载后）：
 //buildBomIndex();
 //buildLatestVersionMap();
// expandBOM(顶层编码);

  // 取主数据信息（名称、规格、属性）
function getMatInfo(code) {
  if (!code) return { name: '', parametre: '', buy_type: '', unit: '' };
  const clean = code.replace(/^﻿/, '').replace(/[\s\t\r\n]/g, '').replace(/　/g, '').trim().replace(/\.$/, '');
  const info = materialMap.get(clean) || materialMap.get(code.replace(/^﻿/, '').trim());
  return info || { name: '', parametre: '', buy_type: '', unit: '' };
}

// ============ 递归函数：构建最新版本映射（每个父项只保留最新已审核版本） ============
function expandBOM(topCode) {
  const result = [];
  let idCounter = 1;

  // 每次展开前重建索引（你确认过不能删）
  buildBomIndex();
  buildLatestVersionMap();


  // 递归展开
  function recurse(parentCode, level, seqPrefix, pathVisited) {
    if (pathVisited.has(parentCode)) return; // 防环
    pathVisited.add(parentCode);

    const children = latestMap.get(parentCode);
    if (!children || children.length === 0) {
      pathVisited.delete(parentCode);
      return;
    }

    // 按 son_no 排序
    children.sort((a, b) => (parseInt(a['son_no']) || 0) - (parseInt(b['son_no']) || 0));
// 放在 forEach 前
console.log('【入口】children长度:', children?.length, 'level:', level, 'parent:', parentCode);
    children.forEach((child, i) => {
      // 临时：无条件打第1条，防 i 异常
  if (i === 0) {
    console.log('【强制第1条】KEYS:', Object.keys(child));
    console.log('【强制第1条】全量:', JSON.stringify(child));
    console.log('【强制第1条】son_id:', child['son_id'], '规格型号:', child['规格型号']);
  }
// ✅ 真正探测 BOM 子项（0930）表头，前3条全打
  if (i < 3) {
    console.log(`【BOM子项探测 i=${i}】KEYS:`, Object.keys(child));
    console.log(`【BOM子项探测 i=${i}】全量:`, JSON.stringify(child));
    const _code = (child['son_id'] || '').replace(/^﻿|[\s\t\r\n]/g, '').trim();
    console.log(`【BOM子项探测 i=${i}】son_id=>${_code}`);
    console.log(`【BOM子项探测 i=${i}】规格候选值:`, 
      '规格型号:', child['规格型号'], 
      '子项规格:', child['子项规格'], 
      '规格:', child['规格'],
      'parametre:', getMatInfo(_code)?.parametre
    );
  }

      const seq = parseInt(child['son_no']) || (i + 1);

      const curSeq = seqPrefix
        ? seqPrefix + '_' + String(seq).padStart(2, '0')
        : String(seq).padStart(2, '0');

     


      // BOM表字段取值
      const childCode = (child['son_id'] || '').replace(/^﻿|[\s\t\r\n]/g, '').trim();
      const realChildName = child['s_material_name'] || '';   // BOM表自带名称
      const childUnit = child['unit'] || '';
     // const fenzi = child['fenzi'] !== undefined && child['fenzi'] !== '' ? Number(child['fenzi']) : '';
     // const fenmu = child['fenmu'] !== undefined && child['fenmu'] !== '' ? Number(child['fenmu']) : '';
     const fenzi = child['fenzi'] !== undefined && child['fenzi'] !== '' ? Number(child['fenzi']) : (child['用量_分子'] || child['分子'] || '');
     const fenmu = child['fenmu'] !== undefined && child['fenmu'] !== '' ? Number(child['fenmu']) : (child['用量_分母'] || child['分母'] || '');

      // 主数据取值（规格、属性）
     const matInfo = getMatInfo(childCode);
     // 确保和映射返回的键名 parametre 完全一致，兼容拼写差异
     //const specModel = (getMatInfo(childCode).parametre || child['规格型号'] || '').trim();
     //const specModel = (getMatInfo(childCode).parametre || child['规格型号'] || child['子项规格型号'] || '').trim();
     const childAttr = matInfo.buy_type || '';  
// 规格仅来自主数据 parametre（BOM无规格字段）
const specModel = (matInfo?.parametre || '').trim();
      // 父项名称
      let realParentName = '';
      if (level === 1) {
        // 首层：优先用主数据名称，兜底用输入编码
        const pInfo = getMatInfo(parentCode);
        realParentName = pInfo.name || parentCode;
      } else {
  // 深层：parentCode 就是上层的 childCode，从主数据或BOM表取名称
  const pInfo = getMatInfo(parentCode);
  realParentName = pInfo.name || parentCode;



console.log('渲染检查', childCode, 'parametre:', matInfo.parametre, 'specModel:', specModel);
//console.log('最终规格列HTML:', rowHtml.includes(specModel) ? '✅已写入' : '❌未写入');
}

      result.push({
        '序号': idCounter++,
        'BOMid': child['bom_id'] || '',
        '父项物料编码': parentCode,
        '父项物料名称': realParentName,
        '层级': String(level),
        'Level_no': String(level),
        '_levelNum': level,
        '展开项次': curSeq,
        '子项项次': seq,
        '子项物料编码': childCode,
        '子项物料名称': realChildName,
        '规格型号': specModel,
        '单位': childUnit,
        '用量(分子)': parseFloat(child['fenzi']) || 0,   // ✅ 对齐表头
        '用量(分母)': fenmu,
        '子项物料属性': childAttr || '',   // childAttr 是你上面算的 matInfo.buy_type
        '_qty': fenzi
      });

      // 递归（传 new Set 做路径级防环）
      recurse(childCode, level + 1, curSeq, new Set(pathVisited));
    });
    console.log('push后首条规格:', result[0]?.['规格型号'], '| 全部keys:', Object.keys(result[0] || {}));
    pathVisited.delete(parentCode);
  }

  // 开始递归
  recurse(topCode, 1, '', new Set());

  if (result.length === 0) {
    alert('该编码没有子项，可能不是父项');
  }

  filteredData = result;
  allData = result;
  // expandBOM 里，数据已经 push 进 tableData / filteredData / allData 之后
   initFilters();
  renderPage(1);
  updateSummary(result);
  // 强制把正确数据渲染到规格列，不干扰旧表格
setTimeout(() => {
  result.forEach(row => {
    const td = document.getElementById(`spec_${row['子项物料编码']}_${row['展开项次']}`);
    if(td) td.textContent = row['规格型号'] || '';
  });
}, 50); // 等旧renderPage画完
  return result;

}




function renderPage(data, page) {
  // 若你原有分页，这里保留分页逻辑，只改下面渲染
  console.log('>>> 实际调用, data长度:', data?.length, '首条规格:', data?.[0]?.['规格型号']);
  const tbody = document.querySelector('#bomTable tbody'); 
  if(!tbody) return;
  tbody.innerHTML = '';
  console.log('渲染瞬间:', row['子项物料编码'], '| 规格型号值:', row['规格型号'], '| 属性值:', row['子项物料属性']);
  data.forEach(row => {
    const tr = document.createElement('tr');
    // 重点：读取 row['层级']，加 nowrap 防换行，加判断防字符串"undefined"
    const lvl = row['层级'] === 'undefined' ? '' : row['层级'];
    tr.innerHTML = `
      <td>${row['序号']}</td>
      <td>${row['BOMid']}</td>
      <td>${row['父项物料编码']}</td>
      <td>${row['父项物料名称']}</td>
      <td style="white-space:nowrap;">${lvl}</td> 
      <td>${row['展开项次']}</td>
      <td>${row['子项项次']}</td>
      <td>${row['子项物料编码']}</td>
      <td id="spec_${row['子项物料编码']}_${row['展开项次']}">${row['规格型号'] || ''}</td>
      <td>${row['规格型号']}</td>
      <td>${row['单位']}</td>
      <td>${row['用量(分子)']}</td>
      <td>${row['用量(分母)']}</td>
      <td>${row['子项物料属性']}</td>
    `;
    tbody.appendChild(tr);
    // 强制兜底
const specTd = document.getElementById(`spec_${row['子项物料编码']}_${row['展开项次']}`);
if(specTd) specTd.textContent = row['规格型号'] || '';
  });
}

function updateSummary(data) {
  // 适配你的统计栏，示例：
  const total = data.length;
  const summaryEl = document.getElementById('summary'); // 请确认你的统计栏ID
  if(summaryEl) {
    summaryEl.innerText = `共 ${total} 条记录 | 层级分布: L0: ${total}`;
  }
}

// ============ 事件绑定 ============
function bindEvents() {
  const btnExpand = document.getElementById('btnExpand');
  const topInput = document.getElementById('topCodeInput');
  if (btnExpand) {
    btnExpand.addEventListener('click', () => {
      const code = (topInput?.value || '').trim();
      if (!code) return alert('请输入编码');
      const res = expandBOM(code);
      if (res?.length) {
        allData = res;
        filteredData = [...allData];
        renderPage(1);
        updateSummary();
      }
    });
  }
}
// ============ DOM 就绪 ============
document.addEventListener('DOMContentLoaded', () => {
  initTableHeader();
  bindEvents();
  loadMaterialData();        // ← 加载主数据 + 自动建映射
  loadRawBomData();         // ← 加载BOM数据（内部不再调 loadMaterialMaster）
  
});

// 加载物料主数据


// ============ 回车触发 ============
const topInput = document.getElementById('topCodeInput');
if (topInput) {
  topInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnExpand')?.click();
  });
}

// ============ 搜索 ============
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

// ============ 钻取模式 ============
const btnDrill = document.getElementById('btnDrillMode');
if (btnDrill) {
  btnDrill.addEventListener('click', () => {
    drillMode = !drillMode;
    btnDrill.textContent = drillMode ? '钻取模式：开' : '钻取模式：关';
    btnDrill.classList.toggle('active', drillMode);
    if (!drillMode && drillStack.length > 0) drillStack = [];
  });
}

// ============ 弹窗关闭 ============
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
    tbody.innerHTML = '<tr><td colspan="' + COLUMNS.length + '" style="text-align:center;padding:40px;color:#999;">暂无数据</td></tr>';
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

  filteredData.forEach(r => {
    if (r['Level_no'] !== undefined && r['Level_no'] !== null && r['Level_no'] !== '') levelSet.add(String(r['Level_no']));
     if (r['单位']) unitSet.add(r['单位']);           // ← 改成 '单位'
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
        <th style="border:1px solid #e8e8e8;padding:6px;text-align:left;background:#fafafa;">子项物料编码</th>
        <th style="border:1px solid #e8e8e8;padding:6px;text-align:left;background:#fafafa;">子项物料名称</th>
        <th style="border:1px solid #e8e8e8;padding:6px;text-align:right;background:#fafafa;">用量</th>
        <th style="border:1px solid #e8e8e8;padding:6px;text-align:left;background:#fafafa;">单位</th>
        <th style="border:1px solid #e8e8e8;padding:6px;text-align:left;background:#fafafa;">属性</th>
      </tr></thead><tbody>`;
    children.forEach(c => {
      html += `<tr>
        <td style="border:1px solid #e8e8e8;padding:6px;">${c['子项物料编码'] || ''}</td>
        <td style="border:1px solid #e8e8e8;padding:6px;">${c['子项物料名称'] || ''}</td>
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


 document.getElementById('backtooa').onclick = () => location.href = './zhaolin.html';
 document.getElementById('create_new_material_code').onclick = () => location.href = './material.html';
 document.getElementById('create_new_bom_code').onclick = () => location.href = './bomlist.html';

window.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('topCodeInput');
  if (input) input.value = 'C.9801.G.26.0321';
  
  // 原来藏在 loadExpandedBomCSV 里的这行，现在直接调
  // initFilters();
  
  setTimeout(() => {
    expandBOM('C.9801.G.26.0321');
  }, 100);
});
