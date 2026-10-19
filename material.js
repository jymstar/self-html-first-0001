const KEY='material_all_v2';
const PAGE_SIZE=100;
let all=[], filtered=[], currentPage=1, selectedId=null, searchTimer=null;

// 安全读取（防报错）
try{ all = JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ all=[]; }
filtered=[...all];

// CSV 状态机解析（支持引号内逗号）
function parseCSV(text){
  const rows=[]; let row=[], field='', inQ=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(inQ){
      if(c==='"' && n==='"'){ field+='"'; i++; }
      else if(c==='"'){ inQ=false; }
      else field+=c;
    }else{
      if(c==='"') inQ=true;
      else if(c===','){ row.push(field); field=''; }
      else if(c==='\n' || (c==='\r'&&n==='\n')){ row.push(field); rows.push(row); row=[]; field=''; i+=(c==='\r'?1:0); }
      else if(c!=='\r') field+=c;
    }
  }
  if(field!==''||row.length){ row.push(field); rows.push(row); }
  return rows;
}
async function decodeCSV(buf){
  const dv=new DataView(buf);
  if(dv.getUint8(0)===0xEF&&dv.getUint8(1)===0xBB&&dv.getUint8(2)===0xBF) return new TextDecoder('utf-8').decode(buf.slice(3));
  return new TextDecoder('utf-8').decode(buf);
}

// 导入（默认清空）
function importText(text){
  all=[]; filtered=[];
  const rows=parseCSV(text);
  const head=rows.shift()||[];
  rows.forEach((r,i)=>{
    if(!r || r.length<3) return;
    const get=(idx)=>(r[idx]||'').trim();
    // 按常见列名自适应（兼容不同导出）
    const h=head.map(s=>(s||'').trim());
    const ci=h.indexOf('物料编码'), ni=h.indexOf('物料名称'), si=h.indexOf('规格型号'), di=h.indexOf('图纸代号'), coi=h.indexOf('颜色色号'), pi=h.indexOf('图片'), sti=h.indexOf('数据状态'), dbi=h.indexOf('禁用'), cri=h.indexOf('创建日期'), moi=h.indexOf('修改日期'), ai=h.indexOf('物料属性'), ui=h.indexOf('基本单位'), bi=h.indexOf('允许采购'), oi=h.indexOf('允许委外'), wi=h.indexOf('仓库'), rm=h.indexOf('备注');
    const code=get(ci>=0?ci:0), name=get(ni>=0?ni:1), spec=get(si>=0?si:2);
    if(!code&&!name) return;
    all.push({
      _id:'m_'+(Date.now()+i),
      code, name, spec,
      drawing:get(di>=0?di:3), color:get(coi>=0?coi:4), pic:get(pi>=0?pi:5),
      status:get(sti>=0?sti:6)||'已审核', disabled:get(dbi>=0?dbi:7)||'否',
      cdate:get(cri>=0?cri:8), mdate:get(moi>=0?moi:9),
      attr:get(ai>=0?ai:10)||'外购', unit:get(ui>=0?ui:11)||'Pcs',
      allowBuy:get(bi>=0?bi:12)||'否', allowOut:get(oi>=0?oi:13)||'否',
      warehouse:get(wi>=0?wi:14), remark:get(rm>=0?rm:15)
    });
  });
  filtered=[...all]; currentPage=1;
  saveSafe(); renderPage();
  document.getElementById('importTip').textContent=`已导入 ${all.length} 条（已清空旧数据）`;
}

// 安全保存（大文件不抛错）
function saveSafe(){
  try{ localStorage.setItem(KEY, JSON.stringify(all)); document.getElementById('saveTip').textContent='已实时保存 ('+new Date().toLocaleTimeString()+')'; }catch(e){ document.getElementById('saveTip').textContent='数据量大，仅内存(未存本地)'; }
}
function saveRealTime(){ saveSafe(); }

// 搜索/防抖
function debounceSearch(){
  clearTimeout(searchTimer);
  searchTimer=setTimeout(doSearch,300);
}
function resetSearch(){
  ['s_mohu','s_code','s_name','s_spec','s_draw','s_attr','s_status'].forEach(id=>document.getElementById(id).value='');
  doSearch();
}
function doSearch(){
  const m=document.getElementById('s_mohu').value.trim();
  const c=document.getElementById('s_code').value.trim();
  const n=document.getElementById('s_name').value.trim();
  const s=document.getElementById('s_spec').value.trim();
  const d=document.getElementById('s_draw').value.trim();
  const a=document.getElementById('s_attr').value;
  const st=document.getElementById('s_status').value;
  filtered=all.filter(x=>
    (!m || x.code.includes(m) || x.name.includes(m) || x.spec.includes(m) || x.drawing.includes(m))&&
    (!c||x.code.includes(c))&&
    (!n||x.name.includes(n))&&
    (!s||x.spec.includes(s))&&
    (!d||x.drawing.includes(d))&&
    (!a||x.attr===a)&&
    (!st||x.status===st)
  );
  currentPage=1; renderPage();
}

