const DB_NAME="oshiScreenshotPrinter";
const DB_VERSION=4;
const STORE_NAME="images";

const A4_WIDTH=210;
const A4_HEIGHT=297;

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

let db=null;
let images=[];
let deleteMode=false;


/* =========================
   IndexedDB
========================= */

function openDatabase(){
 return new Promise((resolve,reject)=>{

  const r=indexedDB.open(
   DB_NAME,
   DB_VERSION
  );

  r.onupgradeneeded=e=>{

   const d=e.target.result;

   if(!d.objectStoreNames.contains(STORE_NAME)){

    d.createObjectStore(
     STORE_NAME,
     {
      keyPath:"id",
      autoIncrement:true
     }
    );

   }

  };

  r.onsuccess=e=>{
   db=e.target.result;
   resolve(db);
  };

  r.onerror=e=>{
   reject(e.target.error);
  };

 });
}


function getAllImages(){

 return new Promise((resolve,reject)=>{

  const r=
   db
   .transaction(
    STORE_NAME,
    "readonly"
   )
   .objectStore(STORE_NAME)
   .getAll();

  r.onsuccess=()=>{

   const a=r.result||[];

   a.sort(
    (x,y)=>
     (
      typeof x.order==="number"
       ?x.order
       :x.id
     )
     -
     (
      typeof y.order==="number"
       ?y.order
       :y.id
     )
   );

   resolve(a);

  };

  r.onerror=e=>{
   reject(e.target.error);
  };

 });

}


/* =========================
   画像比率
========================= */

function getImageRatio(blob){

 return new Promise((resolve,reject)=>{

  const url=
   URL.createObjectURL(blob);

  const img=
   new Image();

  img.onload=()=>{

   const ratio=
    img.naturalWidth/
    img.naturalHeight;

   URL.revokeObjectURL(url);

   resolve(ratio);

  };

  img.onerror=()=>{

   URL.revokeObjectURL(url);

   reject(
    new Error(
     "画像を読み込めませんでした"
    )
   );

  };

  img.src=url;

 });

}


/* =========================
   画像保存
========================= */

async function saveImage(blob,name){

 const ratio=
  await getImageRatio(blob);

 /*
   横長 → 90°
   縦長 → 0°
 */
 const rotation=
  ratio>1
   ?90
   :0;


 return new Promise(
  (resolve,reject)=>{

   const store=
    db
    .transaction(
     STORE_NAME,
     "readwrite"
    )
    .objectStore(
     STORE_NAME
    );


   const request=
    store.add({

     blob:blob,

     name:name,

     created:Date.now(),

     order:
      Date.now()+
      Math.random(),

     rotation:rotation

    });


   request.onsuccess=()=>{
    resolve(
     request.result
    );
   };

   request.onerror=e=>{
    reject(
     e.target.error
    );
   };

  }
 );

}


/* =========================
   画像更新
========================= */

function putImage(image){

 return new Promise(
  (resolve,reject)=>{

   const transaction=
    db.transaction(
     STORE_NAME,
     "readwrite"
    );

   transaction
    .objectStore(
     STORE_NAME
    )
    .put(image);

   transaction.oncomplete=
    resolve;

   transaction.onerror=e=>{
    reject(
     e.target.error
    );
   };

  }
 );

}


/* =========================
   画像削除
========================= */

function deleteImage(id){

 return new Promise(
  (resolve,reject)=>{

   const transaction=
    db.transaction(
     STORE_NAME,
     "readwrite"
    );

   const request=
    transaction
    .objectStore(
     STORE_NAME
    )
    .delete(id);

   request.onsuccess=
    resolve;

   request.onerror=e=>{
    reject(
     e.target.error
    );
   };

  }
 );

}


/* =========================
   全削除
========================= */

function clearDatabase(){

 return new Promise(
  (resolve,reject)=>{

   const transaction=
    db.transaction(
     STORE_NAME,
     "readwrite"
    );

   const request=
    transaction
    .objectStore(
     STORE_NAME
    )
    .clear();

   request.onsuccess=
    resolve;

   request.onerror=e=>{
    reject(
     e.target.error
    );
   };

  }
 );

}


/* =========================
   並び順保存
========================= */

function saveOrder(){

 return new Promise(
  (resolve,reject)=>{

   const transaction=
    db.transaction(
     STORE_NAME,
     "readwrite"
    );

   const store=
    transaction.objectStore(
     STORE_NAME
    );


   images.forEach(
    (image,index)=>{

     image.order=index;

     store.put(image);

    }
   );


   transaction.oncomplete=
    resolve;

   transaction.onerror=e=>{
    reject(
     e.target.error
    );
   };

  }
 );

}


