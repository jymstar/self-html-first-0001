// alert('hi，心的空间欢迎您!');

 //let nav = document.querySelector('nav');
//nav.style.backgroundColor = '#ca1c1c';
//nav.style.padding = '10px';


window.addEventListener("load", () => {
  const welcome = document.createElement("div");
  welcome.textContent = "hi，心空间欢迎您！";
  welcome.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: #d4b13d;
    color: #333;
    padding: 10px 18px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,.15);
    z-index: 2000;
  `;
  document.body.appendChild(welcome);
  setTimeout(() => welcome.remove(), 2500);
});





// 换变量名，避免和上面的 btn 冲突
let toggleBtn = document.getElementById('toggleBtn');
let skills = document.getElementById('skills');
let isVisible = true;

// 加个保险，确保元素存在再绑定事件
if (toggleBtn && skills) {
  toggleBtn.addEventListener('click', function() {
    if (isVisible) {
      skills.style.display = 'none';
      toggleBtn.textContent = '显示技能区';
    } else {
      skills.style.display = 'block';
      toggleBtn.textContent = '隐藏技能区';
    }
    isVisible = !isVisible;
  });
}