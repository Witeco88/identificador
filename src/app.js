const $=id=>document.getElementById(id);
const V={home:$("home"),processing:$("processing"),result:$("result"),diagnostic:$("diagnostic")};
let lastResult=null,lastLines=[],lastOCR=null;
const moneyRe=/(?:€\s*)?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:\s*[,.]\s*\d{2})(?:\s*€)?|(?:€\s*)\d+(?:\s*[,.]\s*\d{2})(?:\s*€)?|\b\d+\s*€\b/g;
const labels={
total:/\b(total|totaal|totale|grand\s+total|amount\s+due|importe\s+total|montant\s+total)\b/i,
subtotal:/\b(subtotal|sub\s*total|sous[- ]total)\b/i,
tax:/\b(iva|vat|tax|taxe|impuesto|impostos|btw|tva)\b/i,
service:/\b(service|servicio|servei|servizio|service\s+charge|servico)\b/i,
tip:/\b(tip|tips|propina|pourboire|mancia|gorjeta)\b/i,
discount:/\b(discount|descuento|descompte|remise|sconto|desconto)\b/i,
payment:/\b(visa|mastercard|cash|payment|card|tarjeta|kaart|pagament)\b/i,
footer:/\b(thank|gracias|gràcies|merci|grazie|obrigad|www\.|http)\b/i};
function show(x){Object.values(V).forEach(v=>v.classList.add("hidden"));x.classList.remove("hidden")}
function prog(p,t){$("pb").style.width=p+"%";$("pp").textContent=Math.round(p)+"%";$("pl").textContent=t}
function pm(s){let t=String(s).replace(/[€\s]/g,"");if(t.includes(",")&&t.includes(".")){t=t.lastIndexOf(",")>t.lastIndexOf(".")?t.replace(/\./g,"").replace(",","."):t.replace(/,/g,"")}else if(t.includes(","))t=t.replace(",",".");let n=Number(t);return Number.isFinite(n)?Math.round(n*100)/100:null}
function money(s){
  let raw=String(s).replace(/\s+/g," ");
  let m=[...raw.matchAll(moneyRe)].pop();
  if(m)return {value:pm(m[0]),raw:m[0]};
  // OCR sometimes separates the decimal comma/dot: "15 , 50" or "15. 50".
  let loose=raw.match(/(?:€\s*)?\d{1,4}\s*[,.]\s*\d{2}(?:\s*€)?/);
  return loose?{value:pm(loose[0]),raw:loose[0]}:null;
}
function totalLike(s){
  let raw=String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  let n=raw.replace(/0/g,"o").replace(/1/g,"i").replace(/[^a-z]/g,"");
  return labels.total.test(s)||/\btotaal\b/i.test(s)||["totao","totai","tota1","totai","tota"].some(x=>n.includes(x));
}
function type(s){if(totalLike(s))return"TOTAL";if(labels.subtotal.test(s))return"SUBTOTAL";if(labels.tax.test(s))return"TAX";if(labels.service.test(s))return"SERVICE";if(labels.tip.test(s))return"TIP";if(labels.discount.test(s))return"DISCOUNT";if(labels.payment.test(s))return"PAYMENT";if(labels.footer.test(s))return"FOOTER";return"UNKNOWN"}
function linesFromWords(words){
  let a=words.filter(w=>w.text?.trim()&&w.bbox).sort((x,y)=>x.bbox.y0-y.bbox.y0||x.bbox.x0-y.bbox.x0),g=[];
  for(const w of a){
    let cy=(w.bbox.y0+w.bbox.y1)/2,h=Math.max(1,w.bbox.y1-w.bbox.y0);
    // More tolerant vertical grouping: OCR boxes from the same printed row
    // can have slightly different heights/baselines.
    let z=g.find(q=>{
      let overlap=Math.min(w.bbox.y1,q.y1)-Math.max(w.bbox.y0,q.y0);
      return overlap>0 || Math.abs(cy-q.cy)<=Math.max(h,q.h)*.72;
    });
    if(!z){z={words:[],cy,h,y0:w.bbox.y0,y1:w.bbox.y1};g.push(z)}
    z.words.push(w);
    z.cy=z.words.reduce((sum,v)=>(sum+(v.bbox.y0+v.bbox.y1)/2),0)/z.words.length;
    z.h=Math.max(z.h,h);z.y0=Math.min(z.y0,w.bbox.y0);z.y1=Math.max(z.y1,w.bbox.y1);
  }
  let rows=g.sort((a,b)=>a.cy-b.cy).map((q,i)=>{
    q.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);
    let text=q.words.map(w=>w.text).join(" ").replace(/\s+/g," ").trim();
    let c=q.words.reduce((sum,w)=>sum+(Number(w.confidence)||0),0)/q.words.length/100;
    return{id:"line-"+(i+1),text,confidence:c,money:money(text),y:q.cy,words:q.words,y0:q.y0,y1:q.y1};
  });

  // Critical reconstruction: OCR may put the product name on one row and its
  // right-aligned price on the following row. Merge only when the next row is
  // essentially an amount, and is very close vertically.
  let merged=[];
  for(let i=0;i<rows.length;i++){
    let r=rows[i], next=rows[i+1];
    if(next && !r.money && next.money){
      let namePart=r.text.trim(), pricePart=next.text.trim();
      let priceOnly=money(pricePart) && pricePart.replace(/€|\d|[,.\s-]/g,"")==="";
      let gap=next.y0-r.y1;
      if(namePart && priceOnly && gap<=Math.max(r.h,next.y1-next.y0)*1.8){
        r={...r,text:`${namePart} ${pricePart}`,money:next.money,
           confidence:Math.min(r.confidence||.5,next.confidence||.5),
           y:(r.y+next.y)/2,y1:next.y1,words:[...r.words,...next.words]};
        merged.push(r);i++;continue;
      }
    }
    merged.push(r);
  }
  return merged.map((r,i)=>({...r,id:"line-"+(i+1)}));
}
function lineData(d){if(d.words?.length)return linesFromWords(d.words);if(d.lines?.length)return d.lines.map((l,i)=>({id:"line-"+(i+1),text:l.text.trim(),confidence:(l.confidence||0)/100,money:money(l.text),y:l.bbox?.y0||i,y0:l.bbox?.y0||i,y1:l.bbox?.y1||i+1,words:[]}));return String(d.text||"").split(/\n+/).map((text,i)=>({id:"line-"+(i+1),text:text.trim(),confidence:0,money:money(text),y:i})).filter(x=>x.text)}
function productName(s,m){let n=s.replace(m?.raw||"","").replace(/^[-–—•#]/,"").trim(),q=1,x=n.match(/^(\d+)\s*(?:x|×|\*)\s*/i);if(x){q=+x[1];n=n.slice(x[0].length).trim()}else{x=n.match(/^(\d+)\s+(?=[A-Za-zÀ-ÿ])/);if(x){q=+x[1];n=n.slice(x[0].length).trim()}}return{name:n||"Concepte sense nom",quantity:q}}
function parse(lines){
  // First identify an explicit total. If OCR split "Totaal" and its amount
  // into adjacent rows, combine them before applying the hard boundary.
  let normalized=[];
  for(let i=0;i<lines.length;i++){
    let l=lines[i], n=lines[i+1];
    if(n && totalLike(l.text) && !l.money && n.money){
      normalized.push({...l,text:`${l.text} ${n.text}`,money:n.money,
        confidence:Math.min(l.confidence||.5,n.confidence||.5)});
      i++; continue;
    }
    normalized.push(l);
  }
  lines=normalized;
  let wi=-1;
  for(let i=0;i<lines.length;i++)if(totalLike(lines[i].text)&&lines[i].money){wi=i;break}
  let implicit=false,w=[];if(wi<0){let m=lines.map((l,i)=>({l,i})).filter(x=>x.l.money);if(m.length>1){let last=m.at(-1),prior=m.slice(0,-1).filter(x=>type(x.l.text)==="UNKNOWN");let sum=prior.reduce((s,x)=>s+x.l.money.value,0);if(Math.abs(sum-last.l.money.value)<=.02){wi=last.i;implicit=true;w.push("Possible total detectat sense etiqueta explícita.")}}}
let before=wi>=0?lines.slice(0,wi):lines,items=[],special={subtotal:null,tax:null,service:0,tip:0,discount:0},cls=[];
for(const l of before){let t=type(l.text);cls.push({line:l.text,type:t,amount:l.money?.value??null});if(["SUBTOTAL","TAX","SERVICE","TIP","DISCOUNT"].includes(t)&&l.money){let k=t==="TAX"?"tax":t.toLowerCase();special[k]=l.money.value}else if(t==="UNKNOWN"&&l.money){let p=productName(l.text,l.money);items.push({id:"item-"+(items.length+1),name:p.name,quantity:p.quantity,amount:l.money.value,confidence:Math.max(.01,Math.min(1,l.confidence||.5))});}}
let total=wi>=0?lines[wi].money.value:null,sum=items.reduce((s,x)=>s+x.amount,0),warnings=[...w];if(total==null)warnings.push("No s'ha pogut identificar el TOTAL.");let calc=sum+(special.tax||0)+special.service+special.tip-special.discount;if(total!=null&&Math.abs(calc-total)>.02)warnings.push(`Càlcul inconsistent: ${calc.toFixed(2)} € vs ${total.toFixed(2)} €.`);if(items.some(x=>x.confidence<.75))warnings.push("Una o més línies tenen OCR amb baixa confiança.");
return{version:"1.0",currency:"EUR",items,subtotal:special.subtotal??Math.round(sum*100)/100,tax:special.tax,service:special.service,tip:special.tip,discount:special.discount,total,confidence:Number((items.length?items.reduce((s,x)=>s+x.confidence,0)/items.length:.5).toFixed(2)),needsReview:warnings.length>0,warnings,diagnostics:{explicitTotal:!implicit,totalLineIndex:wi,ignoredAfterTotal:wi>=0?lines.slice(wi+1).map(x=>x.text):[],classifications:cls}}}
function render(r){lastResult=structuredClone(r);$("items").innerHTML="";r.items.forEach(addRow);$("count").textContent=`(${r.items.length})`;["subtotal","tax","service","tip","discount","total"].forEach(k=>$(k).value=r[k]??"");$("review").classList.toggle("hidden",!r.needsReview);$("warnings").classList.toggle("hidden",!r.warnings.length);$("warnings").innerHTML=r.warnings.join("<br>");$("summary").innerHTML=`<span>✓ ${r.items.length} productes</span><span>${r.total!=null?"✓ Total detectat":"⚠ Total no confirmat"}</span><span>${r.warnings.length?"⚠ Revisar":"✓ Càlcul coherent"}</span>`}
function addRow(it){let d=document.createElement("div");d.className="item";d.innerHTML=`<input class="qty" type="number" min="1" value="${it.quantity}"><input class="name" value="${it.name.replaceAll('"',"&quot;")}"><input class="amount" value="${it.amount.toFixed(2)}"><button>✕</button>`;d.querySelector("button").onclick=()=>d.remove();$("items").appendChild(d)}
function imgData(file){return new Promise((ok,no)=>{let r=new FileReader;r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)})}
function image(src){return new Promise((ok,no)=>{let i=new Image;i.onload=()=>ok(i);i.onerror=no;i.src=src})}
function prep(i){let s=Math.min(2,1800/i.width),c=document.createElement("canvas");c.width=i.width*s;c.height=i.height*s;let x=c.getContext("2d");x.drawImage(i,0,0,c.width,c.height);let d=x.getImageData(0,0,c.width,c.height);for(let j=0;j<d.data.length;j+=4){let y=.299*d.data[j]+.587*d.data[j+1]+.114*d.data[j+2],v=Math.max(0,Math.min(255,(y-128)*1.4+128));d.data[j]=d.data[j+1]=d.data[j+2]=v}x.putImageData(d,0,0);return c}
async function process(file){show(V.processing);prog(5,"Carregant fotografia…");let src=await imgData(file),im=await image(src);prog(15,"Preprocessant fotografia…");let canvas=prep(im);if(!window.Tesseract)throw Error("Motor OCR local no disponible.");prog(25,"Iniciant OCR…");let worker=await Tesseract.createWorker(["cat","spa","eng"],1,{workerPath:"./ocr/worker.min.js",corePath:"./ocr/core",langPath:"./ocr/lang",logger:m=>prog(25+Math.round((m.progress||0)*60),"OCR: "+(m.status||"processant"))});try{let r=await worker.recognize(canvas);lastOCR=r.data;lastLines=lineData(r.data);$("ot").textContent=r.data.text||"—";$("lt").textContent=lastLines.map(x=>`${x.text} | ${x.money?.value??"-"} | conf ${x.confidence.toFixed(2)}`).join("\n");let out=parse(lastLines);$("ct").textContent=out.diagnostics.classifications.map(x=>`${x.type.padEnd(10)} | ${x.amount??"-"} | ${x.line}`).join("\n");prog(100,"Lectura completada");render(out);show(V.result)}finally{await worker.terminate()}}
$("camera").onclick=()=>$("cameraInput").click();$("gallery").onclick=()=>$("galleryInput").click();$("cameraInput").onchange=e=>e.target.files[0]&&process(e.target.files[0]).catch(e=>{show(V.home);$("status").textContent="⚠️ "+e.message});$("galleryInput").onchange=e=>e.target.files[0]&&process(e.target.files[0]).catch(e=>{show(V.home);$("status").textContent="⚠️ "+e.message});
$("diag").onclick=async()=>{show(V.diagnostic);let p=["./ocr/tesseract.min.js","./ocr/worker.min.js","./ocr/core/tesseract-core.wasm.js","./ocr/core/tesseract-core-simd.wasm.js","./ocr/core/tesseract-core-lstm.wasm.js","./ocr/core/tesseract-core-simd-lstm.wasm.js","./ocr/lang/cat.traineddata.gz","./ocr/lang/spa.traineddata.gz","./ocr/lang/eng.traineddata.gz"],a=[window.Tesseract?"Tesseract API: OK":"Tesseract API: NO"];for(let x of p){try{let r=await fetch(x,{cache:"no-store"});a.push(`${x}: ${r.ok?"OK":"ERROR ("+r.status+")"}`)}catch{a.push(`${x}: ERROR`)}}$("dout").textContent=a.join("\n")};$("close").onclick=()=>show(lastResult?V.result:V.home);
$("add").onclick=()=>addRow({quantity:1,name:"",amount:0});$("new").onclick=()=>{lastResult=null;show(V.home)};$("json").onclick=()=>{let b=new Blob([JSON.stringify(lastResult,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="ticket-result.json";a.click()};
$("status").textContent=window.Tesseract?"✓ Motor OCR carregat. Pots seleccionar una fotografia.":"⚠️ Motor OCR no carregat. Revisa el desplegament de GitHub Pages.";
