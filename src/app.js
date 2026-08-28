const $=id=>document.getElementById(id);let state={img:null,canvas:null,data:null,cancel:false,worker:null};const pages=['home','scan','result','diag'];function show(p){pages.forEach(x=>$(x).classList.toggle('active',x===p));scrollTo(0,0)}function phase(n,s){for(let i=1;i<=5;i++){const e=$('p'+i);e.classList.remove('done','current');e.querySelector('b').textContent=i<n?'✓':i===n?'…':'…';if(i<n)e.classList.add('done');if(i===n)e.classList.add('current')}}function setP(v,t,d,n){$('bar').style.width=v+'%';$('percent').textContent=Math.round(v)+'%';$('phase').textContent=t;$('stage').textContent=t;$('detail').textContent=d;phase(n)}function fail(m){$('errorText').textContent=m;$('error').classList.remove('hidden');show('home')}function reset(){state.cancel=true;if(state.worker){state.worker.terminate().catch(()=>{});state.worker=null}$('error').classList.add('hidden');show('home')}async function preprocess(im){const max=1800,s=Math.min(1,max/im.naturalWidth),c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*s);c.height=Math.round(im.naturalHeight*s);const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0,c.width,c.height);const d=x.getImageData(0,0,c.width,c.height);for(let i=0;i<d.data.length;i+=4){const y=.299*d.data[i]+.587*d.data[i+1]+.114*d.data[i+2],v=Math.max(0,Math.min(255,(y-128)*1.25+128));d.data[i]=d.data[i+1]=d.data[i+2]=v}x.putImageData(d,0,0);return c}async function checkUrl(url){
  try{const r=await fetch(url,{cache:'no-store'});return {ok:r.ok,status:r.status,contentType:r.headers.get('content-type')||''}}
  catch(e){return {ok:false,status:0,contentType:'',error:e.message}}
}
async function bootOCR(){
  const base=new URL('./ocr/',location.href);
  const checks=[
    ['Tesseract API','./ocr/tesseract.min.js'],
    ['Worker','./ocr/worker.min.js'],
    ['Core WASM JS','./ocr/core/tesseract-core.wasm.js'],
    ['Core SIMD','./ocr/core/tesseract-core-simd.wasm.js'],
    ['Core LSTM','./ocr/core/tesseract-core-lstm.wasm.js'],
    ['Core SIMD LSTM','./ocr/core/tesseract-core-simd-lstm.wasm.js'],
    ['Català','./ocr/lang/cat.traineddata.gz'],
    ['Castellà','./ocr/lang/spa.traineddata.gz'],
    ['Anglès','./ocr/lang/eng.traineddata.gz']
  ];
  const results=[];
  for(const [name,path] of checks){const r=await checkUrl(new URL(path,location.href));results.push({name,path,...r})}
  window.__ocrDiagnostics=results;
  const jsOK=!!window.Tesseract && !window.__ocrScriptError;
  const localCore=results.slice(1,6).every(x=>x.ok);
  const langs=results.slice(6).some(x=>x.ok);
  if(jsOK && localCore && langs){$('engine').textContent='● Motor OCR local disponible';$('engine').style.color='#23794e';return true}
  $('engine').textContent='● Motor OCR local incomplet';$('engine').style.color='#a15c00';return false;
}
function reportOCR(){
  const r=window.__ocrDiagnostics||[];
  const lines=[`URL: ${location.href}`,`Tesseract API: ${window.Tesseract?'OK':'NO'}`,`Script error: ${window.__ocrScriptError?'SÍ':'NO'}`];
  r.forEach(x=>lines.push(`${x.name}: ${x.ok?'OK':'ERROR'} (${x.status||'-'}) ${x.path}`));
  return lines.join('\n');
}
async function scan(file){
  if(!file)return;
  state.cancel=false;
  const url=URL.createObjectURL(file);
  state.img=new Image();
  state.img.onload=async()=>{
    URL.revokeObjectURL(url);
    $('scanImage').src=state.img.src;$('resultImage').src=state.img.src;$('diagImg').src=state.img.src;
    show('scan');
    try{
      setP(8,'Carregant fotografia…','La fotografia s’ha obert correctament.',1);
      await new Promise(r=>setTimeout(r,120)); if(state.cancel)return;
      setP(22,'Preprocessant…','Millorant contrast i llegibilitat.',2);
      state.canvas=await preprocess(state.img); if(state.cancel)return;

      setP(35,'Comprovant motor OCR…','Verificant els recursos locals.',3);
      const ready=await bootOCR();
      if(!ready) throw Error('El motor OCR local no està complet. Obre “Diagnòstic del motor” a la pantalla inicial.');

      setP(48,'Iniciant motor OCR…','Creant el worker local.',3);
      state.worker=await Tesseract.createWorker('spa+eng+fra+ita+por+cat',1,{
        workerPath:new URL('./ocr/worker.min.js',location.href).href,
        corePath:new URL('./ocr/core',location.href).href,
        langPath:new URL('./ocr/lang',location.href).href,
        logger:m=>{
          if(m.status==='loading tesseract core') setP(48+(m.progress||0)*10,'Carregant motor OCR…','Carregant WebAssembly local.',3);
          else if(m.status==='loading language traineddata') setP(58+(m.progress||0)*10,'Carregant idiomes…','Carregant models locals.',3);
          else if(m.status==='recognizing text') setP(68+(m.progress||0)*29,'Llegint text…','Detectant paraules, línies i coordenades.',4);
        }
      });
      if(state.cancel)return;
      const r=await state.worker.recognize(state.canvas);
      state.data=r.data;
      await state.worker.terminate(); state.worker=null;
      if(state.cancel)return;
      setP(98,'Preparant resultat…','Organitzant la lectura OCR.',5);
      render(); setP(100,'Lectura completada','Resultat preparat.',5); phase(6);
      setTimeout(()=>show('result'),180);
    }catch(e){console.error(e);fail(e.message||'Error desconegut')}
  };
  state.img.onerror=()=>fail('No s’ha pogut obrir la fotografia.');
  state.img.src=url;
}
function render(){const d=state.data,w=(d.words||[]).filter(x=>x.text.trim()),l=(d.lines||[]).filter(x=>x.text.trim()),avg=w.length?w.reduce((a,x)=>a+(+x.confidence||0),0)/w.length:0;$('lines').textContent=l.length;$('words').textContent=w.length;$('conf').textContent=Math.round(avg)+'%';$('summary').textContent=`${l.length} línies · ${w.length} blocs · ${Math.round(avg)}% confiança`;$('text').innerHTML='';l.forEach(x=>{const e=document.createElement('div');e.className='ocr-line';e.innerHTML='<span></span><small></small>';e.firstChild.textContent=x.text;e.lastChild.textContent=Math.round(x.confidence||0)+'%';$('text').appendChild(e)});$('raw').textContent=d.text||'';const p=$('processed');p.width=state.canvas.width;p.height=state.canvas.height;p.getContext('2d').drawImage(state.canvas,0,0);const b=$('boxes');b.width=state.canvas.width;b.height=state.canvas.height;const c=b.getContext('2d');c.drawImage(state.canvas,0,0);w.forEach(x=>{const q=x.bbox;c.strokeRect(q.x0,q.y0,q.x1-q.x0,q.y1-q.y0)});$('blocks').innerHTML='';w.forEach((x,i)=>{const q=x.bbox,e=document.createElement('div');e.className='block';e.textContent=`#${i+1} · ${x.text} · ${Math.round(x.confidence||0)}% · x=${q.x0}, y=${q.y0}, w=${q.x1-q.x0}, h=${q.y1-q.y0}`;$('blocks').appendChild(e)})}$('camera').onchange=e=>scan(e.target.files[0]);$('file').onchange=e=>scan(e.target.files[0]);$('cancel').onclick=reset;$('cancel2').onclick=reset;$('again').onclick=reset;$('diagnostic').onclick=()=>show('diag');$('diagBack').onclick=()=>show('result');$('retry').onclick=reset;window.addEventListener('load',async()=>{
  const ok=await bootOCR();
  $('engineDiag').onclick=()=>{$('engineReport').textContent=reportOCR();$('engineModal').classList.remove('hidden')};
  $('closeEngine').onclick=()=>$('engineModal').classList.add('hidden');
});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});