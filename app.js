/* PERSONAL AI — el endpoint de configuración solo publica credenciales anon de Supabase. */
const CONFIG = {
  CHAT_ENDPOINT: "/api/chat",
  MAX_INPUT: 4000, MAX_CONTEXT: 20, TIMEOUT_MS: 30000
};
const $ = s => document.querySelector(s);
let sb = null;
const st = { user: null, convId: null, msgs: [], convs: [], busy: false, muted: false };
const uid = () => crypto.randomUUID();

/* Navegación */
function go(n){ document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("active",s.id==="s-"+n));
  if(n==="home") loadHistory(); if(n==="chat") renderMsgs(); if(n!=="voice") stopVoice(); }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-go]"); if(b) go(b.dataset.go); });

/* Estado / modo */
function modeText(){ return !sb ? "Configuración pendiente: conecta Supabase para usar la IA" : st.user ? "Cuenta conectada" : "Inicia sesión para usar la IA"; }
function refreshMode(){ const text=modeText(); $("#mode-label").textContent = text;
  $("#status-text").textContent = !sb ? "Configuración requerida" : st.user ? "Cuenta conectada" : "Inicia sesión para continuar";
  const bn=$("#banner"); bn.hidden = !!(sb&&st.user); bn.textContent = "⚠ "+modeText()+". Las conversaciones son temporales."; }
function showBanner(message){ const bn=$("#banner"); bn.hidden=false; bn.textContent="⚠ "+message; }

/* Markdown seguro */
const md = t => DOMPurify.sanitize(marked.parse(t,{breaks:true}),{FORBID_TAGS:["style","form","iframe"],FORBID_ATTR:["style","onerror","onclick"]});

/* Chat */
function renderMsgs(){
  const box=$("#messages"); box.innerHTML="";
  if(!st.msgs.length){ box.innerHTML='<div class="empty"><p>¿Por dónde empezamos?</p></div>';
    ["Explícame un tema","Ayúdame a programar","Resume un texto","Genera ideas","Resuelve una duda"].forEach(t=>{
      const b=document.createElement("button"); b.className="btn"; b.textContent=t; b.style.margin="4px";
      b.onclick=()=>{ $("#input").value=t+": "; $("#input").focus(); }; box.querySelector(".empty").append(b); }); }
  st.msgs.forEach(addBubble); box.scrollTop=box.scrollHeight;
}
function addBubble(m){
  const d=document.createElement("div"); d.className="msg "+m.role;
  if(m.role==="user") d.textContent=m.content; else { d.innerHTML=md(m.content);
    const a=document.createElement("div"); a.className="act"; const c=document.createElement("button"); c.textContent="Copiar";
    c.onclick=()=>navigator.clipboard.writeText(m.content).then(()=>c.textContent="Copiado ✓")
      .catch(error=>{ console.error("Could not copy assistant response:",error); c.textContent="No se pudo copiar"; }); a.append(c); d.append(a); }
  $("#messages").append(d); return d;
}
function typing(on){ let t=$("#typing"); if(!on){ t&&t.remove(); return; }
  t=document.createElement("div"); t.id="typing"; t.className="msg assistant typing"; t.innerHTML="<i></i><i></i><i></i>"; $("#messages").append(t); t.scrollIntoView(); }

async function token(){ if(!sb) return null; const {data}=await sb.auth.getSession(); return data.session?.access_token||null; }

async function askAI(){
  if(!sb) throw new Error("Configura la URL y la clave pública de Supabase en app.js para usar el asistente.");
  const tk=await token();
  if(!tk) throw new Error("Inicia sesión para usar el asistente.");
  const history = st.msgs.slice(-CONFIG.MAX_CONTEXT).map(({role,content})=>({role,content}));
  const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),CONFIG.TIMEOUT_MS);
  try{
    const r=await fetch(CONFIG.CHAT_ENDPOINT,{method:"POST",signal:ctl.signal,
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+tk},body:JSON.stringify({messages:history})});
    if(r.status===401) throw new Error("Inicia sesión para usar el asistente.");
    if(r.status===429) throw new Error("Demasiadas solicitudes. Espera un momento.");
    if(!r.ok) throw new Error("El servicio de IA no respondió ("+r.status+").");
    const j=await r.json(); if(!j.reply) throw new Error("Respuesta vacía del servicio."); return j.reply;
  }catch(e){ if(e.name==="AbortError") throw new Error("Tiempo de espera agotado."); if(e instanceof TypeError) throw new Error("Sin conexión con el backend /api/chat. Revisa la configuración."); throw e; }
  finally{ clearTimeout(to); }
}
function showChatError(error){
  const d=document.createElement("div"); d.className="msg assistant"; d.textContent="⚠ "+error.message+" ";
  const b=document.createElement("button"); b.className="btn"; b.textContent="Reintentar";
  b.onclick=()=>{ d.remove(); requestReply(); }; d.append(b); $("#messages").append(d);
}
async function requestReply(alreadyBusy=false){
  if(st.busy&&!alreadyBusy) return null;
  st.busy=true; typing(true);
  try{
    const reply=await askAI(); typing(false); st.msgs.push({role:"assistant",content:reply});
    await persist("assistant",reply); renderMsgs(); return reply;
  }catch(e){ typing(false); showChatError(e); return null; }
  finally{ st.busy=false; }
}
async function send(text){
  text=text.trim().slice(0,CONFIG.MAX_INPUT); if(!text||st.busy) return null;
  st.busy=true; st.msgs.push({role:"user",content:text}); renderMsgs();
  await persist("user",text);
  return requestReply(true);
}
$("#composer").addEventListener("submit",e=>{ e.preventDefault(); if(st.busy) return; const i=$("#input"); const t=i.value; i.value=""; send(t); });
$("#input").addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); $("#composer").requestSubmit(); } });
$("#new-chat").onclick=()=>{ st.convId=null; st.msgs=[]; renderMsgs(); };

