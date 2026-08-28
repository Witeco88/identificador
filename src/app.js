const APP_VERSION="5.7.1";
const $=id=>document.getElementById(id);
const V={home:$("home"),processing:$("processing"),result:$("result"),diagnostic:$("diagnostic")};
let lastResult=null,lastLines=[],lastOCR=null;
const moneyRe=/(?:€\s*)?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:\s*[,.]\s*\d{2})(?:\s*€)?|(?:€\s*)\d+(?:\s*[,.]\s*\d{2})(?:\s*€)?|\b\d+\s*€\b/g;
const labels={
total:/\b(total|totaal|totale|gesamt|summe|gesamtbetrag|grand\s+total|amount\s+due|importe\s+total|montant\s+total|total\s+ttc|totale\s+complessivo|valor\s+total)/i,
subtotal:/\b(subtotal|sub\s*total|sous[- ]total|zwischensumme|zwischenbetrag|subtotale|sous-total)/i,
tax:/\b(iva|vat|tax|taxe|impuesto|impostos|impostos|imposto|impostos|btw|tva|mwst|ust|ust\.|belasting|taxa)/i,
service:/\b(service|servicio|servei|servizio|service\s+charge|servico|serviço|dienstleistung|bedienung)/i,
tip:/\b(tip|tips|propina|pourboire|mancia|gorjeta|pourboire|trinkgeld)/i,
discount:/\b(discount|descuento|descompte|remise|sconto|desconto|rabatt|korting)/i,
payment:/\b(visa|mastercard|maestro|cash|payment|card|tarjeta|carte|kaart|pagament|pagamento|contant|bar|ec\s*card|girocard)/i,
footer:/\b(thank|thanks|thank you|gracias|gràcies|merci|grazie|obrigad|obrigado|dank|bedankt|dank u|danke|danke schoen|www\.|http)/i};
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
  const raw=String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const compact=raw.replace(/0/g,"o").replace(/1/g,"i").replace(/[^a-z]/g,"");
  const explicit=labels.total.test(raw);
  const variants=[
    "total","totaal","totale","totao","totai","tota1","tota",
    "gesamt","gesammt","gesam","summe","grandtotal","amountdue",
    "importetotal","montanttotal","totalecomplessivo","valor total".replace(/\s/g,"")
  ];
  return explicit || variants.some(v=>compact.includes(v));
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
    let text=(q.words || []).map(w=>w.text).join(" ").replace(/\s+/g," ").trim();
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
function lineData(d){if(d.words?.length)return linesFromWords(d.words);if(d.lines?.length)return (d.lines || []).map((l,i)=>({id:"line-"+(i+1),text:l.text.trim(),confidence:(l.confidence||0)/100,money:money(l.text),y:l.bbox?.y0||i,y0:l.bbox?.y0||i,y1:l.bbox?.y1||i+1,words:[]}));return String(d.text||"").split(/\n+/).map((text,i)=>({id:"line-"+(i+1),text:text.trim(),confidence:0,money:money(text),y:i})).filter(x=>x.text)}
function productName(s,m){let n=s.replace(m?.raw||"","").replace(/^[-–—•#]/,"").trim(),q=1,x=n.match(/^(\d+)\s*(?:x|×|\*)\s*/i);if(x){q=+x[1];n=n.slice(x[0].length).trim()}else{x=n.match(/^(\d+)\s+(?=[A-Za-zÀ-ÿ])/);if(x){q=+x[1];n=n.slice(x[0].length).trim()}}return{name:n||"Concepte sense nom",quantity:q}}

/* V5.7 Enhanced OCR: optional PaddleOCR.js second engine.
   Tesseract remains the local fallback. Paddle is invoked only when the
   primary result is weak or mathematically inconsistent. */
let paddleOCRInstance = null;
let paddleOCRPromise = null;

function loadExternalScriptOnce(src){
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(x=>x.src===new URL(src,location.href).href);
    if(existing){ existing.addEventListener("load",()=>resolve(),{once:true}); existing.addEventListener("error",reject,{once:true}); if(existing.dataset.loaded==="1") resolve(); return; }
    const el=document.createElement("script");
    el.src=src; el.async=true;
    el.onload=()=>{el.dataset.loaded="1";resolve();};
    el.onerror=()=>reject(new Error("No s'ha pogut carregar PaddleOCR.js"));
    document.head.appendChild(el);
  });
}

async function getPaddleOCR(){
  if(paddleOCRInstance) return paddleOCRInstance;
  if(paddleOCRPromise) return paddleOCRPromise;
  paddleOCRPromise=(async()=>{
    // Browser SDK is published as an ES module. Importing it dynamically keeps
    // the base app functional if the optional engine is unavailable.
    const mod=await import("https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js/+esm");
    const PaddleOCR=mod.PaddleOCR||mod.default?.PaddleOCR||mod.default;
    if(!PaddleOCR) throw new Error("PaddleOCR no disponible");
    const ocr=await PaddleOCR.create({
      lang:"en",
      ocrVersion:"PP-OCRv5",
      worker:true,
      ortOptions:{backend:"wasm",numThreads:2,simd:true}
    });
    paddleOCRInstance=ocr;
    return ocr;
  })();
  try{return await paddleOCRPromise;}
  catch(e){paddleOCRPromise=null;throw e;}
}

function paddleItemsToOCRLines(result){
  const items=Array.isArray(result?.items)?result.items:[];
  return items.map((it,i)=>{
    const poly=Array.isArray(it.poly)?it.poly:[];
    const xs=poly.map(p=>Array.isArray(p)?p[0]:0), ys=poly.map(p=>Array.isArray(p)?p[1]:0);
    const x=xs.length?Math.min(...xs):0, y=ys.length?Math.min(...ys):0;
    const width=xs.length?Math.max(...xs)-x:0, height=ys.length?Math.max(...ys)-y:0;
    return {
      id:"paddle-"+i,
      text:String(it.text||"").trim(),
      confidence:Number(it.score??0),
      bbox:{x,y,width,height},
      engine:"paddle"
    };
  }).filter(x=>x.text);
}

async function runPaddleSecondary(file){
  const ocr=await getPaddleOCR();
  const [result]=await ocr.predict(file);
  return paddleItemsToOCRLines(result);
}

function shouldRunSecondaryOCR(parsed){
  const totalConf=Number(parsed?.totalConfidence??0);
  const overall=Number(parsed?.overallConfidence??0);
  const warnings=Array.isArray(parsed?.warnings)?parsed.warnings:[];
  return totalConf<0.90 || overall<0.88 ||
    warnings.some(w=>/inconsistent|ambiguous|missing|not found|low confidence|import/i.test(String(w)));
}

async function mergeSecondaryOCR(primaryLines, secondaryLines){
  const all=[...(Array.isArray(primaryLines)?primaryLines:[])];
  for(const p of (Array.isArray(secondaryLines)?secondaryLines:[])){
    const near=all.findIndex(x=>{
      const a=x.bbox||{}, b=p.bbox||{};
      const yc=Math.abs((a.y||0)-(b.y||0)) <= Math.max(24,(a.height||20)*1.8);
      const xc=Math.abs((a.x||0)-(b.x||0)) <= 160;
      return yc&&xc;
    });
    if(near<0) all.push(p);
    else if(Number(p.confidence||0)>Number(all[near].confidence||0)+0.08){
      all[near]={...all[near],...p,engine:"paddle+primary"};
    } else if(String(all[near].text||"").length<3 && p.text){
      all[near]={...all[near],text:p.text,engine:"paddle+primary"};
    }
  }
  return all;
}

function normText(s){
  return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function fiscalLike(s){
  const n=normText(s);
  return /\b(netto|net|btw|vat|iva|tax|taxe|taxable|belasting|mwst|ust|imposto|impostos|incl|excl|tva)\b/i.test(n) ||
         /\b(5|6|7|9|10|13|19|20|21|22|23|24|25)%\b/.test(n);
}
function paymentLike(s){
  return /\b(visa|mastercard|maestro|pin|cash|contant|card|kaart|payment|betaald|change|wisselgeld)\b/i.test(String(s));
}
function footerLike(s){
  return /\b(bedankt|dank|dankjewel|dank u|thanks|thank you|gracias|merci|grazie|obrigad|enquete|survey|www\.|http|facebook|instagram)\b/i.test(normText(s));
}
function productish(s){
  const n=normText(s);
  return !totalLike(s) && !fiscalLike(s) && !paymentLike(s) && !footerLike(s) &&
         !/\b(subtotal|sous-total|service|servicio|servizio|dienst|tip|propina|pourboire|descuento|discount|korting)\b/i.test(n);
}
function amountOnly(s){
  const t=String(s).trim();
  const mm=money(t);
  if(!mm)return false;
  return t.replace(/€|\d|[,\.\s\-]/g,"")==="";
}
function sectionScore(lines, i){
  const l=lines[i], t=l.text||"";
  let score=0;
  if(totalLike(t))score+=100;
  if(l.money)score+=10;
  // A total near the end of the item block is more likely than a random amount.
  const remaining=lines.length-i-1;
  if(remaining>=0) score+=Math.max(0,20-Math.min(20,remaining));
  if(i>0 && lines[i-1].money)score+=2;
  return score;
}
function chooseTotal(lines){
  const candidates=[];
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    if(l.money && totalLike(l.text)){
      candidates.push({i,line:l,score:sectionScore(lines,i),explicit:true,reasons:["explicit total label"]});
    }
  }
  // Also detect a total label and amount split over adjacent OCR rows.
  for(let i=0;i<lines.length-1;i++){
    if(totalLike(lines[i].text)&&!lines[i].money&&lines[i+1].money){
      candidates.push({
        i:i+1,
        line:{...lines[i],text:`${lines[i].text} ${lines[i+1].text}`,money:lines[i+1].money,
              confidence:Math.min(lines[i].confidence||.5,lines[i+1].confidence||.5)},
        score:120,explicit:true,reasons:["explicit total label","label and amount reconstructed"]
      });
    }
  }
  return candidates.sort((a,b)=>b.score-a.score)[0]||null;
}
function plausibleProductName(text){
  const n=normText(text).trim();
  if(!n || n.length<2) return false;
  if(fiscalLike(n)||paymentLike(n)||footerLike(n)||totalLike(n)) return false;
  if(/\b(subtotal|sub\s*total|sous[- ]total|zwischensumme|subtotale|service|servicio|servei|servizio|servico|serviço|dienstleistung|bedienung|tip|propina|pourboire|mancia|gorjeta|trinkgeld|descuento|discount|remise|sconto|desconto|rabatt|korting)\b/i.test(n)) return false;
  return /[a-zà-ÿ]/i.test(n);
}
function productRowCandidate(l){
  if(!l || !l.money) return false;
  return plausibleProductName(String(l.text||"").replace(l.money.raw,"").trim());
}
function itemRowsBefore(lines,endIndex){
  const rows=[];
  for(let i=0;i<endIndex;i++){
    const l=lines[i];
    if(productRowCandidate(l)) rows.push({...l,role:"PRODUCT",_sourceIndex:i});
  }
  return rows;
}
function recoverDroppedLastItems(lines,boundary,rows,totalValue){
  if(totalValue==null) return rows;
  const used=new Set(rows.map(r=>r._sourceIndex));
  let sum=Math.round(rows.reduce((a,r)=>a+(r.money?.value||0),0)*100)/100;
  for(let i=boundary-1;i>=0;i--){
    if(used.has(i)) continue;
    const l=lines[i];
    if(!l?.money) continue;
    const name=String(l.text||"").replace(l.money.raw,"").trim();
    if(!plausibleProductName(name)) continue;
    const candidate=l.money.value;
    const difference=Math.round((totalValue-sum)*100)/100;
    if(Math.abs(candidate-difference)<=0.02){
      rows.push({...l,role:"PRODUCT",_sourceIndex:i,_recovered:true});
      break;
    }
  }
  return rows.sort((x,y)=>x._sourceIndex-y._sourceIndex);
}

function chooseImplicitTotal(lines){
  // Consider unlabeled amounts only after a contiguous product block. Prefer a
  // candidate that exactly matches the sum of product candidates immediately above.
  let best=null;
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    if(!l.money || !amountOnly(l.text))continue;
    const before=itemRowsBefore(lines,i);
    if(before.length<2)continue;
    const sum=Math.round(before.reduce((a,r)=>a+(r.money?.value||0),0)*100)/100;
    const diff=Math.abs(sum-l.money.value);
    if(diff<=0.02){
      const score=100 + before.length*5 - Math.min(20,i/10);
      if(!best || score>best.score)best={i,line:l,score,reasons:["implicit total","matches product sum"]};
    }
  }
  return best;
}
function parse(lines){
  // Lines have already been reconstructed from OCR bounding boxes. First find
  // an explicit total. It becomes a hard spatial boundary.
  let totalCand=chooseTotal(lines);
  let implicit=false;
  if(!totalCand){
    totalCand=chooseImplicitTotal(lines);
    implicit=!!totalCand;
  }

  const boundary=totalCand?totalCand.i:lines.length;
  let productCandidates=itemRowsBefore(lines,boundary);
  if(totalCand?.line?.money?.value!=null){
    productCandidates=recoverDroppedLastItems(lines,boundary,productCandidates,totalCand.line.money.value);
  }
  // Detect a fiscal/table zone. A row with fiscal language or a repeated
  // multi-amount structure is never promoted to PRODUCT.
  let fiscalZone=false, rows=[];
  for(const l of productCandidates){
    const t=l.text||"";
    if(fiscalLike(t)) { fiscalZone=true; continue; }
    if(paymentLike(t)||footerLike(t)) continue;
    if(!l.money || !productish(t)) continue;

    // Quantity is intentionally conservative.
    let quantity=1,name=t.replace(l.money.raw,"").trim();
    const qm=name.match(/^(?:(\d+(?:[.,]\d+)?)\s*[x×*]\s*)/i);
    if(qm){quantity=Math.max(1,Number(qm[1].replace(",",".")));name=name.slice(qm[0].length).trim();}
    // Remove a standalone leading quantity only when followed by a plausible name.
    name=name.replace(/^\s*(\d+)\s+(?=[A-Za-zÀ-ÿ])/,"").trim();

    if(!name || !/[A-Za-zÀ-ÿ]/.test(name))continue;
    rows.push({
      id:`item-${rows.length+1}`,
      name,
      quantity,
      amount:l.money.value,
      confidence:Math.min(0.99,Math.max(0.05,(l.confidence||0.5)*0.98)),
      sourceLine:l.id, recovered:!!l._recovered
    });
  }

  const total=totalCand?.line?.money?.value??null;
  let subtotal=null,tax=0,service=0,tip=0,discount=0;
  const warnings=[];

  // Classify labeled charges only before the total boundary.
  for(let i=0;i<boundary;i++){
    const t=normText(lines[i].text);
    const val=lines[i].money?.value;
    if(val==null)continue;
    if(/\b(subtotal|sous-total|subtotaal)\b/.test(t)) subtotal=val;
    else if(/\b(iva|vat|tax|btw|belasting)\b/.test(t)) tax+=val;
    else if(/\b(service|servicio|servizio|dienst)\b/.test(t)) service+=val;
    else if(/\b(tip|propina|pourboire)\b/.test(t)) tip+=val;
    else if(/\b(desconto|descuento|discount|korting)\b/.test(t)) discount+=Math.abs(val);
  }

  const productSum=Math.round(rows.reduce((a,r)=>a+r.amount,0)*100)/100;
  if(subtotal==null && rows.length) subtotal=productSum;

  const expected=Math.round((productSum + tax + service + tip - discount)*100)/100;
  const diff=total==null?null:Math.round((total-expected)*100)/100;
  const coherent=diff==null?false:Math.abs(diff)<=0.02;

  if(!totalCand)warnings.push("No s'ha pogut identificar un total fiable.");
  else if(implicit)warnings.push("Possible total detectat sense etiqueta explícita.");
  if(total!=null&&!coherent)warnings.push(`La suma (${expected.toFixed(2)}) no coincideix amb el total (${total.toFixed(2)}).`);
  if(fiscalZone)warnings.push("S'ha detectat una zona fiscal; els seus imports no es consideren productes.");

  const totalConfidence=totalCand
    ? Math.min(0.995,Math.max(0.05,(totalCand.line.confidence||0.8)*(totalCand.explicit?1:0.82)))
    : 0;

  const classifications=lines.map(l=>({
    line:l.text,
    type: totalLike(l.text) ? "TOTAL" :
      /\\b(subtotal|sub\\s*total|sous[- ]total|zwischensumme|subtotale)\\b/i.test(normText(l.text)) ? "SUBTOTAL" :
      fiscalLike(l.text) ? "TAX" :
      /\\b(service|servicio|servei|servizio|servico|serviço|dienstleistung|bedienung)\\b/i.test(normText(l.text)) ? "SERVICE" :
      /\\b(tip|propina|pourboire|mancia|gorjeta|trinkgeld)\\b/i.test(normText(l.text)) ? "TIP" :
      /\\b(discount|descuento|descompte|remise|sconto|desconto|rabatt|korting)\\b/i.test(normText(l.text)) ? "DISCOUNT" :
      paymentLike(l.text) ? "PAYMENT" :
      footerLike(l.text) ? "FOOTER" :
      (l.money ? "PRODUCT_CANDIDATE" : "UNKNOWN"),
    amount:l.money?.value ?? null
  }));

  return {
    version:"1.0",
    currency:"EUR",
    items:rows,
    subtotal,
    tax,
    service,
    tip,
    discount,
    total,
    confidence:Math.round(((rows.length?rows.reduce((a,r)=>a+r.confidence,0)/rows.length:0)*0.45+totalConfidence*0.35+(coherent?0.2:0))*100)/100,
    totalConfidence,
    overallConfidence:Math.round(((rows.length?rows.reduce((a,r)=>a+r.confidence,0)/rows.length:0)*0.45+totalConfidence*0.35+(coherent?0.2:0))*100)/100,
    needsReview:!totalCand || !coherent || rows.length===0 || rows.some(r=>r.confidence<0.8),
    warnings,
    validation:{productSum,expectedTotal:expected,difference:diff,coherent},
    diagnostics:{
      classifications,
      totalBoundaryIndex:totalCand?totalCand.i:null,
      totalDetection:totalCand?{explicit:!!totalCand.explicit,score:totalCand.score,reasons:totalCand.reasons}:null,
      ignoredAfterTotal:totalCand?lines.slice(totalCand.i+1).map(l=>l.text):[],
      fiscalZoneDetected:fiscalZone
    }
  };
}

