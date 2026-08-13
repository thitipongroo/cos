<#--
  Construction OS — Keycloak TOTP (authenticator) setup page. Standalone template (same PROCESS as the
  custom login.ftl) styled to match mockup/mobile/02_shared/02_mfa/01_mfa_enrollment
  for the parts Keycloak owns (PO decision: theme the Keycloak-owned parts exactly, omit the mockup's
  backup-codes bento / audit-trail / bottom-nav — those belong to the 02_mfa/03 recovery page, app/backend data,
  and the native tab bar respectively; putting fake codes/audit on a real security page would mislead).

  Keycloak form contract preserved — action ${url.loginAction}; id kc-totp-settings-form; the code field
  name="totp" (fed by the 6 visible boxes via JS); hidden totpSecret=${totp.totpSecret}; userLabel (default
  supplied hidden so the mockup stays clean); mode passthrough; cancel-aia. Variables from the totp bean:
  totp.totpSecretQrCode (base64 png), totp.totpSecretEncoded (space-grouped secret), totp.totpSecret.
-->
<!DOCTYPE html>
<html lang="${lang!'en'}" class="cos">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Construction OS — ${msg("cosMfaEnrollTitle")}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{
      /* mockup 03 tokens */
      --bg:#031427; --surface-dim:#031427; --sc:#102034; --sch:#1b2b3f; --scl:#0b1c30; --scv:#26364a;
      --sbright:#2a3a4f; --primary:#b4c5ff; --on-primary:#002a78; --pc:#2563eb; --pc-h:#1d4ed8;
      --opc:#eeefff; --secondary:#4cd7f6; --on-surface:#d3e4fe; --osv:#c3c6d7; --outline:#8d90a0;
      --ov:#434655; --warn:#FF9500; --success:#00C853;
    }
    *{box-sizing:border-box}
    body{margin:0;min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--on-surface);
      font-family:'Inter Tight',Inter,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:17px;
      -webkit-font-smoothing:antialiased}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    /* Top app bar */
    .appbar{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;
      height:56px;padding:0 24px;background:var(--surface-dim);border-bottom:1px solid rgba(255,255,255,.05)}
    .brand{display:flex;align-items:center;gap:8px}
    .brand img{height:28px;width:auto}
    .brand h1{margin:0;font-size:20px;line-height:28px;font-weight:700;letter-spacing:-.03em;text-transform:uppercase;color:var(--primary)}
    .synced{display:flex;align-items:center;gap:4px;background:var(--sc);padding:2px 8px;border-radius:9999px;border:1px solid rgba(141,144,160,.1)}
    .synced svg{color:var(--success)}
    .synced span{font-size:9px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--success)}
    /* Main */
    main{flex:1;padding:16px 24px 40px;max-width:640px;width:100%;margin:0 auto;display:flex;flex-direction:column;gap:24px}
    .welcome h2{margin:0;font-size:28px;line-height:34px;font-weight:700}
    .welcome p{margin:4px 0 0;font-size:14px;color:var(--osv)}
    /* Security notice */
    .notice{position:relative;overflow:hidden;background:rgba(76,215,246,.05);border-left:4px solid var(--secondary);
      border-radius:8px;padding:12px;display:flex;gap:12px;
      background-image:linear-gradient(90deg,transparent,rgba(6,182,212,.05),transparent);background-size:200% 100%;animation:shimmer 3s infinite linear}
    .notice svg{color:var(--secondary);flex-shrink:0}
    .notice .nt{margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--secondary)}
    .notice p{margin:0;font-size:12px;line-height:1.6;color:var(--on-surface)}
    .notice p b{font-weight:700}
    /* Step header */
    .step-head{display:flex;align-items:center;gap:8px}
    .step-num{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;
      background:var(--primary);color:var(--on-primary);font-size:10px;font-weight:700}
    .step-head h3{margin:0;font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase}
    .step{display:flex;flex-direction:column;gap:16px}
    /* QR card */
    .qr-card{background:var(--sc);border-radius:12px;padding:16px;display:flex;flex-direction:column;align-items:center;border:1px solid rgba(67,70,85,.2)}
    .qr-card .instr{font-size:14px;color:var(--osv);text-align:center;margin:0 0 24px}
    .qr-frame{position:relative;padding:8px;background:#fff;border-radius:8px}
    .qr-frame img{width:192px;height:192px;display:block}
    .qr-frame i{position:absolute;width:24px;height:24px}
    .qr-frame .tl{top:-8px;left:-8px;border-top:4px solid var(--pc);border-left:4px solid var(--pc);border-top-left-radius:2px}
    .qr-frame .tr{top:-8px;right:-8px;border-top:4px solid var(--pc);border-right:4px solid var(--pc);border-top-right-radius:2px}
    .qr-frame .bl{bottom:-8px;left:-8px;border-bottom:4px solid var(--pc);border-left:4px solid var(--pc);border-bottom-left-radius:2px}
    .qr-frame .br{bottom:-8px;right:-8px;border-bottom:4px solid var(--pc);border-right:4px solid var(--pc);border-bottom-right-radius:2px}
    .secret{margin-top:32px;width:100%}
    .secret label{display:block;font-size:10px;text-transform:uppercase;color:var(--osv);font-weight:700;letter-spacing:.15em;margin-bottom:8px;padding:0 4px}
    .secret-chip{display:flex;align-items:center;justify-content:space-between;background:var(--scl);border:1px solid rgba(67,70,85,.3);border-radius:8px;padding:12px}
    .secret-chip code{color:var(--primary);font-family:'Courier New',monospace;font-weight:700;letter-spacing:.15em;font-size:14px;text-transform:uppercase;word-break:break-all}
    .secret-chip button{display:flex;padding:8px;border:none;background:transparent;color:var(--osv);border-radius:6px;cursor:pointer;transition:background .15s}
    .secret-chip button:hover{background:var(--sbright)}
    /* OTP boxes */
    .otp-row{display:flex;justify-content:space-between;gap:8px;padding:0 4px}
    .otp-box{width:100%;height:56px;background:var(--sc);border:1px solid rgba(67,70,85,.3);border-radius:8px;
      text-align:center;font-size:24px;font-weight:700;color:var(--primary);font-family:inherit;outline:none;transition:border-color .15s,box-shadow .15s}
    .otp-box:focus{border-color:var(--pc);box-shadow:0 0 0 2px rgba(37,99,235,.2)}
    .otp-sep{width:8px;display:flex;align-items:center;justify-content:center;opacity:.3;flex-shrink:0}
    .otp-err{color:#ffb4ab;font-size:12px;padding:0 4px}
    /* Complete button */
    .cta{width:100%;height:52px;border:none;border-radius:8px;background:var(--pc);color:var(--opc);
      font-family:inherit;font-size:13px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
      cursor:pointer;box-shadow:0 10px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s,background .15s}
    .cta:active{transform:scale(.97)}
    .cta:hover{background:var(--pc-h)}
    .cta-ghost{background:transparent;border:1px solid var(--ov);color:var(--osv);box-shadow:none;margin-top:4px;height:48px}
    .cta-ghost:hover{color:var(--on-surface);border-color:var(--outline);background:transparent}
  </style>
</head>
<body>
  <header class="appbar">
    <div class="brand">
      <img src="${url.resourcesPath}/img/logo-mark.png" alt="">
      <h1>${msg("cosBrand")}</h1>
    </div>
    <div class="synced">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-1.4 14.6L6.4 12.4 7.8 11l2.8 2.8L16.2 8l1.4 1.4Z"/></svg>
      <span>${msg("cosSynced")}</span>
    </div>
  </header>

  <main>
    <section class="welcome">
      <h2>${msg("cosMfaEnrollTitle")}</h2>
      <p>${msg("cosMfaEnrollSubtitle")}</p>
    </section>

    <section class="notice">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      <div>
        <p class="nt">${msg("cosSecurityNoticeTitle")}</p>
        <p>${msg("cosSecurityNoticeBody1")} <b>${msg("cosSecurityNoticeBold")}</b>${msg("cosSecurityNoticeBody2")}</p>
      </div>
    </section>

    <div class="step">
      <div class="step-head"><span class="step-num">01</span><h3>${msg("cosSetupAuthenticator")}</h3></div>
      <div class="qr-card">
        <p class="instr">${msg("cosScanInstruction")}</p>
        <div class="qr-frame">
          <i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>
          <img src="data:image/png;base64, ${(totp.totpSecretQrCode)!''}" alt="QR code">
        </div>
        <div class="secret">
          <label>${msg("cosManualSecretLabel")}</label>
          <div class="secret-chip">
            <code id="totp-secret-text">${(totp.totpSecretEncoded)!''}</code>
            <button type="button" id="copySecret" aria-label="${msg("cosCopyAllCodes")}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <form action="${url.loginAction}" id="kc-totp-settings-form" method="post">
      <div class="step" style="gap:16px">
        <div class="step-head"><span class="step-num">02</span><h3>${msg("cosEnterVerificationCode")}</h3></div>
        <div class="otp-row">
          <input class="otp-box" maxlength="1" inputmode="numeric" autocomplete="one-time-code" aria-label="digit 1">
          <input class="otp-box" maxlength="1" inputmode="numeric" aria-label="digit 2">
          <input class="otp-box" maxlength="1" inputmode="numeric" aria-label="digit 3">
          <div class="otp-sep">—</div>
          <input class="otp-box" maxlength="1" inputmode="numeric" aria-label="digit 4">
          <input class="otp-box" maxlength="1" inputmode="numeric" aria-label="digit 5">
          <input class="otp-box" maxlength="1" inputmode="numeric" aria-label="digit 6">
        </div>
        <#if messagesPerField.existsError('totp')>
          <span class="otp-err" aria-live="polite">${kcSanitize(messagesPerField.get('totp'))?no_esc}</span>
        </#if>

        <input type="hidden" id="totp" name="totp" value="" />
        <input type="hidden" id="totpSecret" name="totpSecret" value="${(totp.totpSecret)!''}" />
        <input type="hidden" id="userLabel" name="userLabel" value="${msg('cosDefaultDeviceName')}" />
        <#if mode??><input type="hidden" id="mode" name="mode" value="${mode}"/></#if>

        <button type="submit" class="cta">
          ${msg("cosCompleteEnrollment")}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
        </button>
        <#if isAppInitiatedAction??>
          <button type="submit" class="cta cta-ghost" name="cancel-aia" value="true">${msg("cosCancelSetup")}</button>
        </#if>
      </div>
    </form>
  </main>

  <script>
    (function(){
      var boxes = Array.prototype.slice.call(document.querySelectorAll('.otp-box'));
      var hidden = document.getElementById('totp');
      function sync(){ hidden.value = boxes.map(function(b){return b.value;}).join(''); }
      boxes.forEach(function(box, i){
        box.addEventListener('input', function(e){
          e.target.value = e.target.value.replace(/[^0-9]/g,'').slice(0,1);
          if(e.target.value && i < boxes.length-1) boxes[i+1].focus();
          sync();
        });
        box.addEventListener('keydown', function(e){
          if(e.key==='Backspace' && !e.target.value && i>0){ boxes[i-1].focus(); }
        });
        box.addEventListener('paste', function(e){
          e.preventDefault();
          var d=(e.clipboardData||window.clipboardData).getData('text').replace(/[^0-9]/g,'').slice(0,6);
          for(var j=0;j<d.length && (i+j)<boxes.length;j++){ boxes[i+j].value=d[j]; }
          var next=Math.min(i+d.length, boxes.length-1); boxes[next].focus(); sync();
        });
      });
      document.getElementById('kc-totp-settings-form').addEventListener('submit', sync);
      var copyBtn=document.getElementById('copySecret');
      if(copyBtn){ copyBtn.addEventListener('click', function(){
        var t=document.getElementById('totp-secret-text').innerText.replace(/\s/g,'');
        var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();
        try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);
      }); }
      if(boxes[0]) boxes[0].focus();
    })();
  </script>
</body>
</html>
