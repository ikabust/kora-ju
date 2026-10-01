const A4_WIDTH=210,A4_HEIGHT=297;

const fileInput=document.getElementById("fileInput");
const preview=document.getElementById("preview");
const info=document.getElementById("info");
const saveStatus=document.getElementById("saveStatus");
const pdfButton=document.getElementById("pdfButton");
const deleteModeButton=document.getElementById("deleteModeButton");
const clearButton=document.getElementById("clearButton");
const widthInput=document.getElementById("widthInput");
const gapInput=document.getElementById("gapInput");
const marginInput=document.getElementById("marginInput");
const deleteModeMessage=document.getElementById("deleteModeMessage");

let images=[];
let deleteMode=false;
let replaceTarget=null;
let longPressTimer=null;
let longPressTriggered=false;

const replaceFileInput=document.createElement("input");
replaceFileInput.type="file";
replaceFileInput.accept="image/*";
replaceFileInput.style.display="none";
document.body.appendChild(replaceFileInput);

function getImageRatio(blob){
  return new Promise((resolve,reject)=>{
    const u=URL.createObjectURL(blob);
    const im=new Image();

    im.onload=()=>{
      const ratio=im.naturalWidth/im.naturalHeight;
      URL.revokeObjectURL(u);
      resolve(ratio);
    };

    im.onerror=()=>{
      URL.revokeObjectURL(u);
      reject(new Error("画像を読み込めませんでした"));
    };

    im.src=u;
  });
}

function fitPagesToScreen(){
  const wraps=preview.querySelectorAll(".page-wrap");
  if(!wraps.length)return;

  const available=Math.max(1,preview.clientWidth-40);

  wraps.forEach(wrap=>{
    const page=wrap.querySelector(".page");
    if(!page)return;

    page.style.transform="none";

    const pageWidth=page.offsetWidth;
    const pageHeight=page.offsetHeight;
    const scale=Math.min(1,available/pageWidth);

    page.style.transform=`scale(${scale})`;
    wrap.style.width=`${pageWidth*scale}px`;
    wrap.style.height=`${pageHeight*scale}px`;
  });
}

async function prepareRatios(){
  const jobs=images.map(async image=>{
    if(!image._ratio){
      image._ratio=await getImageRatio(image.blob);
    }
  });

  await Promise.all(jobs);
}

async function buildLayout(){
  if(!images.length){
    preview.innerHTML=
      '<div class="empty">📷 画像を追加すると、ここにA4レイアウトが表示されます</div>';
    info.textContent="";
    return;
  }

  await prepareRatios();

  // 入力値はcm。内部ではmmで計算。
  // 指定値は「回転後の短辺」。
  const shortSide=Math.max(1,parseFloat(widthInput.value)||4.5)*10;
  const gap=Math.max(0,parseFloat(gapInput.value)||0.3)*10;
  const margin=Math.max(0,parseFloat(marginInput.value)||0.5)*10;

  const usableH=A4_HEIGHT-margin*2;

  const pages=[];
  let pageItems=[];
  let x=margin;
  let y=margin;
  let currentColumnWidth=0;

  for(const image of images){
    const rotated=image.rotation===90||image.rotation===270;

    let width=shortSide;
    let height=rotated
      ? shortSide*image._ratio
      : shortSide/image._ratio;

    // 1枚でA4の高さを超える場合だけ縮小。
    if(height>usableH){
      const scale=usableH/height;
      width*=scale;
      height*=scale;
    }

    // 現在の列に入らなければ次の列へ。
    if(y>margin && y+height>A4_HEIGHT-margin){
      x+=currentColumnWidth+gap;
      y=margin;
      currentColumnWidth=0;
    }

    // A4の右端に入らなければ新しいページ。
    if(x+width>A4_WIDTH-margin){
      if(pageItems.length)pages.push(pageItems);

      pageItems=[];
      x=margin;
      y=margin;
      currentColumnWidth=0;
    }

    pageItems.push({
      image,
      left:x,
      top:y,
      width,
      height
    });

    y+=height+gap;
    currentColumnWidth=Math.max(currentColumnWidth,width);
  }

  if(pageItems.length)pages.push(pageItems);

  renderPages(pages);
}

