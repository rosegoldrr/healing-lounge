/* Healing Lounge i18n — 한국어 원문을 기준으로 화면 문구를 바꿔 보여줘요 */
(function(){
'use strict';
var D=window.I18N_DATA;if(!D)return;
var LANGS=[
 {c:'ko',n:'한국어',f:'KR',h:'ko'},{c:'en',n:'English',f:'US',h:'en'},
 {c:'zh',n:'简体中文',f:'CN',h:'zh-CN'},{c:'tw',n:'繁體中文',f:'TW',h:'zh-TW'},
 {c:'ja',n:'日本語',f:'JP',h:'ja'},{c:'es',n:'Español',f:'ES',h:'es'},
 {c:'fr',n:'Français',f:'FR',h:'fr'},{c:'de',n:'Deutsch',f:'DE',h:'de'},
 {c:'vi',n:'Tiếng Việt',f:'VN',h:'vi'},{c:'th',n:'ภาษาไทย',f:'TH',h:'th'},
 {c:'id',n:'Bahasa Indonesia',f:'ID',h:'id'},{c:'pt',n:'Português',f:'BR',h:'pt'},
 {c:'ru',n:'Русский',f:'RU',h:'ru'},{c:'fa',n:'فارسی',f:'IR',h:'fa'}
];
var HAN=/[가-힣]/, HANC=/[가-힣]/;
var cur='ko', comp=null, cache=null;
var ORIG=new WeakMap(), OUT=new WeakMap(), AORIG=new WeakMap(), AOUT=new WeakMap();
var ATTRS=['placeholder','title','aria-label','alt'];
var busy=false;

function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function compile(code){
  var arr=D[code];if(!arr)return null;
  var exact=Object.create(null), pats=[], pats2=[], subs=[];
  for(var i=0;i<D.k.length;i++){
    var k=D.k[i], v=arr[i];
    if(v==null)v=(D.en&&D.en[i])||'';
    if(/\{[ns]\}/.test(k)){
      var hasS=k.indexOf('{s}')>=0;
      var src=esc(k).replace(/\\\{n\\\}/g,'(\\d+)').replace(/\\\{s\\\}/g,'([^\\s\\[\\]][^\\n\\[\\]]*?)');
      (hasS?pats:pats2).push({re:new RegExp(src),v:v,len:k.length});
      continue;
    }
    exact[k]=v; subs.push(k);
  }
  subs.sort(function(a,b){return b.length-a.length;});
  pats.sort(function(a,b){return b.len-a.len;});pats2.sort(function(a,b){return b.len-a.len;});
  return {exact:exact,pats:pats,pats2:pats2,subs:subs};
}
function fill(v,m){var n=1;return v.replace(/\{[ns]\}/g,function(){return m[n++]||'';});}
function tr(str){
  if(cur==='ko'||!comp||!str||!HAN.test(str))return str;
  var hit=cache.get(str);if(hit!==undefined)return hit;
  var out=str, e=comp.exact;
  if(e[str]!==undefined){out=e[str];}
  else{
    var core=str.trim(), a=str.indexOf(core), pre=str.slice(0,a), post=str.slice(a+core.length);
    if(core&&e[core]!==undefined){out=pre+e[core]+post;}
    else{
      var s=str, i, p, m;
      var run=function(arr){
        for(var q=0;q<arr.length&&HAN.test(s);q++){
          p=arr[q];
          p.re.lastIndex=0;
          m=p.re.exec(s);
          while(m){
            var rep=fill(p.v,m);
            for(var j=1;j<m.length;j++){ if(HAN.test(m[j])){ rep=rep.split(m[j]).join(tr(m[j])); } }
            s=s.slice(0,m.index)+rep+s.slice(m.index+m[0].length);
            m=p.re.global?null:(p.re.test(s)?p.re.exec(s):null);
          }
        }
      };
      run(comp.pats);
      if(HAN.test(s)){
        for(i=0;i<comp.subs.length&&HAN.test(s);i++){
          var k=comp.subs[i], at=s.indexOf(k);
          if(at<0)continue;
          var v=comp.exact[k], buf='', from=0, kl=k.length, L=HANC.test(k.charAt(0)), R=HANC.test(k.charAt(kl-1));
          while(at>=0){
            var okL=!(L&&at>0&&HANC.test(s.charAt(at-1)));
            var okR=!(R&&kl<=2&&at+kl<s.length&&HANC.test(s.charAt(at+kl)));
            if(okL&&okR){buf+=s.slice(from,at)+v;from=at+kl;}
            at=s.indexOf(k,at+kl);
          }
          if(from>0){s=buf+s.slice(from);}
        }
      }
      run(comp.pats2);
      out=s;
    }
  }
  if(cache.size>3000)cache.clear();
  cache.set(str,out);
  return out;
}
function skipEl(el){var t=el&&el.nodeName;if(el&&el.closest&&el.closest('[data-raw]'))return true;return t==='SCRIPT'||t==='STYLE'||t==='TEXTAREA'||t==='NOSCRIPT'||(el&&el.closest&&!!el.closest('#langbox'));}
function doText(n){
  var el=n.parentNode;if(!el||skipEl(el)||skipEl(el.parentNode))return;
  var d=n.data, last=OUT.get(n);
  if(last===undefined||d!==last){ORIG.set(n,d);}
  var o=ORIG.get(n);
  var r=cur==='ko'?o:tr(o);
  if(r!==d){n.data=r;}
  OUT.set(n,r);
}
function doAttrs(el){
  if(skipEl(el))return;
  for(var i=0;i<ATTRS.length;i++){
    var a=ATTRS[i];if(!el.hasAttribute||!el.hasAttribute(a))continue;
    var key=a, map=AORIG.get(el)||{}, outm=AOUT.get(el)||{};
    var d=el.getAttribute(a);
    if(outm[key]===undefined||d!==outm[key])map[key]=d;
    var o=map[key], r=cur==='ko'?o:tr(o);
    if(r!==d)el.setAttribute(a,r);
    outm[key]=r;AORIG.set(el,map);AOUT.set(el,outm);
  }
}
function walk(root){
  if(!root)return;
  if(root.nodeType===3){doText(root);return;}
  if(root.nodeType!==1)return;
  if(skipEl(root))return;
  doAttrs(root);
  var c=root.firstChild;
  while(c){
    if(c.nodeType===3)doText(c);
    else if(c.nodeType===1)walk(c);
    c=c.nextSibling;
  }
}
var mo=null;
function onMut(list){
  if(busy)return;busy=true;
  try{
    for(var i=0;i<list.length;i++){
      var m=list[i];
      if(m.type==='characterData')doText(m.target);
      else if(m.type==='attributes')doAttrs(m.target);
      else if(m.type==='childList'){for(var j=0;j<m.addedNodes.length;j++)walk(m.addedNodes[j]);}
    }
  }finally{busy=false;}
  mo.takeRecords();
}
function setLang(code,save){
  var L=null;for(var i=0;i<LANGS.length;i++)if(LANGS[i].c===code)L=LANGS[i];
  if(!L)return;
  cur=code;comp=code==='ko'?null:compile(code);cache=new Map();
  document.documentElement.lang=L.h;
  document.documentElement.classList.toggle('rtl-text',code==='fa');
  if(save){try{localStorage.setItem('lounge.lang',code);}catch(e){}}
  busy=true;
  try{walk(document.body);}finally{busy=false;}
  if(mo)mo.takeRecords();
  document.title=code==='ko'?'Healing Lounge':document.title;
  paintBtn();
  try{window.dispatchEvent(new CustomEvent('langchange',{detail:code}));}catch(e){}
}
/* ── UI ── */
var box,btn,list;
function flagImg(f){return '<img src="/flags/'+f+'.svg" alt="" width="24" height="16" draggable="false">';}
function paintBtn(){
  if(!btn)return;
  var L=LANGS.filter(function(x){return x.c===cur;})[0];
  btn.querySelector('.fl').innerHTML=flagImg(L.f);
  var items=list.children;
  for(var i=0;i<items.length;i++)items[i].classList.toggle('on',items[i].getAttribute('data-c')===cur);
}
function place(){
  var d=document.getElementById('dbtn');
  var shown=d&&getComputedStyle(d).display!=='none';
  box.style.right=shown?'68px':'14px';
}
function buildUI(){
  var st=document.createElement('style');
  st.textContent=
   '#langbox{position:fixed;top:14px;right:14px;z-index:100000;font-family:inherit;touch-action:auto}'+
   '#langbox .lb{display:flex;align-items:center;gap:6px;height:46px;padding:0 12px;border-radius:23px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.2);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;cursor:pointer;font-size:12px;box-shadow:0 2px 10px rgba(0,0,0,.18)}'+
   '#langbox .lb img{display:block;border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.18)}'+
   '#langbox .lb .ar{font-size:10px;opacity:.85}'+
   '#langbox .ll{display:none;position:absolute;top:54px;right:0;min-width:216px;max-height:calc(100vh - 84px);overflow-y:auto;padding:6px;border-radius:14px;background:rgba(30,24,52,.94);border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 30px rgba(0,0,0,.4);-webkit-overflow-scrolling:touch}'+
   '#langbox.open .ll{display:block}'+
   '#langbox .li{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:9px;color:#fff;cursor:pointer;font-size:15px;white-space:nowrap}'+
   '#langbox .li:hover,#langbox .li:active{background:rgba(255,255,255,.14)}'+
   '#langbox .li img{border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,.25);flex:none}'+
   '#langbox .li span{flex:1}'+
   '#langbox .li b{width:16px;text-align:center;color:#8fe3b0;opacity:0}'+
   '#langbox .li.on b{opacity:1}'+
   'html.rtl-text body{font-family:Tahoma,"Segoe UI","Vazirmatn",system-ui,sans-serif}'+
   'body.touch #langbox .lb{height:40px;padding:0 10px}'+
   '#rot{z-index:99999}';
  document.head.appendChild(st);
  box=document.createElement('div');box.id='langbox';
  box.innerHTML='<div class="lb" role="button" aria-label="Language"><span class="fl"></span><span class="ar">▼</span></div><div class="ll"></div>';
  document.body.appendChild(box);
  btn=box.querySelector('.lb');list=box.querySelector('.ll');
  LANGS.forEach(function(L){
    var it=document.createElement('div');it.className='li';it.setAttribute('data-c',L.c);
    it.innerHTML=flagImg(L.f)+'<span></span><b>✓</b>';
    it.querySelector('span').textContent=L.n;
    
    it.addEventListener('click',function(e){e.stopPropagation();box.classList.remove('open');var was=cur;setLang(L.c,true);if(window.__inGame&&was!==L.c){setTimeout(function(){location.reload();},350);}});
    list.appendChild(it);
  });
  btn.addEventListener('click',function(e){e.stopPropagation();box.classList.toggle('open');});
  ['pointerdown','mousedown','touchstart'].forEach(function(ev){box.addEventListener(ev,function(e){e.stopPropagation();},{passive:true});});
  document.addEventListener('click',function(){box.classList.remove('open');});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')box.classList.remove('open');});
  setInterval(place,600);place();
}
function detect(){
  var s=null;try{s=localStorage.getItem('lounge.lang');}catch(e){}
  if(s&&D[s]!==undefined||s==='ko')return s;
  var n=((navigator.languages&&navigator.languages[0])||navigator.language||'ko').toLowerCase();
  if(n.indexOf('ko')===0)return 'ko';
  if(n.indexOf('zh')===0)return /tw|hk|mo|hant/.test(n)?'tw':'zh';
  var b=n.slice(0,2);
  var ok={en:1,ja:1,es:1,fr:1,de:1,vi:1,th:1,id:1,pt:1,ru:1,fa:1};
  if(b==='in')b='id';
  return ok[b]?b:'en';
}
function start(){
  buildUI();
  mo=new MutationObserver(onMut);
  mo.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS});
  setLang(detect(),false);
}
window.LANG={set:function(c){setLang(c,true);},get:function(){return cur;},t:tr,list:LANGS};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