/* Persistencia (RLS protege; user_id lo fija la BD por defecto auth.uid()) */
async function persist(role,content){
  if(!sb||!st.user) return;
  try{
    if(!st.convId&&role==="assistant") return;
    if(!st.convId){
      const id=uid(); const {error}=await sb.from("conversations").insert({id,title:content.slice(0,60)});
      if(error) throw error;
      st.convId=id;
    }
    const {error}=await sb.from("messages").insert({conversation_id:st.convId,role,content}); if(error) throw error;
    const {error:updateError}=await sb.from("conversations").update({updated_at:new Date().toISOString()}).eq("id",st.convId);
    if(updateError) throw updateError;
  }catch(error){ console.error("Could not save conversation message:",error); showBanner("No se pudo guardar este mensaje."); }
}
async function loadHistory(){
  const ul=$("#history"); ul.innerHTML=""; st.convs=[];
  if(sb&&st.user){
    try{
      const {data,error}=await sb.from("conversations").select("id,title").order("updated_at",{ascending:false}).limit(20);
      if(error) throw error;
      st.convs=data||[];
    }catch(error){ console.error("Could not load conversation history:",error); ul.innerHTML='<li class="tiny">No se pudo cargar el historial.</li>'; return; }
  }
  if(!st.convs.length){ ul.innerHTML='<li class="tiny">Aún no hay conversaciones guardadas.</li>'; return; }
  st.convs.slice(0,4).forEach(c=>{ const li=document.createElement("li"); const o=document.createElement("button"); o.textContent=c.title; o.onclick=()=>openConv(c.id);
    const x=document.createElement("button"); x.className="del"; x.textContent="🗑"; x.setAttribute("aria-label","Eliminar"); x.onclick=()=>delConv(c.id); li.append(o,x); ul.append(li); });
}
async function openConv(id){
  if(!sb||!st.user) return;
  try{
    const {data,error}=await sb.from("messages").select("role,content").eq("conversation_id",id).order("created_at");
    if(error) throw error;
    st.convId=id; st.msgs=data||[]; go("chat");
  }catch(error){ console.error("Could not open conversation:",error); showBanner("No se pudo abrir la conversación."); }
}
async function delConv(id){
  if(!confirm("¿Eliminar esta conversación?")) return;
  try{
    const {error}=await sb.from("conversations").delete().eq("id",id);
    if(error) throw error;
    loadHistory();
  }catch(error){ console.error("Could not delete conversation:",error); showBanner("No se pudo eliminar la conversación."); }
}
$("#see-all").onclick=()=>{
  const dialog=$("#history-dialog"), list=$("#all-history"); list.innerHTML="";
  if(!st.convs.length){ list.innerHTML='<li class="tiny">Aún no hay conversaciones guardadas.</li>'; }
  else st.convs.forEach(c=>{
    const li=document.createElement("li"), button=document.createElement("button");
    button.type="button"; button.textContent=c.title;
    button.onclick=()=>{ dialog.close(); openConv(c.id); };
    li.append(button); list.append(li);
  });
  dialog.showModal();
};

/* Topics */
["Programación","Ideas de proyecto","Estudio","Redacción"].forEach(t=>{ const b=document.createElement("button"); b.textContent=t; b.onclick=()=>{ go("chat"); $("#input").value="Ayúdame con "+t.toLowerCase()+": "; $("#input").focus(); }; $("#topics").append(b); });