/* =========================
   スマホ表示用縮小
========================= */

function fitPagesToScreen(){

 const wraps=
  preview.querySelectorAll(
   ".page-wrap"
  );


 if(!wraps.length){
  return;
 }


 const available=
  Math.max(
   1,
   preview.clientWidth-40
  );


 wraps.forEach(
  wrap=>{

   const page=
    wrap.querySelector(
     ".page"
    );


   if(!page){
    return;
   }


   page.style.transform=
    "scale(1)";


   const pageWidth=
    page.offsetWidth;

   const pageHeight=
    page.offsetHeight;


   const scale=
    Math.min(
     1,
     available/pageWidth
    );


   page.style.transform=
    `scale(${scale})`;


   wrap.style.width=
    `${pageWidth*scale}px`;

   wrap.style.height=
    `${pageHeight*scale}px`;

  }
 );

}


/* =========================
   比率準備
========================= */

async function prepareRatios(){

 const jobs=
  images.map(
   async image=>{

    if(!image._ratio){

     image._ratio=
      await getImageRatio(
       image.blob
      );

    }

    return image;

   }
  );


 await Promise.all(
  jobs
 );

}


/* =========================
   A4レイアウト
========================= */

async function buildLayout(){

 if(!images.length){

  preview.innerHTML=
   '<div class="empty">' +
   '📷 画像を追加すると、ここにA4レイアウトが表示されます' +
   '</div>';

  info.textContent="";

  return;
 }


 await prepareRatios();


 const width=
  Math.max(
   1,
   parseFloat(
    widthInput.value
   )||4.5
  )*10;


 const gap=
  Math.max(
   0,
   parseFloat(
    gapInput.value
   )||0.3
  )*10;


 const margin=
  Math.max(
   0,
   parseFloat(
    marginInput.value
   )||0.5
  )*10;


 const usableHeight=
  A4_HEIGHT-
  margin*2;


 const pages=[];

 let pageItems=[];

 let x=margin;
 let y=margin;


 for(
  const image of images
 ){

  /*
    ここでは「印刷用の枠」の
    横幅・高さだけを決める。

    元画像の比率は絶対に変更しない。
  */

  let boxWidth=width;

  let boxHeight=
   width/image._ratio;


  /*
    90°回転する場合は
    A4上で見える縦横を反転。
  */

  if(
   image.rotation===90 ||
   image.rotation===270
  ){

   const temp=boxWidth;

   boxWidth=boxHeight;
   boxHeight=temp;

  }


  /*
    下に入らなければ次の列
  */

  if(
   y>margin &&
   y+boxHeight>
    A4_HEIGHT-margin
  ){

   x+=
    width+
    gap;

   y=margin;

  }


  /*
    右端まで来たら次ページ
  */

  if(
   x+boxWidth>
    A4_WIDTH-margin
  ){

   if(pageItems.length){

    pages.push(
     pageItems
    );

   }


   pageItems=[];

   x=margin;
   y=margin;

  }


  /*
    A4に入りきらない場合
  */

  if(
   boxHeight>
    usableHeight
  ){

   const scale=
    usableHeight/
    boxHeight;

   boxHeight=
    usableHeight;

   boxWidth=
    boxWidth*
    scale;

  }


  pageItems.push({

   image:image,

   left:x,

   top:y,

   width:boxWidth,

   height:boxHeight

  });


  y+=
   boxHeight+
   gap;

 }


 if(pageItems.length){

  pages.push(
   pageItems
  );

 }


 renderPages(
  pages
 );

}


/* =========================
   A4ページ描画
========================= */

