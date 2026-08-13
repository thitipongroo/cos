<#--
  Construction OS — Keycloak backup (recovery) codes page. Standalone template (renders the whole
  page, same PROCESS as the custom login.ftl) but the presentation follows
  mockup/mobile/02_shared/02_mfa/03_mfa_backup_codes_success_state &
  02_mfa/04_mfa_backup_codes_download_success — NOT the login page's chrome. Uses the mockup's own tokens
  (#031427 surface, #102034 code cards, #b4c5ff code text, #2563eb action, #FF9500 warning,
  #00C853 success) and its mobile app-bar + bento-grid + "COPY ALL CODES" + success-toast layout.
  The Keycloak form contract is unchanged — action ${url.loginAction}; #kc-recovery-codes-list;
  hidden generatedRecoveryAuthnCodes / generatedAt / userLabel; #kcRecoveryCodesConfirmationCheck
  enabling #saveRecoveryAuthnCodesBtn; #cancelRecoveryAuthnCodesBtn (cancel-aia). Backup codes stay
  Keycloak-owned (ADR-074); this only restyles their presentation to the mockup.
-->
<!DOCTYPE html>
<html lang="${lang!'en'}" class="cos">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Construction OS — ${msg("recovery-code-config-header")}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{
      /* mockup/mobile/02_shared/02_mfa/03_mfa_backup_codes_success_state tokens */
      --bg:#031427; --sc:#102034; --sch:#1b2b3f; --scl:#0b1c30;
      --primary:#b4c5ff; --pc:#2563eb; --pc-h:#1d4ed8; --opc:#eeefff;
      --on-surface:#d3e4fe; --osv:#c3c6d7; --outline:#8d90a0; --ov:#434655;
      --warn:#FF9500; --success:#00C853;
    }
    *{box-sizing:border-box}
    body{margin:0;min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--on-surface);
      font-family:'Inter Tight',Inter,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:14px;
      -webkit-font-smoothing:antialiased}
    /* Top app bar (mockup 06) */
    .appbar{display:flex;align-items:center;justify-content:space-between;height:64px;padding:0 24px;background:var(--bg)}
    .brand{display:flex;align-items:center;gap:8px}
    .brand img{height:28px;width:auto}
    .brand h1{margin:0;font-size:20px;font-weight:700;letter-spacing:-.01em;color:var(--primary)}
    .avatar{width:40px;height:40px;border-radius:50%;background:var(--sch);border:1px solid var(--ov)}
    /* Content */
    .content{flex:1;display:flex;flex-direction:column;gap:24px;padding:8px 24px 32px;overflow-y:auto;max-width:640px;width:100%;margin:0 auto}
    .head h2{margin:0 0 8px;font-size:24px;font-weight:700;color:var(--on-surface);letter-spacing:-.01em}
    .head p{margin:0;font-size:14px;line-height:1.5;color:var(--osv)}
    /* Codes bento grid */
    .codes{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .codes li{display:flex;align-items:center;justify-content:space-between;gap:8px;
      background:var(--sc);border-left:4px solid rgba(180,197,255,.4);border-radius:12px;padding:14px 16px}
    .codes li .code{font-family:'Courier New',monospace;color:var(--primary);font-size:13px;letter-spacing:.02em}
    .codes li .num{color:var(--osv);font-size:11px;font-family:'Courier New',monospace;margin-right:2px}
    .codes li svg{color:var(--osv);flex-shrink:0}
    /* Warning card */
    .warn{display:flex;gap:12px;background:rgba(255,149,0,.1);border:1px solid rgba(255,149,0,.2);border-radius:12px;padding:16px}
    .warn svg{color:var(--warn);flex-shrink:0}
    .warn .wt{margin:0 0 4px;font-weight:600;font-size:13px;color:#FCD34D}
    .warn p{margin:0;font-size:12px;line-height:1.6;color:var(--osv)}
    /* COPY ALL CODES — primary-container action */
    .copy-all{display:flex;align-items:center;justify-content:center;gap:8px;height:52px;width:100%;border:none;
      border-radius:12px;background:var(--pc);color:var(--opc);font-family:inherit;font-size:14px;font-weight:700;
      letter-spacing:.02em;cursor:pointer;transition:background .15s}
    .copy-all:hover{background:var(--pc-h)}
    /* Secondary actions (download / print) */
    .secondary-row{display:flex;gap:12px}
    .sec-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:44px;border-radius:12px;
      background:var(--scl);border:1px solid var(--ov);color:var(--osv);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer}
    .sec-btn:hover{color:var(--on-surface);border-color:var(--outline)}
    /* Confirm + complete/cancel (Keycloak flow) */
    .confirm{display:flex;align-items:flex-start;gap:10px;color:var(--osv);font-size:13px;line-height:1.45}
    .confirm input{width:20px;height:20px;margin-top:1px;accent-color:var(--pc)}
    .cta{display:flex;align-items:center;justify-content:center;height:52px;width:100%;border:none;border-radius:12px;
      background:var(--pc);color:#fff;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;transition:background .15s,opacity .15s}
    .cta:hover:not(:disabled){background:var(--pc-h)}
    .cta:disabled{opacity:.4;cursor:not-allowed}
    .cta-ghost{background:transparent;border:1px solid var(--ov);color:var(--osv);height:48px}
    .cta-ghost:hover:not(:disabled){color:var(--on-surface);border-color:var(--outline);background:transparent}
    /* Space the confirm checkbox / Complete / Cancel evenly so the two buttons aren't cramped. */
    #kc-recovery-codes-settings-form{display:flex;flex-direction:column;gap:14px;margin-top:4px}
    /* Success toast (mockup 06 "Copied to Clipboard") */
    #cos-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%) translateY(160%);
      display:flex;align-items:center;gap:16px;min-width:300px;max-width:92vw;
      background:var(--sch);border:1px solid rgba(0,200,83,.3);border-radius:16px;padding:14px 20px 14px 22px;
      box-shadow:0 20px 50px rgba(0,0,0,.5);opacity:0;overflow:hidden;
      transition:transform .4s cubic-bezier(.16,1,.3,1),opacity .4s;z-index:60}
    #cos-toast::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--success)}
    #cos-toast.show{transform:translateX(-50%) translateY(0);opacity:1}
    #cos-toast .ic{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;
      background:rgba(0,200,83,.2);color:var(--success);flex-shrink:0}
    #cos-toast .tt{font-weight:700;font-size:16px;color:var(--on-surface)}
    #cos-toast .ts{font-size:11px;color:var(--osv);letter-spacing:.05em;text-transform:uppercase;margin-top:2px}
  </style>
