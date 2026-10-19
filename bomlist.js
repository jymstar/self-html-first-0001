const KEY='bomlist_all_v2';
const PAGE_SIZE=100;
let all=[], filtered=[], currentPage=1, selectedId=null, searchTimer=null;

try{ all = JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ all=[]; }
filtered=[...all];

// CSV 状态机解析（复用，不变）
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
    if(!r || r.length<5) return;
    const get=(idx)=>(r[idx]||'').trim();
    const h=head.map(s=>(s||'').trim());
    // 按表头动态映射
    const bomIdx=h.indexOf('BOMid'), itemIdx=h.indexOf('项次'), verIdx=h.indexOf('BOM版本'),
          parentIdx=h.indexOf('父项物料编码'), pnameIdx=h.indexOf('物料名称'), stIdx=h.indexOf('数据状态'),
          childIdx=h.indexOf('子项物料编码'), cnameIdx=h.indexOf('子项物料名称'), unitIdx=h.indexOf('子项单位'),
          numIdx=h.indexOf('用量_分子'), denIdx=h.indexOf('用量_分母');
    const bomid=get(bomIdx>=0?bomIdx:0);
    if(!bomid) return;
    all.push({
      _id:'bom_'+(Date.now()+i),
      bomid,
      item:get(itemIdx>=0?itemIdx:1),
      version:get(verIdx>=0?verIdx:2),
      parentcode:get(parentIdx>=0?parentIdx:3),
      parentname:get(pnameIdx>=0?pnameIdx:4),
      status:get(stIdx>=0?stIdx:5)||'已审核',
      childcode:get(childIdx>=0?childIdx:6),
      childname:get(cnameIdx>=0?cnameIdx:7),
      childunit:get(unitIdx>=0?unitIdx:8),
      numerator:get(numIdx>=0?numIdx:9),
      denominator:get(denIdx>=0?denIdx:10)
    });
  });
  filtered=[...all]; currentPage=1;
  saveSafe(); renderPage();
  document.getElementById('importTip').textContent=`已导入 ${all.length} 条（已清空旧数据）`;
}

function saveSafe(){
  try{ localStorage.setItem(KEY, JSON.stringify(all)); document.getElementById('saveTip').textContent='已实时保存 ('+new Date().toLocaleTimeString()+')'; }catch(e){ document.getElementById('saveTip').textContent='数据量大，仅内存(未存本地)'; }
}
function saveRealTime(){ saveSafe(); }

function debounceSearch(){
  clearTimeout(searchTimer);
  searchTimer=setTimeout(doSearch,300);
}
function resetSearch(){
  ['s_mohu','s_bomid','s_item','s_version','s_parentcode','s_parentname','s_status','s_childcode','s_childname','s_childunit'].forEach(id=>document.getElementById(id).value='');
  doSearch();
}
function doSearch(){
  const m=document.getElementById('s_mohu').value.trim();
  const bomid=document.getElementById('s_bomid').value.trim();
  const item=document.getElementById('s_item').value.trim();
  const ver=document.getElementById('s_version').value.trim();
  const pc=document.getElementById('s_parentcode').value.trim();
  const pn=document.getElementById('s_parentname').value.trim();
  const st=document.getElementById('s_status').value;
  const cc=document.getElementById('s_childcode').value.trim();
  const cn=document.getElementById('s_childname').value.trim();
  const cu=document.getElementById('s_childunit').value.trim();
  filtered=all.filter(x=>
    (!m || x.bomid.includes(m) || x.parentcode.includes(m) || x.parentname.includes(m) || x.childcode.includes(m) || x.childname.includes(m)) &&
    (!bomid||x.bomid.includes(bomid)) &&
    (!item||x.item.includes(item)) &&
    (!ver||x.version.includes(ver)) &&
    (!pc||x.parentcode.includes(pc)) &&
    (!pn||x.parentname.includes(pn)) &&
    (!st||x.status===st) &&
    (!cc||x.childcode.includes(cc)) &&
    (!cn||x.childname.includes(cn)) &&
    (!cu||x.childunit.includes(cu))
  );
  currentPage=1; renderPage();
}