function render(r){lastResult=structuredClone(r);$("items").innerHTML="";r.items.forEach(addRow);$("count").textContent=`(${r.items.length})`;["subtotal","tax","service","tip","discount","total"].forEach(k=>$(k).value=r[k]??"");$("review").classList.toggle("hidden",!r.needsReview);$("warnings").classList.toggle("hidden",!r.warnings.length);$("warnings").innerHTML=r.warnings.join("<br>");$("summary").innerHTML=`<span>✓ ${r.items.length} productes</span><span>${r.total!=null?"✓ Total detectat":"⚠ Total no confirmat"}</span><span>${r.warnings.length?"⚠ Revisar":"✓ Càlcul coherent"}</span>`}
function addRow(it){let d=document.createElement("div");d.className="item";d.innerHTML=`<input class="qty" type="number" min="1" value="${it.quantity}"><input class="name" value="${it.name.replaceAll('"',"&quot;")}"><input class="amount" value="${it.amount.toFixed(2)}"><button>✕</button>`;d.querySelector("button").onclick=()=>d.remove();$("items").appendChild(d)}
function imgData(file){return new Promise((ok,no)=>{let r=new FileReader;r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)})}
function image(src){return new Promise((ok,no)=>{let i=new Image;i.onload=()=>ok(i);i.onerror=no;i.src=src})}
function prep(i){let s=Math.min(2,1800/i.width),c=document.createElement("canvas");c.width=i.width*s;c.height=i.height*s;let x=c.getContext("2d");x.drawImage(i,0,0,c.width,c.height);let d=x.getImageData(0,0,c.width,c.height);for(let j=0;j<d.data.length;j+=4){let y=.299*d.data[j]+.587*d.data[j+1]+.114*d.data[j+2],v=Math.max(0,Math.min(255,(y-128)*1.4+128));d.data[j]=d.data[j+1]=d.data[j+2]=v}x.putImageData(d,0,0);return c}
async function process(file){show(V.processing);prog(5,"Carregant fotografia…");let src=await imgData(file),im=await image(src);prog(15,"Preprocessant fotografia…");let canvas=prep(im);if(!window.Tesseract)throw Error("Motor OCR local no disponible.");prog(25,"Iniciant OCR…");let worker=await Tesseract.createWorker(["cat","spa","eng","nld","fra","deu","ita","por"],1,{workerPath:"./ocr/worker.min.js",corePath:"./ocr/core",langPath:"./ocr/lang",logger:m=>prog(25+Math.round((m.progress||0)*60),"OCR: "+(m.status||"processant"))});try{let r=await worker.recognize(canvas);lastOCR=r.data;lastLines=lineData(r.data);$("ot").textContent=r.data.text||"—";$("lt").textContent=lastLines.map(x=>`${x.text} | ${x.money?.value??"-"} | conf ${x.confidence.toFixed(2)}`).join("\n");let out=parse(lastLines);$("ct").textContent=out.diagnostics.classifications.map(x=>`${x.type.padEnd(10)} | ${x.amount??"-"} | ${x.line}`).join("\n");prog(100,"Lectura completada");render(out);show(V.result)}finally{await worker.terminate()}}
$("camera").onclick=()=>$("cameraInput").click();$("gallery").onclick=()=>$("galleryInput").click();$("cameraInput").onchange=e=>e.target.files[0]&&process(e.target.files[0]).catch(e=>{show(V.home);$("status").textContent="⚠️ "+e.message});$("galleryInput").onchange=e=>e.target.files[0]&&process(e.target.files[0]).catch(e=>{show(V.home);$("status").textContent="⚠️ "+e.message});
$("diag").onclick=async()=>{show(V.diagnostic);let p=["./ocr/tesseract.min.js","./ocr/worker.min.js","./ocr/core/tesseract-core.wasm.js","./ocr/core/tesseract-core-simd.wasm.js","./ocr/core/tesseract-core-lstm.wasm.js","./ocr/core/tesseract-core-simd-lstm.wasm.js","./ocr/lang/cat.traineddata.gz","./ocr/lang/spa.traineddata.gz","./ocr/lang/eng.traineddata.gz","./ocr/lang/nld.traineddata.gz","./ocr/lang/fra.traineddata.gz","./ocr/lang/deu.traineddata.gz","./ocr/lang/ita.traineddata.gz","./ocr/lang/por.traineddata.gz"],a=[window.Tesseract?"Tesseract API: OK":"Tesseract API: NO"];for(let x of p){try{let r=await fetch(x,{cache:"no-store"});a.push(`${x}: ${r.ok?"OK":"ERROR ("+r.status+")"}`)}catch{a.push(`${x}: ERROR`)}}$("dout").textContent=a.join("\n")};$("close").onclick=()=>show(lastResult?V.result:V.home);
$("add").onclick=()=>addRow({quantity:1,name:"",amount:0});$("new").onclick=()=>{lastResult=null;show(V.home)};$("json").onclick=()=>{let b=new Blob([JSON.stringify(lastResult,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="ticket-result.json";a.click()};
$("status").textContent=window.Tesseract?"✓ Motor OCR carregat. Pots seleccionar una fotografia.":"⚠️ Motor OCR no carregat. Revisa el desplegament de GitHub Pages.";


async function enhanceWithPaddleIfNeeded(file, primaryLines, parsed){
  if(!file || !shouldRunSecondaryOCR(parsed)) return {lines:primaryLines,used:false,error:null};
  try{
    const secondary=await runPaddleSecondary(file);
    return {lines:await mergeSecondaryOCR(primaryLines,secondary),used:true,error:null};
  }catch(error){
    console.warn("PaddleOCR secundari no disponible:",error);
    return {lines:primaryLines,used:false,error:String(error?.message||error)};
  }
}