</head>
<body>
  <header class="appbar">
    <div class="brand">
      <img src="${url.resourcesPath}/img/logo-mark.png" alt="">
      <h1>${msg("cosBrand")}</h1>
    </div>
    <div class="avatar"></div>
  </header>

  <div class="content">
    <div class="head">
      <h2>${msg("recovery-code-config-header")}</h2>
      <p>${msg("cosRecoverySubtitle")}</p>
    </div>

    <ol id="kc-recovery-codes-list" class="codes">
      <#list recoveryAuthnCodesConfigBean.generatedRecoveryAuthnCodesList as code>
        <li>
          <span><span class="num">${code?counter}</span> <span class="code">${code[0..3]}-${code[4..7]}-${code[8..]}</span></span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
        </li>
      </#list>
    </ol>

    <div class="warn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
      <div>
        <p class="wt">${msg("recovery-code-config-warning-title")}</p>
        <p>${msg("recovery-code-config-warning-message")}</p>
      </div>
    </div>

    <button type="button" id="copyRecoveryCodes" class="copy-all">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      ${msg("cosCopyAllCodes")}
    </button>

    <div class="secondary-row">
      <button type="button" id="downloadRecoveryCodes" class="sec-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
        ${msg("recovery-codes-download")}
      </button>
      <button type="button" id="printRecoveryCodes" class="sec-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
        ${msg("recovery-codes-print")}
      </button>
    </div>

    <form action="${url.loginAction}" id="kc-recovery-codes-settings-form" method="post">
      <input type="hidden" name="generatedRecoveryAuthnCodes" value="${recoveryAuthnCodesConfigBean.generatedRecoveryAuthnCodesAsString}" />
      <input type="hidden" name="generatedAt" value="${recoveryAuthnCodesConfigBean.generatedAt?c}" />
      <input type="hidden" id="userLabel" name="userLabel" value="${msg("recovery-codes-label-default")}" />

      <label class="confirm" for="kcRecoveryCodesConfirmationCheck">
        <input type="checkbox" id="kcRecoveryCodesConfirmationCheck" name="kcRecoveryCodesConfirmationCheck"
          onchange="document.getElementById('saveRecoveryAuthnCodesBtn').disabled = !this.checked;" />
        <span>${msg("recovery-codes-confirmation-message")}</span>
      </label>

      <input type="submit" id="saveRecoveryAuthnCodesBtn" class="cta" value="${msg("recovery-codes-action-complete")}" disabled />
      <#if isAppInitiatedAction??>
        <button type="submit" id="cancelRecoveryAuthnCodesBtn" class="cta cta-ghost" name="cancel-aia" value="true">${msg("recovery-codes-action-cancel")}</button>
      </#if>
    </form>
  </div>

  <canvas id="cos-confetti" style="position:fixed;inset:0;z-index:70;pointer-events:none"></canvas>
  <div id="cos-toast">
    <div class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
    <div><div class="tt" id="cos-toast-title">${msg("cosCopiedTitle")}</div><div class="ts" id="cos-toast-sub"></div></div>
  </div>

  <script>
    var codeCount = document.querySelectorAll('#kc-recovery-codes-list li').length;
    // Confetti burst on success (mockup 06). Self-contained canvas — no external lib (air-gapped safe).
    var cvs=document.getElementById('cos-confetti'), cx=cvs.getContext('2d'), parts=[], raf=null;
    var cCol=['#00C853','#b4c5ff','#ffffff'];
    function fitCanvas(){ cvs.width=window.innerWidth; cvs.height=window.innerHeight; }
    fitCanvas(); window.addEventListener('resize', fitCanvas);
    function burst(){
      for(var i=0;i<40;i++){ parts.push({x:cvs.width/2,y:cvs.height*0.8,s:Math.random()*4+2,
        vx:(Math.random()-0.5)*10,vy:(Math.random()*-15)-5,g:0.5,o:1,c:cCol[Math.floor(Math.random()*3)]}); }
      if(!raf) raf=requestAnimationFrame(tick);
    }
    function tick(){
      cx.clearRect(0,0,cvs.width,cvs.height);
      for(var i=parts.length-1;i>=0;i--){ var p=parts[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=p.g; p.o-=0.02;
        cx.globalAlpha=Math.max(0,p.o); cx.fillStyle=p.c; cx.beginPath(); cx.rect(p.x,p.y,p.s,p.s); cx.fill();
        if(p.o<=0) parts.splice(i,1); }
      if(parts.length) raf=requestAnimationFrame(tick); else { raf=null; cx.clearRect(0,0,cvs.width,cvs.height); }
    }
    function cosToast(title){
      var t=document.getElementById('cos-toast');
      document.getElementById('cos-toast-title').textContent=title;
      document.getElementById('cos-toast-sub').textContent=codeCount+' ${msg("cosBackupCodesSecured")}';
      t.classList.add('show'); burst();
      if(window.navigator.vibrate) window.navigator.vibrate([10,30,10]);
      clearTimeout(window.__t); window.__t=setTimeout(function(){t.classList.remove('show');},2600);
    }
    function parseCodes(){
      var els=document.querySelectorAll('#kc-recovery-codes-list li .code'); var o='';
      for(var i=0;i<els.length;i++){o+=(i+1)+': '+els[i].innerText+'\n';} return o;
    }
    document.getElementById('copyRecoveryCodes').addEventListener('click',function(){
      var ta=document.createElement('textarea');ta.value=parseCodes();document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);
      cosToast('${msg("cosCopiedTitle")}');
    });
    document.getElementById('downloadRecoveryCodes').addEventListener('click',function(){
      var txt='${msg("recovery-codes-download-file-header")}\n\n'+parseCodes()+'\n'+'${msg("recovery-codes-download-file-description")}';
      var el=document.createElement('a');el.setAttribute('href','data:text/plain;charset=utf-8,'+encodeURIComponent(txt));
      el.setAttribute('download','cos-recovery-codes.txt');el.style.display='none';document.body.appendChild(el);el.click();document.body.removeChild(el);
      cosToast('${msg("cosDownloadedTitle")}');
    });
    document.getElementById('printRecoveryCodes').addEventListener('click',function(){
      var w=window.open();w.document.write('<html><body style="font-family:monospace;width:420px"><h3>${msg("recovery-code-config-header")}</h3><pre>'+parseCodes()+'</pre></body></html>');w.document.close();w.print();w.close();
    });
  </script>
</body>
</html>
