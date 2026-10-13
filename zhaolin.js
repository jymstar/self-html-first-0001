const textInput = document.getElementById('stTextInput');
const fileInput = document.getElementById('stFileInput');
const importBtn = document.getElementById('stImportBtn');
const imgInput = document.getElementById('stImgInput');
const imgBtn = document.getElementById('stImgBtn');
const clearBtn = document.getElementById('stClearBtn');
const totalCount = document.getElementById('stTotalCount');
const uniqueCount = document.getElementById('stUniqueCount');
const tbody = document.querySelector('#stResultTable tbody');

if (textInput && importBtn) {
  function stAnalyze(text) {
    const trimmed = text;
    totalCount.textContent = trimmed.length;
    
    const map = {};
    for (let char of trimmed) {
      if(char === '\n') continue;
      map[char] = (map[char] || 0) + 1;
    }
    
    const arr = Object.keys(map).map(k => ({
      char: k,
      count: map[k],
      // 严格区分：纯汉字 vs 其它（标点、英文、数字、空格）
      isHan: /^[\u4e00-\u9fa5]$/.test(k) 
    }));
    
    // 排序：1.汉字排最前；2.同类别按频次降序；3.同频次按字符排
    arr.sort((a, b) => {
      if (a.isHan && !b.isHan) return -1; // 汉字永远在前
      if (!a.isHan && b.isHan) return 1;  // 符号永远在后
      if (b.count !== a.count) return b.count - a.count; // 频次降序
      return a.char.localeCompare(b.char);
    });
    
    uniqueCount.textContent = arr.length;
    
    let html = '';
    let hanDone = false;
    
    arr.forEach((item, index) => {
      // 汉字结束、符号开始时，加一行提示（视觉上彻底分开）
      if (!hanDone && !item.isHan) {
        html += `<tr><td colspan="3" style="background:#fafafa;text-align:center;color:#888;">--- 以下为非汉字（标点/英文/数字/空格） ---</td></tr>`;
        hanDone = true;
      }
      
      const rate = (item.count / trimmed.length * 100).toFixed(2) + '%';
      let display = item.char === ' ' ? '<span class="char-space">[空格]</span>' : item.char;
      
      html += `<tr>
        <td>${index + 1}</td>
        <td>${item.count}<br>(${rate})</td>
        <td>${display}</td>
      </tr>`;
    });
    
    tbody.innerHTML = html;
  }

  // 事件绑定（保持原样）
  textInput.addEventListener('input', e => stAnalyze(e.target.value));
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { textInput.value = ev.target.result; stAnalyze(textInput.value); };
    reader.readAsText(file, 'UTF-8');
  });
  if(imgBtn) {
    imgBtn.addEventListener('click', () => imgInput.click());
    imgInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      imgBtn.textContent = '识别中...';
      // 需引入 tesseract.js
      Tesseract.recognize(file, 'chi_sim+eng', { logger: m => console.log(m) })
        .then(({ data: { text } }) => {
          textInput.value += (textInput.value ? '\n' : '') + text;
          stAnalyze(textInput.value);
          imgBtn.textContent = '识别图片文字';
        });
    });
  }
  clearBtn.addEventListener('click', () => { textInput.value=''; stAnalyze(''); });
}