function renderPages(pages){
  preview.innerHTML="";

  pages.forEach(items=>{
    const wrap=document.createElement("div");
    wrap.className="page-wrap";

    const page=document.createElement("div");
    page.className="page";

    items.forEach(data=>{
      const image=data.image;

      const item=document.createElement("div");
      item.className="item";
      item.draggable=!deleteMode;

      item.style.left=`${data.left}mm`;
      item.style.top=`${data.top}mm`;
      item.style.width=`${data.width}mm`;
      item.style.height=`${data.height}mm`;

      // itemは「回転後」の最終サイズ。
      // image-frameだけを回転させることで、
      // スマホでも画像そのもののサイズが崩れにくい構造にする。
      const frame=document.createElement("div");
      frame.className="image-frame";

      const rotated=image.rotation===90||image.rotation===270;

      frame.style.width=`${rotated?data.height:data.width}mm`;
      frame.style.height=`${rotated?data.width:data.height}mm`;
      frame.style.left="50%";
      frame.style.top="50%";
      frame.style.transform=
        `translate(-50%,-50%) rotate(${image.rotation||0}deg)`;

      const img=document.createElement("img");
      const url=URL.createObjectURL(image.blob);

      img.src=url;
      img.alt=image.name||"画像";

      img.onload=()=>{
        URL.revokeObjectURL(url);
      };

      img.onerror=()=>{
        URL.revokeObjectURL(url);
      };

      frame.appendChild(img);
      item.appendChild(frame);

      const rotateButton=document.createElement("button");
      rotateButton.className="rotate-button";
      rotateButton.type="button";
      rotateButton.textContent="↻";
      rotateButton.title=`回転：${image.rotation||0}°`;

      rotateButton.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();

        if(deleteMode)return;

        image.rotation=image.rotation===90?0:90;
        saveStatus.textContent="✓ 回転しました";
        buildLayout();
      };

      item.appendChild(rotateButton);

      if(deleteMode){
        const deleteMark=document.createElement("div");
        deleteMark.className="delete-mark";
        deleteMark.textContent="×";
        item.appendChild(deleteMark);
      }

      item.onclick=e=>{
        if(longPressTriggered){
          longPressTriggered=false;
          return;
        }

        if(e.target===rotateButton||!deleteMode)return;

        const index=images.findIndex(x=>x===image);
        if(index>=0){
          images.splice(index,1);
          saveStatus.textContent="✓ 画像を削除しました";
          buildLayout();
        }
      };

      setupDrag(item,image);
      page.appendChild(item);
    });

    wrap.appendChild(page);
    preview.appendChild(wrap);
  });

  fitPagesToScreen();
  info.textContent=`${images.length}枚 / A4 ${pages.length}ページ`;
}

async function replaceImage(target,file){
  try{
    const ratio=await getImageRatio(file);

    target.blob=file;
    target.name=file.name;
    target._ratio=ratio;

    // 新しい画像の向きに合わせて初期回転も設定。
    target.rotation=ratio>1?90:0;

    saveStatus.textContent="✓ 画像を入れ替えました";
    await buildLayout();
  }catch(err){
    console.error(err);
    saveStatus.textContent="⚠ 画像の入れ替えに失敗しました";
  }
}

replaceFileInput.onchange=async()=>{
  const file=replaceFileInput.files?.[0];

  if(!file||!replaceTarget){
    replaceFileInput.value="";
    replaceTarget=null;
    return;
  }

  const target=replaceTarget;
  replaceTarget=null;
  replaceFileInput.value="";

  await replaceImage(target,file);
};

