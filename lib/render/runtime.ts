/**
 * The only script in a generated site: under 3 KB, no dependencies.
 *
 * - the hero headline shrinks to fit when a long word in a wide display
 *   face would overflow a phone screen
 * - reveal-on-scroll (IntersectionObserver), skipped under reduced motion
 * - the portrait leans toward the pointer (fine pointers only)
 * - the intro: their recorded voice with timed captions, or, with no
 *   voice, the captions play on their own like subtitles
 *
 * Written as plain ES2017 inside a string so it can be inlined verbatim
 * into the exported HTML.
 */
export const RUNTIME = String.raw`(function(){
var d=document,root=d.documentElement,reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
var motion=root.getAttribute("data-motion")||"full";
function fit(){d.querySelectorAll(".hero h1").forEach(function(h){h.style.fontSize="";var w=h.parentElement.clientWidth,max=0;h.querySelectorAll("span").forEach(function(s){s.style.display="inline-block";max=Math.max(max,s.scrollWidth);s.style.display=""});if(max>w){var fs=parseFloat(getComputedStyle(h).fontSize);h.style.fontSize=Math.floor(fs*w/max*0.98)+"px"}})}
fit();addEventListener("resize",fit);if(d.fonts&&d.fonts.ready)d.fonts.ready.then(fit);
var els=d.querySelectorAll("[data-reveal]");
if(reduced||motion==="none"||!("IntersectionObserver" in window)){els.forEach(function(e){e.classList.add("in")})}
else{var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}})},{rootMargin:"0px 0px -8% 0px"});els.forEach(function(e){io.observe(e)})}
var fig=d.querySelector(".portrait .figure");
if(fig&&!reduced&&motion==="full"&&matchMedia("(hover: hover) and (pointer: fine)").matches){
addEventListener("pointermove",function(e){var x=(e.clientX/innerWidth-.5),y=(e.clientY/innerHeight-.5);fig.style.setProperty("--px",(x*14).toFixed(1)+"px");fig.style.setProperty("--py",(y*8).toFixed(1)+"px")},{passive:true})}
var dataEl=d.getElementById("intro-data");if(!dataEl)return;
var data=JSON.parse(dataEl.textContent||"{}"),caps=data.captions||[];
var audio=d.getElementById("intro-audio"),play=d.getElementById("intro-play"),cc=d.getElementById("intro-cc"),box=d.getElementById("intro-caption");
var showCC=true,timer=0,t0=0,running=false;
function render(t){if(!box)return;var c=null;for(var i=0;i<caps.length;i++){if(t>=caps[i].start&&t<=caps[i].end){c=caps[i];break}}box.innerHTML="";if(c&&showCC){var s=d.createElement("span");s.textContent=c.text;box.appendChild(s)}}
function label(on){if(!play)return;play.setAttribute("aria-pressed",on?"true":"false");play.querySelector("span").textContent=on?"Pause":(audio?"Hear my intro":"Play intro")}
var end=caps.length?caps[caps.length-1].end+.6:0;
function tick(){if(!running)return;var t=(performance.now()-t0)/1000;render(t);if(t>end){running=false;label(false);render(-1);return}timer=requestAnimationFrame(tick)}
function startCaptions(){running=true;t0=performance.now();label(true);tick()}
if(audio){audio.addEventListener("timeupdate",function(){render(audio.currentTime)});audio.addEventListener("play",function(){label(true)});audio.addEventListener("pause",function(){label(false)});audio.addEventListener("ended",function(){label(false);render(-1)})}
if(play)play.addEventListener("click",function(){if(audio){if(audio.paused){audio.currentTime=audio.ended?0:audio.currentTime;audio.play()}else audio.pause()}else{if(running){running=false;cancelAnimationFrame(timer);label(false);render(-1)}else startCaptions()}});
if(cc)cc.addEventListener("click",function(){showCC=!showCC;cc.setAttribute("aria-pressed",showCC?"true":"false");render(audio?audio.currentTime:(performance.now()-t0)/1000)});
if(!audio&&caps.length&&!reduced&&motion!=="none"){var hero=d.querySelector(".hero");if(hero&&"IntersectionObserver" in window){var once=new IntersectionObserver(function(es){if(es[0].isIntersecting){once.disconnect();setTimeout(startCaptions,900)}});once.observe(hero)}}
})();`;