function renderPage(){
  const total=filtered.length, pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  if(currentPage>pages) currentPage=pages;
  const start=(currentPage-1)*PAGE_SIZE, pageData=filtered.slice(start,start+PAGE_SIZE);
  const tbody=document.getElementById('tbody');
  tbody.innerHTML=pageData.map(m=>`
    <tr class="${m._id===selectedId?'sel':''}" onclick="selectRow('${m._id}')">
      <td><input type="radio" ${m._id===selectedId?'checked':''}></td>
      <td title="${m.bomid}">${m.bomid}</td>
      <td>${m.item}</td>
      <td>${m.version}</td>
      <td>${m.parentcode}</td>
      <td>${m.parentname}</td>
      <td>${m.status}</td>
      <td>${m.childcode}</td>
      <td>${m.childname}</td>
      <td>${m.childunit}</td>
      <td>${m.numerator}</td>
      <td>${m.denominator}</td>
    </tr>`).join('');
  document.getElementById('pagination').innerHTML=
    `共 ${all.length} 条BOM | 搜索结果 ${total} 条 | 第 ${currentPage}/${pages} 页（每页${PAGE_SIZE}条）`+
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

function openEdit(mode){
  const cur=getSelected(); if(!cur&&mode!=='copy') return alert('请先选中一条');
  const isCopy=mode==='copy';
  document.getElementById('modalTitle').textContent=isCopy?'复制BOM':'修改BOM';
  document.getElementById('f_mode').value=mode; document.getElementById('f_id').value=cur?._id||'';
  const ci=document.getElementById('f_bomid');
  ci.value=isCopy?(cur?.bomid+'_COPY'||''):(cur?.bomid||'');
  ci.readOnly=!isCopy; document.getElementById('codeTip').textContent=isCopy?'(可改)':'(不可改)';
  document.getElementById('f_item').value=cur?.item||'';
  document.getElementById('f_version').value=cur?.version||'';
  document.getElementById('f_parentcode').value=cur?.parentcode||'';
  document.getElementById('f_parentname').value=cur?.parentname||'';
  document.getElementById('f_status').value=cur?.status||'';
  document.getElementById('f_childcode').value=cur?.childcode||'';
  document.getElementById('f_childname').value=cur?.childname||'';
  document.getElementById('f_childunit').value=cur?.childunit||'';
  document.getElementById('f_numerator').value=cur?.numerator||'';
  document.getElementById('f_denominator').value=cur?.denominator||'';
  document.getElementById('modal').style.display='block';
}
function closeModal(){ document.getElementById('modal').style.display='none'; }

document.getElementById('editForm').addEventListener('submit',e=>{
  e.preventDefault();
  const mode=document.getElementById('f_mode').value;
  const bomid=document.getElementById('f_bomid').value.trim();
  if(mode==='copy'&&all.some(m=>m.bomid===bomid)) return alert('BOMid已存在');
  const data={
    _id:mode==='copy'?'bom_'+Date.now():document.getElementById('f_id').value,
    bomid,
    item:document.getElementById('f_item').value.trim(),
    version:document.getElementById('f_version').value.trim(),
    parentcode:document.getElementById('f_parentcode').value.trim(),
    parentname:document.getElementById('f_parentname').value.trim(),
    status:document.getElementById('f_status').value||'已审核',
    childcode:document.getElementById('f_childcode').value.trim(),
    childname:document.getElementById('f_childname').value.trim(),
    childunit:document.getElementById('f_childunit').value.trim(),
    numerator:document.getElementById('f_numerator').value.trim(),
    denominator:document.getElementById('f_denominator').value.trim()
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

document.getElementById('fileInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  const buf=await f.arrayBuffer(); const txt=await decodeCSV(buf); importText(txt);
});

// 初始自动加载（CSV文件名对应你的BOM清单数据）
if(all.length===0){
  fetch('bomdata/_物料清单主数据__20261016.csv').then(r=>r.arrayBuffer()).then(async buf=>{
    const txt=await decodeCSV(buf); importText(txt);
  }).catch(()=>{});
}
renderPage();



document.getElementById('backtooa').onclick = () => location.href = './zhaolin.html';
document.getElementById('create_new_material_code').onclick = () => location.href = './material.html';

  document.getElementById('create_new_bom_search').onclick = () => location.href = './bomextend.html';