function setupDrag(item,target){
  // スマホ：長押しで、その場所の画像だけ入れ替える。
  const startLongPress=()=>{
    if(deleteMode)return;

    longPressTriggered=false;

    clearTimeout(longPressTimer);
    longPressTimer=setTimeout(()=>{
      longPressTriggered=true;
      replaceTarget=target;
      saveStatus.textContent="入れ替える画像を選択してください";
      replaceFileInput.click();
    },600);
  };

  const cancelLongPress=()=>{
    clearTimeout(longPressTimer);
  };

  item.addEventListener("touchstart",startLongPress,{passive:true});
  item.addEventListener("touchend",cancelLongPress,{passive:true});
  item.addEventListener("touchmove",cancelLongPress,{passive:true});
  item.addEventListener("touchcancel",cancelLongPress,{passive:true});

  // PCでも右クリックではなく長押し相当の操作をしやすくするため、
  // マウス長押しにも対応。
  item.addEventListener("mousedown",e=>{
    if(e.button!==0||deleteMode)return;
    startLongPress();
  });

  item.addEventListener("mouseup",cancelLongPress);
  item.addEventListener("mouseleave",cancelLongPress);

  item.ondragstart=e=>{
    if(deleteMode){
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed="move";
    e.dataTransfer.setData("text/plain",String(images.indexOf(target)));
  };

  item.ondragover=e=>{
    if(deleteMode)return;

    e.preventDefault();
    item.classList.add("drag-over");
  };

  item.ondragleave=()=>{
    item.classList.remove("drag-over");
  };

  item.ondrop=e=>{
    if(deleteMode)return;

    e.preventDefault();
    item.classList.remove("drag-over");

    const from=Number(e.dataTransfer.getData("text/plain"));
    const to=images.indexOf(target);

    if(from<0||to<0||from===to)return;

    const [moved]=images.splice(from,1);
    images.splice(to,0,moved);

    saveStatus.textContent="✓ 並び順を変更しました";
    buildLayout();
  };
}

fileInput.onchange=async e=>{
  const files=Array.from(e.target.files||[])
    .filter(file=>file.type.startsWith("image/"));

  if(!files.length)return;

  saveStatus.textContent=`画像を読み込んでいます… 0 / ${files.length}`;

  try{
    const newImages=[];

    for(let i=0;i<files.length;i++){
      const file=files[i];
      const ratio=await getImageRatio(file);

      newImages.push({
        blob:file,
        name:file.name,
        rotation:ratio>1?90:0,
        _ratio:ratio
      });

      saveStatus.textContent=
        `画像を読み込んでいます… ${i+1} / ${files.length}`;
    }

    // 今回選択した画像を既存画像の後ろへ追加。
    images.push(...newImages);

    fileInput.value="";
    saveStatus.textContent=`✓ ${files.length}枚追加しました`;

    await buildLayout();

  }catch(err){
    console.error(err);
    saveStatus.textContent="⚠ 画像の読み込みに失敗しました";
  }
};

deleteModeButton.onclick=()=>{
  deleteMode=!deleteMode;

  document.body.classList.toggle("delete-mode",deleteMode);
  deleteModeButton.classList.toggle("active",deleteMode);

  deleteModeButton.textContent=
    deleteMode?"🗑️ 削除モード終了":"🗑️ 削除モード";

  deleteModeMessage.classList.toggle("show",deleteMode);

  buildLayout();
};

clearButton.onclick=()=>{
  if(!images.length)return;

  if(
    prompt('全部削除する場合は「削除」と入力してください')!=="削除"
  )return;

  images=[];
  saveStatus.textContent="✓ すべて削除しました";
  buildLayout();
};

[widthInput,gapInput,marginInput].forEach(input=>{
  input.addEventListener("change",buildLayout);
});

// 設定値だけlocalStorageへ保存。
// 画像そのものは一切保存しない。
const SETTINGS_KEY="oshiScreenshotPrinterSettings";

function loadSettings(){
  try{
    const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null");

    if(!saved)return;

    if(Number.isFinite(saved.width)){
      widthInput.value=saved.width;
    }

    if(Number.isFinite(saved.gap)){
      gapInput.value=saved.gap;
    }

    if(Number.isFinite(saved.margin)){
      marginInput.value=saved.margin;
    }
  }catch(err){
    console.warn("設定の読み込みに失敗しました",err);
  }
}

function saveSettings(){
  try{
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        width:parseFloat(widthInput.value)||4.5,
        gap:parseFloat(gapInput.value)||0.3,
        margin:parseFloat(marginInput.value)||0.5
      })
    );
  }catch(err){
    console.warn("設定の保存に失敗しました",err);
  }
}

[widthInput,gapInput,marginInput].forEach(input=>{
  input.addEventListener("change",saveSettings);
});

pdfButton.onclick=async()=>{
  if(!images.length){
    alert("まず画像を追加してください");
    return;
  }

  if(deleteMode){
    deleteMode=false;
    document.body.classList.remove("delete-mode");
    deleteModeButton.classList.remove("active");
    deleteModeButton.textContent="🗑️ 削除モード";
    deleteModeMessage.classList.remove("show");
  }

  await buildLayout();
  setTimeout(()=>window.print(),300);
};

window.addEventListener("resize",fitPagesToScreen);

loadSettings();

(async()=>{
  try{
    await buildLayout();
  }catch(err){
    console.error(err);
    info.textContent="画像を表示できませんでした。";
  }
})();
