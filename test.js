(function() {
  const textInput = document.getElementById('stTextInput');
  const importBtn = document.getElementById('stImportBtn');
  const fileInput = document.getElementById('stFileInput');
  const clearBtn = document.getElementById('stClearBtn');
  const totalCount = document.getElementById('stTotalCount');
  const uniqueCount = document.getElementById('stUniqueCount');
  const hanTotal = document.getElementById('stHanTotal');
  const hanUnique = document.getElementById('stHanUnique');
  const hanRate = document.getElementById('stHanRate');
  const tbody = document.querySelector('#stResultTable tbody');

  function analyze(text) {
    const len = text.length;
    let hanLen = 0;
    const map = {};
    
    for (let char of text) {
      if (char === '\n') continue;
      const isHan = /^[\u4e00-\u9fa5]$/.test(char);
      if (isHan) hanLen++;
      map[char] = (map[char] || 0) + 1;
    }
    
    totalCount.textContent = len;
    uniqueCount.textContent = Object.keys(map).length;
    
    hanTotal.textContent = hanLen;
    const hanKeys = Object.keys(map).filter(k => /^[\u4e00-\u9fa5]$/.test(k));
    hanUnique.textContent = hanKeys.length;
    hanRate.textContent = len ? (hanLen / len * 100).toFixed(2) + '%' : '0%';
    
    const hanArr = [], symArr = [];
    Object.keys(map).forEach(k => {
      const item = { char: k, count: map[k] };
      /^[\u4e00-\u9fa5]$/.test(k) ? hanArr.push(item) : symArr.push(item);
    });
    
    const sortFn = (a, b) => b.count - a.count || a.char.localeCompare(b.char);
    hanArr.sort(sortFn);
    symArr.sort(sortFn);
    
    const mergeGroup = (arr) => {
      const grouped = [];
      let current = null;
      for (let item of arr) {
        if (!current || current.count !== item.count) {
          if (current) grouped.push(current);
          current = { count: item.count, chars: [item.char] };
        } else {
          current.chars.push(item.char);
        }
      }
      if (current) grouped.push(current);
      return grouped;
    };
    
    const hanMerged = mergeGroup(hanArr);
    const symMerged = mergeGroup(symArr);
    
    let html = '', idx = 1;
    const renderRow = (g) => {
      const rate = len ? (g.count / len * 100).toFixed(2) + '%' : '0%';
      const display = g.chars.map(c => c === ' ' ? '<span class="char-space">[空格]</span>' : c).join('、');
      return `<tr>
        <td style="text-align:center;">${idx++}</td>
        <td style="text-align:center;">${g.count}</td>
        <td style="text-align:center;">${rate}</td>
        <td>${display}</td>
      </tr>`;
    };
    
    hanMerged.forEach(g => html += renderRow(g));
    if (symMerged.length > 0) {
      html += `<tr class="divider-row"><td colspan="4">—— 以下为非汉字（标点 / 英文 / 数字 / 空格）——</td></tr>`;
    }
    symMerged.forEach(g => html += renderRow(g));
    
    tbody.innerHTML = html;
  }

  textInput.addEventListener('input', e => analyze(e.target.value));
  
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const isTextType = file.type.startsWith('text/') || /\.(txt|md|csv|json|html|htm|xml|js|css|log)$/i.test(file.name);
    if (!isTextType) {
      alert('请选择纯文本类文件（如 .txt, .md, .csv, .json, .html 等）');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => { 
      textInput.value = ev.target.result; 
      analyze(textInput.value); 
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });
  
  clearBtn.addEventListener('click', () => { 
    textInput.value = ''; 
    analyze(''); 
  });
  
  analyze('');
})();
