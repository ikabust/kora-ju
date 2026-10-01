const DB_NAME="oshiScreenshotPrinter",DB_VERSION=4,STORE_NAME="images";
const A4_WIDTH=210,A4_HEIGHT=297;
const fileInput=document.getElementById("fileInput"),preview=document.getElementById("preview");
const info=document.getElementById("info"),saveStatus=document.getElementById("saveStatus");
const pdfButton=document.getElementById("pdfButton"),deleteModeButton=document.getElementById("deleteModeButton");
const clearButton=document.getElementById("clearButton"),widthInput=document.getElementById("widthInput");
const gapInput=document.getElementById("gapInput"),marginInput=document.getElementById("marginInput");
const deleteModeMessage=document.getElementById("deleteModeMessage");
let db=null,images=[],deleteMode=false;

function openDatabase(){return new Promise((resolve,reject)=>{
 const r=indexedDB.open(DB_NAME,DB_VERSION);
 r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains(STORE_NAME))d.createObjectStore(STORE_NAME,{keyPath:"id",autoIncrement:true})};
 r.onsuccess=e=>{db=e.target.result;resolve(db)};r.onerror=e=>reject(e.target.error)
})}

function getAllImages(){return new Promise((resolve,reject)=>{
 const r=db.transaction(STORE_NAME,"readonly").objectStore(STORE_NAME).getAll();
 r.onsuccess=()=>{const a=r.result||[];a.sort((x,y)=>(typeof x.order==="number"?x.order:x.id)-(typeof y.order==="number"?y.order:y.id));resolve(a)};
 r.onerror=e=>reject(e.target.error)
})}

function getImageRatio(blob){return new Promise((resolve,reject)=>{
 const u=URL.createObjectURL(blob),im=new Image();
 im.onload=()=>{const r=im.naturalWidth/im.naturalHeight;URL.revokeObjectURL(u);resolve(r)};
 im.onerror=()=>{URL.revokeObjectURL(u);reject(new Error("画像を読み込めませんでした"))};im.src=u
})}

async function saveImage(blob,name){
 const ratio=await getImageRatio(blob);
 /* 横長→90°右回転、縦長→0° */
 const rotation=ratio>1?90:0;
 return new Promise((resolve,reject)=>{
  const s=db.transaction(STORE_NAME,"readwrite").objectStore(STORE_NAME);
  const r=s.add({blob,name,created:Date.now(),order:Date.now()+Math.random(),rotation});
  r.onsuccess=()=>resolve(r.result);r.onerror=e=>reject(e.target.error)
 })
}
function putImage(image){return new Promise((resolve,reject)=>{const t=db.transaction(STORE_NAME,"readwrite");t.objectStore(STORE_NAME).put(image);t.oncomplete=resolve;t.onerror=e=>reject(e.target.error)})}
function deleteImage(id){return new Promise((resolve,reject)=>{const t=db.transaction(STORE_NAME,"readwrite");const r=t.objectStore(STORE_NAME).delete(id);r.onsuccess=resolve;r.onerror=e=>reject(e.target.error)})}
function clearDatabase(){return new Promise((resolve,reject)=>{const t=db.transaction(STORE_NAME,"readwrite");const r=t.objectStore(STORE_NAME).clear();r.onsuccess=resolve;r.onerror=e=>reject(e.target.error)})}
function saveOrder(){return new Promise((resolve,reject)=>{const t=db.transaction(STORE_NAME,"readwrite"),s=t.objectStore(STORE_NAME);images.forEach((im,i)=>{im.order=i;s.put(im)});t.oncomplete=resolve;t.onerror=e=>reject(e.target.error)})}

function fitPagesToScreen(){
 const wraps=preview.querySelectorAll(".page-wrap");if(!wraps.length)return;
 const available=Math.max(1,preview.clientWidth-40);
 wraps.forEach(w=>{
  const p=w.querySelector(".page");if(!p)return;
  p.style.transform="scale(1)";
  const pw=p.offsetWidth,ph=p.offsetHeight;
  const scale=Math.min(1,available/pw);
  p.style.transform=`scale(${scale})`;
  w.style.width=`${pw*scale}px`;w.style.height=`${ph*scale}px`;
 })
}

/* 画像の縦横比を一度だけ取得してキャッシュ */
async function prepareRatios(){
 const jobs=images.map(async im=>{
  if(!im._ratio)im._ratio=await getImageRatio(im.blob);
  return im;
 });
 await Promise.all(jobs);
}

async function buildLayout(){
 if(!images.length){
  preview.innerHTML='<div class="empty">📷 画像を追加すると、ここにA4レイアウトが表示されます</div>';
  info.textContent="";return
 }
 await prepareRatios();

 const width=Math.max(1,parseFloat(widthInput.value)||4.5)*10;
 const gap=Math.max(0,parseFloat(gapInput.value)||0.3)*10;
 const margin=Math.max(0,parseFloat(marginInput.value)||0.5)*10;
 const usableW=A4_WIDTH-margin*2,usableH=A4_HEIGHT-margin*2;
 const pages=[];let pageItems=[],x=margin,y=margin;

 for(const im of images){
  const ratio=(im.rotation===90||im.rotation===270)?1/im._ratio:im._ratio;
  let w=width,h=w/ratio;

  /* 左列から下へ。下まで来たら次の列 */
  if(y>margin&&y+h> A4_HEIGHT-margin){x+=width+gap;y=margin}

  /* 右端まで来たら次のA4 */
  if(x+w>A4_WIDTH-margin){
   pages.push(pageItems);pageItems=[];x=margin;y=margin;
  }

  /* 高さがA4に収まらない場合だけ個別縮小 */
  if(h>usableH){h=usableH;w=h*ratio}

  pageItems.push({image:im,left:x,top:y,width:w,height:h});
  y+=h+gap;
 }
 if(pageItems.length)pages.push(pageItems);

 renderPages(pages);
}

