const html = document.documentElement.outerHTML;
const codeViewerDiv = document.createElement('div');
codeViewerDiv.style.cssText = `overflow-x: hidden;
overflow-y: scroll;
width: 100vw;
height: 200px;
position: fixed;
bottom: 0;
left: 0;
z-index: 998;
background: white;`;
codeViewerDiv.innerText = html;
const codeViewCloserBtn = document.createElement('button');
codeViewCloserBtn.innerHTML = "close";
codeViewCloserBtn.style.cssText = `position: fixed;
bottom: 0;
right: 0;
z-index: 999;`;

document.body.appendChild(codeViewerDiv);
document.body.appendChild(codeViewCloserBtn);

codeViewCloserBtn.addEventListener('click', () => {
  document.body.removeChild(codeViewerDiv);
  document.body.removeChild(codeViewCloserBtn);
}, {once: true});