/* Cuenta */
$("#btn-account").onclick=()=>{ $("#acc-info").textContent=sb?(st.user?"Sesión: "+st.user.email:"Sin sesión"):"Supabase no configurado (modo demostración)."; $("#account").showModal(); };
const auth=async fn=>{
  if(!sb){ $("#acc-msg").textContent="Configura SUPABASE_URL y SUPABASE_ANON_KEY en Vercel."; return; }
  try{
    const {data,error}=await fn();
    $("#acc-msg").textContent=error ? error.message
      : data?.user&&!data.session ? "Cuenta creada. Revisa tu correo para confirmar el registro."
      : "Listo.";
  }catch(error){ $("#acc-msg").textContent=error.message||"No se pudo conectar con Supabase."; }
};
$("#login").onclick=()=>auth(()=>sb.auth.signInWithPassword({email:$("#email").value,password:$("#pass").value}));
$("#signup").onclick=()=>auth(()=>sb.auth.signUp({email:$("#email").value,password:$("#pass").value}));
$("#logout").onclick=()=>auth(()=>sb.auth.signOut());
async function initializeSupabase(){
  try{
    if(!window.supabase) throw new Error("No se pudo cargar la biblioteca de Supabase.");
    const response=await fetch("/api/config",{cache:"no-store"});
    if(!response.ok) throw new Error("El servidor no tiene configurada la conexión de Supabase.");
    const config=await response.json();
    if(typeof config.url!=="string"||typeof config.anonKey!=="string"||!config.url||!config.anonKey){
      throw new Error("Falta SUPABASE_URL o SUPABASE_ANON_KEY en Vercel.");
    }
    const projectUrl=new URL(config.url);
    if(!["https:","http:"].includes(projectUrl.protocol)) throw new Error("La URL configurada de Supabase no es válida.");
    sb=window.supabase.createClient(config.url,config.anonKey);
    sb.auth.onAuthStateChange((_e,s)=>{
      const user=s?.user||null;
      if(user?.id!==st.user?.id){ st.convId=null; st.msgs=[]; st.convs=[]; renderMsgs(); }
      st.user=user; refreshMode(); loadHistory();
    });
    const {data,error}=await sb.auth.getSession();
    if(error) throw error;
    st.user=data.session?.user||null;
    refreshMode(); loadHistory();
  }catch(error){
    console.error("Supabase initialization failed:",error);
    showBanner(error.message||"No se pudo conectar con Supabase.");
    refreshMode();
  }
}

/* Voz (Web Speech del navegador) */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition; let rec=null, voiceCancelled=false, voiceStarting=false, voiceActive=false;
function vstate(t,cls){ $("#voice-state").textContent=t; $("#s-voice").classList.toggle("listening",cls==="l"); }
function stopVoice(){ voiceCancelled=true; if(rec&&voiceActive) rec.abort(); if("speechSynthesis" in window) speechSynthesis.cancel(); vstate("Listo"); }
$("#mute").onclick=()=>{ st.muted=!st.muted; $("#mute").textContent=st.muted?"🔇":"🔊"; if(st.muted&&"speechSynthesis" in window) speechSynthesis.cancel(); };
$("#mic").onclick=()=>{
  if(!SR){ $("#voice-note").textContent="Tu navegador no soporta reconocimiento de voz. Usa el chat de texto."; return; }
  if(voiceStarting||voiceActive) return;
  voiceCancelled=false; voiceStarting=true; rec=new SR(); rec.lang="es-MX"; rec.interimResults=true;
  rec.onstart=()=>{ voiceStarting=false; voiceActive=true; if(voiceCancelled){ rec.abort(); return; } vstate("Escuchando","l"); };
  rec.onresult=e=>{ $("#voice-you").textContent=[...e.results].map(r=>r[0].transcript).join(""); };
  rec.onerror=e=>{ voiceStarting=false; voiceActive=false; vstate("Listo"); $("#voice-note").textContent=e.error==="not-allowed"?"Permiso de micrófono denegado.":"Error de voz: "+e.error; };
  rec.onend=async()=>{ voiceStarting=false; voiceActive=false; const t=$("#voice-you").textContent; if(voiceCancelled||!t) return vstate("Listo"); vstate("Procesando");
    const r=await send(t); $("#voice-ai").textContent=r||"No pude obtener respuesta (revisa el chat).";
    if(r&&!st.muted&&"speechSynthesis" in window&&"SpeechSynthesisUtterance" in window){ const u=new SpeechSynthesisUtterance(r.replace(/[*#`_>]/g,"")); u.lang="es-MX"; u.onstart=()=>vstate("Hablando"); u.onend=()=>vstate("Listo"); speechSynthesis.speak(u); } else vstate("Listo"); };
  $("#voice-you").textContent=""; $("#voice-ai").textContent="";
  try{ rec.start(); }catch(error){ voiceStarting=false; voiceCancelled=true; vstate("Listo"); $("#voice-note").textContent=error.message||"No se pudo iniciar el micrófono."; }
};

/* Partículas */
(()=>{ const c=$("#particles"),x=c.getContext("2d"); let P=[];
  const rs=()=>{c.width=innerWidth;c.height=innerHeight;P=Array.from({length:50},()=>({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.8+.4,v:Math.random()*.3+.1}));}; rs(); addEventListener("resize",rs);
  if(matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  (function f(){ x.clearRect(0,0,c.width,c.height); x.fillStyle="rgba(159,208,255,.6)"; P.forEach(p=>{p.y-=p.v; if(p.y<0)p.y=c.height; x.beginPath();x.arc(p.x,p.y,p.r,0,7);x.fill();}); requestAnimationFrame(f); })(); })();
refreshMode();
initializeSupabase();