function renderPages(pages){
 preview.innerHTML="";
 pages.forEach(items=>{
  const wrap=document.createElement("div");wrap.className="page-wrap";
  const page=document.createElement("div");page.className="page";

  items.forEach(d=>{
   const im=d.image,item=document.createElement("div");
   item.className="item";item.draggable=!deleteMode;
   item.style.left=`${d.left}mm`;item.style.top=`${d.top}mm`;
   item.style.width=`${d.width}mm`;item.style.height=`${d.height}mm`;

   const img=document.createElement("img"),url=URL.createObjectURL(im.blob);
   img.src=url;img.alt=im.name||"画像";
const rotated=(im.rotation||0)%180!==0;

    img.style.width=
    `${rotated ? d.height : d.width}mm`;

    img.style.height=
    `${rotated ? d.width : d.height}mm`;

    img.style.position="absolute";
    img.style.left="50%";
    img.style.top="50%";

    img.style.transformOrigin="center";

    img.style.transform=
    `translate(-50%,-50%) rotate(${im.rotation||0}deg)`;


   const rb=document.createElement("button");rb.className="rotate-button";rb.type="button";rb.textContent="↻";
   rb.title=`回転：${im.rotation||0}°`;
   rb.onclick=async e=>{
    e.preventDefault();e.stopPropagation();if(deleteMode)return;
    im.rotation=im.rotation===90?0:90;
    try{await putImage(im);saveStatus.textContent="✓ 回転を保存しました";await buildLayout()}catch(err){console.error(err);saveStatus.textContent="⚠ 回転の保存に失敗しました"}
   };

   if(deleteMode){const x=document.createElement("div");x.className="delete-mark";x.textContent="×";item.appendChild(x)}
   item.onclick=async e=>{
    if(e.target===rb||!deleteMode)return;
    try{await deleteImage(im.id);images=images.filter(x=>x.id!==im.id);await saveOrder();saveStatus.textContent="✓ 画像を削除しました";await buildLayout()}
    catch(err){console.error(err);saveStatus.textContent="⚠ 削除に失敗しました"}
   };

   item.appendChild(img);item.appendChild(rb);setupDrag(item,im);page.appendChild(item);
  });
  wrap.appendChild(page);preview.appendChild(wrap);
 });
 fitPagesToScreen();
 info.textContent=`${images.length}枚 / A4 ${pages.length}ページ`;
}

function setupDrag(item,target){
 item.ondragstart=e=>{if(deleteMode){e.preventDefault();return}e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(target.id))};
 item.ondragover=e=>{if(deleteMode)return;e.preventDefault();item.classList.add("drag-over")};
 item.ondragleave=()=>item.classList.remove("drag-over");
 item.ondrop=async e=>{
  if(deleteMode)return;e.preventDefault();item.classList.remove("drag-over");
  const id=Number(e.dataTransfer.getData("text/plain"));if(!id||id===target.id)return;
  const from=images.findIndex(x=>x.id===id),to=images.findIndex(x=>x.id===target.id);
  if(from<0||to<0)return;
  const [m]=images.splice(from,1);images.splice(to,0,m);
  await saveOrder();saveStatus.textContent="✓ 並び順を保存しました";await buildLayout();
 }
}

fileInput.onchange=async e=>{
 const files=Array.from(e.target.files||[]).filter(f=>f.type.startsWith("image/"));if(!files.length)return;
 saveStatus.textContent=`画像を保存しています… 0 / ${files.length}`;
 try{
  /* まとめて順番に保存し、途中で画面再描画しない */
  for(let i=0;i<files.length;i++){await saveImage(files[i],files[i].name);saveStatus.textContent=`画像を保存しています… ${i+1} / ${files.length}`}
  fileInput.value="";images=await getAllImages();saveStatus.textContent=`✓ ${files.length}枚追加しました`;await buildLayout();
 }catch(err){console.error(err);saveStatus.textContent="⚠ 画像の保存に失敗しました"}
};

deleteModeButton.onclick=async()=>{
 deleteMode=!deleteMode;document.body.classList.toggle("delete-mode",deleteMode);
 deleteModeButton.classList.toggle("active",deleteMode);
 deleteModeButton.textContent=deleteMode?"🗑️ 削除モード終了":"🗑️ 削除モード";
 deleteModeMessage.classList.toggle("show",deleteMode);await buildLayout();
};

clearButton.onclick=async()=>{
 if(!images.length)return;
 if(prompt('全部削除する場合は「削除」と入力してください')!=="削除")return;
 try{await clearDatabase();images=[];saveStatus.textContent="✓ すべて削除しました";await buildLayout()}catch(err){console.error(err);saveStatus.textContent="⚠ 削除に失敗しました"}
};

[widthInput,gapInput,marginInput].forEach(el=>el.addEventListener("change",()=>buildLayout()));

pdfButton.onclick=async()=>{
 if(!images.length){alert("まず画像を追加してください");return}
 if(deleteMode){deleteMode=false;document.body.classList.remove("delete-mode");deleteModeButton.classList.remove("active");deleteModeButton.textContent="🗑️ 削除モード";deleteModeMessage.classList.remove("show")}
 await buildLayout();setTimeout(()=>window.print(),300);
};

window.addEventListener("resize",fitPagesToScreen);

(async()=>{
 try{await openDatabase();images=await getAllImages();images.forEach(im=>{if(typeof im.rotation!=="number")im.rotation=0});await buildLayout()}
 catch(err){console.error(err);info.textContent="データベースを開けませんでした。"}
})();