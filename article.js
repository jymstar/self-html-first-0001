// article.js
document.addEventListener('DOMContentLoaded', () => {
  // 1. 获取 URL 中的 id
  const params = new URLSearchParams(window.location.search);
  const articleId = params.get('id') || '1';

  // 2. 模拟数据（实际开发这里换成 fetch/axios 请求后端）
  const mockData = {
    '1': { title: '关于中秋放假的通知', date: '2026-10-13', author: '行政部', content: '<p>中秋节放假安排...</p>' },
    '2': { title: '2026年Q3绩效考核启动', date: '2026-10-01', author: 'HR', content: '<p>考核安排详情...</p>' }
  };

  // 3. 渲染页面
  const data = mockData[articleId];
  if (data) {
    document.getElementById('artTitle').innerText = data.title;
    document.getElementById('artDate').innerText = data.date;
    document.getElementById('artAuthor').innerText = data.author;
    document.getElementById('artContent').innerHTML = data.content;
  }
});