function renderPages(pages){

 preview.innerHTML="";


 pages.forEach(
  items=>{

   const wrap=
    document.createElement(
     "div"
    );

   wrap.className=
    "page-wrap";


   const page=
    document.createElement(
     "div"
    );

   page.className=
    "page";


   items.forEach(
    data=>{

     const image=
      data.image;


     /*
       =========================
       外側の枠
       =========================
     */

     const item=
      document.createElement(
       "div"
      );

     item.className=
      "item";


     item.draggable=
      !deleteMode;


     item.style.left=
      `${data.left}mm`;

     item.style.top=
      `${data.top}mm`;

     item.style.width=
      `${data.width}mm`;

     item.style.height=
      `${data.height}mm`;


     /*
       =========================
       画像
       =========================

       ここが今回の重要部分。

       img自体をwidth/heightで
       無理やり変形させない。

       「画像の元サイズ」を
       そのまま使い、
       CSSのscaleで枠に合わせる。
     */

     const img=
      document.createElement(
       "img"
      );


     const url=
      URL.createObjectURL(
       image.blob
      );


     img.src=url;

     img.alt=
      image.name||
      "画像";


     /*
       元画像の比率を維持
     */

     img.style.position=
      "absolute";

     img.style.left=
      "50%";

     img.style.top=
      "50%";


     img.style.width=
      "auto";

     img.style.height=
      "auto";


     img.style.maxWidth=
      "none";

     img.style.maxHeight=
      "none";


     img.style.transformOrigin=
      "center center";


     /*
       元画像を読み込んだ後、
       表示枠にぴったりになる
       scaleを計算する。
     */

     img.onload=()=>{

      const naturalWidth=
       img.naturalWidth;

      const naturalHeight=
       img.naturalHeight;


      if(
       !naturalWidth ||
       !naturalHeight
      ){
       return;
      }


      /*
        CSS上の画像サイズを
        A4のmm換算で作る。

        まず「90°回転前」の
        画像サイズを決める。
      */

      const rotated=
       image.rotation===90 ||
       image.rotation===270;


      let targetWidth=
       data.width;

      let targetHeight=
       data.height;


      /*
        回転する画像は
        回転前の縦横に戻す。
      */

      if(rotated){

       const temp=
        targetWidth;

       targetWidth=
        targetHeight;

       targetHeight=
        temp;

      }


      /*
        元画像の比率を使って
        「高さ基準」で表示。

        widthはautoなので
        ブラウザが元比率を維持する。
      */

      const naturalRatio=
       naturalWidth/
       naturalHeight;


      let displayHeight=
       targetHeight;

      let displayWidth=
       displayHeight*
       naturalRatio;


      /*
        幅が枠を超える場合は
        幅基準にする。
      */

      if(
       displayWidth>
        targetWidth
      ){

       displayWidth=
        targetWidth;

       displayHeight=
        displayWidth/
        naturalRatio;

      }


      img.style.width=
       `${displayWidth}mm`;

      img.style.height=
       `${displayHeight}mm`;


      img.style.transform=
       `translate(-50%,-50%) rotate(${image.rotation||0}deg)`;

     };


     /*
       =========================
       回転ボタン
       =========================
     */

     const rotateButton=
      document.createElement(
       "button"
      );


     rotateButton.className=
      "rotate-button";

     rotateButton.type=
      "button";

     rotateButton.textContent=
      "↻";

     rotateButton.title=
      `回転：${image.rotation||0}°`;


     rotateButton.onclick=
      async event=>{

       event.preventDefault();

       event.stopPropagation();


       if(deleteMode){
        return;
       }


       image.rotation=
        image.rotation===90
         ?0
         :90;


       try{

        await putImage(
         image
        );


        saveStatus.textContent=
         "✓ 回転を保存しました";


        await buildLayout();


       }catch(error){

        console.error(
         error
        );


        saveStatus.textContent=
         "⚠ 回転の保存に失敗しました";

       }

      };


     /*
       =========================
       削除モード
       =========================
     */

     if(deleteMode){

      const deleteMark=
       document.createElement(
        "div"
       );

      deleteMark.className=
       "delete-mark";

      deleteMark.textContent=
       "×";

      item.appendChild(
       deleteMark
      );

     }


     /*
       =========================
       削除
       =========================
     */

     item.onclick=
      async event=>{

       if(
        event.target===
         rotateButton ||
        !deleteMode
       ){

        return;

       }


       try{

        await deleteImage(
         image.id
        );


        images=
         images.filter(
          item=>
           item.id!==image.id
        );


        await saveOrder();


        saveStatus.textContent=
         "✓ 画像を削除しました";


        await buildLayout();


       }catch(error){

        console.error(
         error
        );


        saveStatus.textContent=
         "⚠ 削除に失敗しました";

       }

      };


     item.appendChild(
      img
     );

     item.appendChild(
      rotateButton
     );


     setupDrag(
      item,
      image
     );


     page.appendChild(
      item
     );

    }
   );


   wrap.appendChild(
    page
   );


   preview.appendChild(
    wrap
   );

  }
 );


 fitPagesToScreen();


 info.textContent=
  `${images.length}枚 / A4 ${pages.length}ページ`;

}


/* =========================
   並び替え
========================= */

