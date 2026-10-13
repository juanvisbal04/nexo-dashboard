// NEXO Shield 360 — opt-in TOTP enrollment and challenge for enrolled users.
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x};
const show=(node,msg,kind="")=>{node.textContent=msg;node.className="nexo-mfa-message "+kind;};
export async function mountMfaProfile(supabase,container,notify){
  if(!container)return;
  const panel=el("section","card nexo-mfa-panel");panel.id="nexoMfaPanel";
  panel.innerHTML='<div class="card-head"><div><h2>Seguridad de tu cuenta</h2><p>Verificación en dos pasos mediante una aplicación de autenticación (TOTP).</p></div></div><p class="nexo-mfa-summary" aria-live="polite">Consultando factores…</p><button class="btn" type="button" data-mfa-start>Configurar autenticación de dos pasos</button><div class="nexo-mfa-workspace" hidden></div><p class="muted">No se activa hasta que verifiques un código. Supabase no proporciona códigos de recuperación TOTP: conserva acceso a tu aplicación y considera registrar un segundo factor.</p>';
  container.appendChild(panel);
  const summary=panel.querySelector(".nexo-mfa-summary"),start=panel.querySelector("[data-mfa-start]"),workspace=panel.querySelector(".nexo-mfa-workspace");
  const read=async()=>{
    const {data,error}=await supabase.auth.mfa.listFactors();if(error)throw error;
    const verified=(data?.totp||[]).filter(f=>f.status==="verified");
    summary.textContent=verified.length?"Activado: "+verified.length+" factor(es) TOTP verificado(s).":"No hay autenticación TOTP verificada para esta cuenta.";
    start.textContent=verified.length?"Añadir otro dispositivo de autenticación":"Activar autenticación de dos pasos";
  };
  try{await read();}catch(error){show(summary,error.message||"No pudimos consultar el MFA.","error");start.disabled=true;return;}
  start.addEventListener("click",async()=>{
    start.disabled=true;workspace.hidden=false;workspace.replaceChildren();
    const info=el("p","","Abre una aplicación TOTP y escanea el código QR. No compartas la clave.");
    const message=el("p","nexo-mfa-message","");
    const form=el("form","nexo-mfa-verify"),code=el("input");
    code.type="text";code.inputMode="numeric";code.pattern="[0-9]{6}";code.maxLength=6;code.required=true;code.autocomplete="one-time-code";code.placeholder="Código de 6 dígitos";code.setAttribute("aria-label","Código MFA");
    const verify=el("button","btn primary","Verificar y activar");verify.type="submit";
    const cancel=el("button","btn","Cancelar");cancel.type="button";
    form.append(code,verify,cancel);workspace.append(info,message);
    let factorId=null;
    const clean=()=>{workspace.replaceChildren();workspace.hidden=true;start.disabled=false;};
    try{
      const {data,error}=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"NEXO Shield 360"});
      if(error)throw error;
      factorId=data?.id;
      if(data?.totp?.qr_code){
        const qr=el("img","nexo-mfa-qr"),uri=data.totp.qr_code;
        if(typeof uri==="string"&&(uri.startsWith("data:image/svg+xml;")||uri.startsWith("data:image/png;")))qr.src=uri;
        qr.alt="QR de autenticación para esta sesión";workspace.appendChild(qr);
      }
      if(data?.totp?.secret){
        const line=el("p","nexo-mfa-secret","Clave manual (trátala como una contraseña): ");
        const secret=el("code");secret.textContent=data.totp.secret;line.appendChild(secret);workspace.appendChild(line);
      }
      workspace.appendChild(form);
      form.addEventListener("submit",async(e)=>{
        e.preventDefault();verify.disabled=true;show(message,"Verificando…");
        try{
          const {error}=await supabase.auth.mfa.challengeAndVerify({factorId,code:code.value.trim()});
          if(error)throw error;
          clean();await read();notify?.("MFA activado. Las demás sesiones pueden haber sido cerradas.");
        }catch(error){show(message,error.message||"Código incorrecto; vuelve a intentarlo.","error");verify.disabled=false;}
      });
      cancel.addEventListener("click",async()=>{
        try{if(factorId)await supabase.auth.mfa.unenroll({factorId});}catch{}
        clean();
      });
    }catch(error){
      if(factorId)try{await supabase.auth.mfa.unenroll({factorId});}catch{}
      clean();notify?.(error.message||"No se pudo configurar MFA.",true);
    }
  });
}
export async function promptForEnrolledMfa(supabase,loginView,hideBoot){
  const {data:aal,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aalError)throw aalError;
  if(!(aal?.nextLevel==="aal2"&&aal?.currentLevel!=="aal2"))return;
  const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();
  if(listError)throw listError;
  const factor=(factors?.totp||[]).find(f=>f.status==="verified");
  if(!factor)throw new Error("Tu cuenta necesita un segundo factor no disponible en esta sesión. Contacta al administrador.");
  hideBoot();loginView.classList.remove("hidden");
  const loginForm=loginView.querySelector("#passwordForm"),originalDisplay=loginForm?.style.display;
  if(loginForm)loginForm.style.display="none";
  const card=loginView.querySelector(".login-card")||loginView,prompt=el("section","nexo-mfa-signin");
  prompt.innerHTML='<h2>Verificación de seguridad NEXO</h2><p>Ingresa el código temporal de tu aplicación de autenticación.</p><form><input inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="Código de 6 dígitos" aria-label="Código MFA"><button class="btn primary" type="submit">Verificar ingreso</button><button class="btn" type="button" data-cancel>Cancelar</button></form><p class="nexo-mfa-message" role="status"></p>';
  card.appendChild(prompt);
  const restore=()=>{prompt.remove();if(loginForm)loginForm.style.display=originalDisplay||"";};
  return await new Promise((resolve,reject)=>{
    prompt.querySelector("form").addEventListener("submit",async e=>{
      e.preventDefault();const btn=prompt.querySelector('button[type="submit"]');btn.disabled=true;
      const msg=prompt.querySelector(".nexo-mfa-message");show(msg,"Verificando…");
      try{
        const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:factor.id,code:prompt.querySelector("input").value.trim()});
        if(error)throw error;restore();resolve();
      }catch(error){show(msg,error.message||"Código incorrecto","error");btn.disabled=false;}
    });
    prompt.querySelector("[data-cancel]").addEventListener("click",async()=>{
      restore();try{await supabase.auth.signOut({scope:"local"});}catch{}
      reject(new Error("Ingreso cancelado; se necesita verificación de dos pasos."));
    });
  });
}