// 渲染+分页
function renderPage(){
  const total=filtered.length, pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  if(currentPage>pages) currentPage=pages;
  const start=(currentPage-1)*PAGE_SIZE, pageData=filtered.slice(start,start+PAGE_SIZE);
  const tbody=document.getElementById('tbody');
  tbody.innerHTML=pageData.map(m=>`
    <tr class="${m._id===selectedId?'sel':''}" onclick="selectRow('${m._id}')">
      <td><input type="radio" ${m._id===selectedId?'checked':''}></td>
      <td title="${m.code}">${m.code}</td>
      <td>${m.name}</td>
      <td class="col-spec" title="${m.spec}">${m.spec}</td>
      <td>${m.drawing}</td>
      <td>${m.color}</td>
      <td>${m.pic}</td>
      <td>${m.status}</td>
      <td>${m.disabled}</td>
      <td>${m.cdate}</td>
      <td>${m.mdate}</td>
      <td>${m.attr}</td>
      <td>${m.unit}</td>
      <td>${m.allowBuy}</td>
      <td>${m.allowOut}</td>
      <td>${m.warehouse}</td>
      <td class="col-spec" title="${m.remark}">${m.remark}</td>
    </tr>`).join('');
  document.getElementById('pagination').innerHTML=
    `共 ${all.length} 条物料 | 搜索结果 ${total} 条 | 第 ${currentPage}/${pages} 页（每页${PAGE_SIZE}条）`+
    (pages>1?` <button class="btn btn-gray" ${currentPage<=1?'disabled':''} onclick="goPage(${currentPage-1})">上一页</button>
      <input type="number" id="jumpPage" min="1" max="${pages}" style="width:50px;padding:2px;">
      <button class="btn btn-blue" onclick="jumpToPage(${pages})">跳转</button>
      <button class="btn btn-gray" ${currentPage>=pages?'disabled':''} onclick="goPage(${currentPage+1})">下一页</button>`:'');
}
function goPage(p){ currentPage=p; renderPage(); }
function jumpToPage(max){ const v=parseInt(document.getElementById('jumpPage').value); if(v>=1&&v<=max){currentPage=v;renderPage();} }
function selectRow(id) {
  // 如果当前有文字被选中，说明用户在划选复制，不触发行选中
  const sel = window.getSelection();
  if (sel && sel.toString().length > 0) return;
  
  selectedId = id;
  renderPage();
}
function getSelected(){ return all.find(x=>x._id===selectedId); }

// 弹窗编辑/复制
function openEdit(mode){
  const cur=getSelected(); if(!cur&&mode!=='copy') return alert('请先选中一条');
  const isCopy=mode==='copy';
  document.getElementById('modalTitle').textContent=isCopy?'复制物料':'修改物料';
  document.getElementById('f_mode').value=mode; document.getElementById('f_id').value=cur?._id||'';
  const ci=document.getElementById('f_code');
  ci.value=isCopy?(cur?.code+'_COPY'||''):(cur?.code||'');
  ci.readOnly=!isCopy; document.getElementById('codeTip').textContent=isCopy?'(可改)':'(不可改)';
  document.getElementById('f_name').value=cur?.name||'';
  document.getElementById('f_spec').value=cur?.spec||'';
  document.getElementById('f_drawing').value=cur?.drawing||'';
  document.getElementById('f_color').value=cur?.color||'';
  document.getElementById('f_unit').value=cur?.unit||'Pcs';
  document.getElementById('f_attr').value=cur?.attr||'外购';
  document.getElementById('f_warehouse').value=cur?.warehouse||'';
  document.getElementById('f_remark').value=cur?.remark||'';
  document.getElementById('modal').style.display='block';
}
function closeModal(){ document.getElementById('modal').style.display='none'; }

document.getElementById('editForm').addEventListener('submit',e=>{
  e.preventDefault();
  const mode=document.getElementById('f_mode').value;
  const code=document.getElementById('f_code').value.trim();
  if(mode==='copy'&&all.some(m=>m.code===code)) return alert('编码已存在');
  const now=new Date().toLocaleDateString();
  const data={
    _id:mode==='copy'?'m_'+Date.now():document.getElementById('f_id').value,
    code, name:document.getElementById('f_name').value.trim(), spec:document.getElementById('f_spec').value.trim(),
    drawing:document.getElementById('f_drawing').value.trim(), color:document.getElementById('f_color').value.trim(),
    unit:document.getElementById('f_unit').value, attr:document.getElementById('f_attr').value,
    warehouse:document.getElementById('f_warehouse').value.trim(), remark:document.getElementById('f_remark').value.trim(),
    status:'重新审核', cdate:mode==='copy'?now:(getSelected()?.cdate||now), mdate:now,
    pic:'', disabled:'否', allowBuy:'否', allowOut:'否'
  };
  if(mode==='copy') all.push(data); else{ const idx=all.findIndex(m=>m._id===data._id); if(idx>-1) all[idx]=data; }
  filtered=[...all]; saveSafe(); doSearch(); closeModal();
  alert(mode==='copy'?'复制已存入':'修改已提交');
});

function doDelete(){
  if(!selectedId) return alert('请先选中');
  if(!confirm('确定删除？')) return;
  all=all.filter(m=>m._id!==selectedId); selectedId=null; saveSafe(); doSearch();
}

// 文件导入
document.getElementById('fileInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  const buf=await f.arrayBuffer(); const txt=await decodeCSV(buf); importText(txt);
});

// 初始自动加载
if(all.length===0){
  fetch('bomdata/_物料主数据__20261016.csv').then(r=>r.arrayBuffer()).then(async buf=>{
    const txt=await decodeCSV(buf); importText(txt);
  }).catch(()=>{});
}
renderPage();

 document.getElementById('backtooa').onclick = () => location.href = './zhaolin.html';
 // document.getElementById('create_new_material_code').onclick = () => location.href = './material.html';
  document.getElementById('create_new_bom_code').onclick = () => location.href = './bomlist.html';
  document.getElementById('create_new_bom_search').onclick = () => location.href = './bomextend.html';