function setupDrag(
 item,
 target
){

 item.ondragstart=
  event=>{

   if(deleteMode){

    event.preventDefault();

    return;

   }


   event.dataTransfer.effectAllowed=
    "move";


   event.dataTransfer.setData(
    "text/plain",
    String(
     target.id
    )
   );

  };


 item.ondragover=
  event=>{

   if(deleteMode){
    return;
   }


   event.preventDefault();


   item.classList.add(
    "drag-over"
   );

  };


 item.ondragleave=
  ()=>{
   item.classList.remove(
    "drag-over"
   );
  };


 item.ondrop=
  async event=>{

   if(deleteMode){
    return;
   }


   event.preventDefault();


   item.classList.remove(
    "drag-over"
   );


   const id=
    Number(
     event.dataTransfer.getData(
      "text/plain"
     )
    );


   if(
    !id ||
    id===target.id
   ){

    return;

   }


   const from=
    images.findIndex(
     image=>
      image.id===id
    );


   const to=
    images.findIndex(
     image=>
      image.id===target.id
    );


   if(
    from<0 ||
    to<0
   ){

    return;

   }


   const moved=
    images.splice(
     from,
     1
    )[0];


   images.splice(
    to,
    0,
    moved
   );


   await saveOrder();


   saveStatus.textContent=
    "✓ 並び順を保存しました";


   await buildLayout();

  };

}


/* =========================
   画像追加
========================= */

fileInput.onchange=
 async event=>{

  const files=
   Array.from(
    event.target.files||[]
   ).filter(
    file=>
     file.type.startsWith(
      "image/"
     )
   );


  if(!files.length){
   return;
  }


  saveStatus.textContent=
   `画像を保存しています… 0 / ${files.length}`;


  try{

   for(
    let i=0;
    i<files.length;
    i++
   ){

    await saveImage(
     files[i],
     files[i].name
    );


    saveStatus.textContent=
     `画像を保存しています… ${i+1} / ${files.length}`;

   }


   fileInput.value="";


   images=
    await getAllImages();


   saveStatus.textContent=
    `✓ ${files.length}枚追加しました`;


   await buildLayout();


  }catch(error){

   console.error(
    error
   );


   saveStatus.textContent=
    "⚠ 画像の保存に失敗しました";

  }

};


/* =========================
   削除モード
========================= */

deleteModeButton.onclick=
 async()=>{

  deleteMode=
   !deleteMode;


  document.body.classList.toggle(
   "delete-mode",
   deleteMode
  );


  deleteModeButton.classList.toggle(
   "active",
   deleteMode
  );


  deleteModeButton.textContent=
   deleteMode
    ?"🗑️ 削除モード終了"
    :"🗑️ 削除モード";


  deleteModeMessage.classList.toggle(
   "show",
   deleteMode
  );


  await buildLayout();

};


/* =========================
   全削除
========================= */

clearButton.onclick=
 async()=>{

  if(!images.length){
   return;
  }


  const answer=
   prompt(
    '全部削除する場合は「削除」と入力してください'
   );


  if(
   answer!=="削除"
  ){

   return;

  }


  try{

   await clearDatabase();


   images=[];


   saveStatus.textContent=
    "✓ すべて削除しました";


   await buildLayout();


  }catch(error){

   console.error(
    error
   );


   saveStatus.textContent=
    "⚠ 削除に失敗しました";

  }

};


/* =========================
   設定変更
========================= */

[
 widthInput,
 gapInput,
 marginInput
].forEach(
 element=>{

  element.addEventListener(
   "change",
   ()=>{
    buildLayout();
   }
  );

 }
);


/* =========================
   印刷
========================= */

pdfButton.onclick=
 async()=>{

  if(!images.length){

   alert(
    "まず画像を追加してください"
   );

   return;

  }


  if(deleteMode){

   deleteMode=false;


   document.body.classList.remove(
    "delete-mode"
   );


   deleteModeButton.classList.remove(
    "active"
   );


   deleteModeButton.textContent=
    "🗑️ 削除モード";


   deleteModeMessage.classList.remove(
    "show"
   );

  }


  await buildLayout();


  setTimeout(
   ()=>{
    window.print();
   },
   300
  );

};


/* =========================
   画面サイズ変更
========================= */

window.addEventListener(
 "resize",
 fitPagesToScreen
);


/* =========================
   起動
========================= */

(async()=>{

 try{

  await openDatabase();


  images=
   await getAllImages();


  images.forEach(
   image=>{

    if(
     typeof image.rotation!=="number"
    ){

     image.rotation=0;

    }

   }
  );


  await buildLayout();


 }catch(error){

  console.error(
   error
  );


  info.textContent=
   "データベースを開けませんでした。";

 }

})();