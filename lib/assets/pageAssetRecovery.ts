/** Runs before Next's styles/scripts: recovery must work even when the app cannot boot.
 * Only same-origin Next assets qualify. CSS retries preserve the original link/order;
 * a missing startup bundle or persistent CSS failure gets one cache-busting navigation.
 * The session guard survives that navigation, and interaction prevents losing reader edits.
 */
export function pageAssetRecoveryScript(): string {
  return String.raw`(function(){
if(window.__pageAssetRecovery)return;
window.__pageAssetRecovery=true;
var key='arkpedia:page-asset-recovery',parameter='__arkpedia_reload';
var started=Date.now(),interacted=false,pending=false,reloading=false;
var attempts=new WeakMap(),waiting=new WeakSet(),failed=new WeakSet();
var current=new URL(location.href),arrived=current.searchParams.has(parameter);
var storage=false;
try{
  sessionStorage.setItem(key+':probe','1');sessionStorage.removeItem(key+':probe');storage=true;
  if(arrived){
    sessionStorage.setItem(key,String(started));
    current.searchParams.delete(parameter);
    history.replaceState(history.state,'',current.href);
  }
}catch(e){}
['pointerdown','keydown','input'].forEach(function(name){
  document.addEventListener(name,function(){interacted=true;},{capture:true,once:true});
});
function asset(value,extension){
  try{var url=new URL(value,location.href);return url.origin===location.origin&&url.pathname.indexOf('/_next/static/')===0&&url.pathname.endsWith(extension)?url:null;}catch(e){return null;}
}
function recover(){
  pending=true;
  if(reloading||interacted||Date.now()-started>30000||navigator.onLine===false||document.visibilityState==='hidden')return;
  if(arrived)return;
  try{
    var last=Number(sessionStorage.getItem(key));
    if(last&&Date.now()-last<300000)return;
    if(storage)sessionStorage.setItem(key,String(Date.now()));
  }catch(e){}
  reloading=true;
  var url=new URL(location.href);url.searchParams.set(parameter,String(Date.now()));
  location.replace(url.href);
}
function retry(link){
  if(!link||link.tagName!=='LINK'||link.rel!=='stylesheet'||link.disabled||(link.sheet&&!failed.has(link))||waiting.has(link))return;
  var url=asset(link.href,'.css');if(!url)return;
  if(navigator.onLine===false)return;
  var count=attempts.get(link)||0;
  if(count>=2){recover();return;}
  waiting.add(link);
  setTimeout(function(){
    waiting.delete(link);
    if(!link.isConnected||(link.sheet&&!failed.has(link))||navigator.onLine===false)return;
    attempts.set(link,count+1);
    url.searchParams.set('__arkpedia_retry',started+'-'+(count+1));
    link.href=url.href;
  },count===0?250:1000);
}
document.addEventListener('error',function(event){
  var node=event.target;
  if(node&&node.tagName==='LINK'){failed.add(node);retry(node);}
  // Defer marks the initial NextScript tags. Dynamic chunks and third-party media
  // must not refresh an already-running planner or other interactive page.
  if(node&&node.tagName==='SCRIPT'&&node.defer&&!node.noModule&&asset(node.src,'.js'))setTimeout(recover,1000);
},true);
document.addEventListener('load',function(event){var node=event.target;if(node&&node.tagName==='LINK')failed.delete(node);},true);
function inspect(){
  document.querySelectorAll('link[rel="stylesheet"]').forEach(retry);
  if(pending)recover();
}
// Also catch a preload failure before this script and styles missing on tab restore.
window.addEventListener('load',inspect);
window.addEventListener('pageshow',inspect);
window.addEventListener('online',inspect);
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')inspect();});
})();`;
}
