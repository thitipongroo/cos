<#--
  Construction OS — custom Keycloak login page (Path B, mockup/00_login_flow/web/03).
  Standalone template (renders the whole page) so the layout matches the mockup: top bar + centred
  card + compliance badges + footer. The form keeps Keycloak's contract unchanged — action
  ${url.loginAction}, ids #username / #password / #kc-login, field names username/password/login —
  so the auth flow and the E2E helper (tests/e2e/helpers/auth.ts) keep working.
-->
<!DOCTYPE html>
<html lang="en" class="cos">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Construction OS — ${msg("loginAccountTitle")}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{
      --navy:#0B1020; --surface:#0F172A; --surface2:#111c30; --blue:#2563EB; --blue-h:#1D4ED8;
      --cyan:#06B6D4; --text:#F8FAFC; --muted:#94A3B8; --dim:#64748B; --border:rgba(255,255,255,.1);
    }
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--navy);color:var(--text);
      font-family:'Inter Tight',Inter,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:14px}
    a{color:var(--cyan);text-decoration:none}
    /* Top bar */
    .topbar{display:flex;align-items:center;justify-content:space-between;height:64px;padding:0 48px;border-bottom:1px solid var(--border)}
    .topbar img{height:26px;width:auto}
    .topnav{display:flex;gap:28px;align-items:center;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
    .topnav .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#34D399;margin-right:6px;vertical-align:middle}
    .topnav .item{display:inline-flex;align-items:center;gap:6px}
    /* Main + card */
    .main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 16px;gap:28px}
    .card{width:100%;max-width:440px;background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}
    .card-head{padding:32px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02)}
    .logo-box{width:68px;height:68px;margin:0 auto 20px;border-radius:14px;background:#fff;overflow:hidden}
    .logo-box img{width:100%;height:100%;object-fit:contain}
    .card-head h1{margin:0 0 8px;font-size:20px;font-weight:600}
    .card-head p{margin:0;color:var(--muted);font-size:14px}
    .card-body{padding:32px}
    .lbl{display:block;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
    .lbl-row{display:flex;align-items:center;justify-content:space-between;margin-top:20px}
    .forgot{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
    .forgot:hover{color:var(--cyan)}
    .field{position:relative;display:flex;align-items:center}
    .field .ico{position:absolute;left:14px;color:var(--dim);display:flex}
    .field input{width:100%;height:52px;background:var(--navy);border:1px solid var(--border);border-radius:8px;
      padding:0 44px;color:var(--text);font-size:14px;font-family:inherit;outline:none;transition:border-color .15s,box-shadow .15s}
    .field input::placeholder{color:rgba(148,163,184,.5)}
    .field input:focus{border-color:var(--cyan);box-shadow:0 0 0 2px rgba(37,99,235,.35)}
    .eye{position:absolute;right:8px;height:36px;width:36px;display:flex;align-items:center;justify-content:center;
      background:transparent;border:none;color:var(--dim);cursor:pointer}
    .eye:hover{color:var(--text)}
    .aes{display:flex;align-items:center;gap:12px;margin:20px 0;padding:12px 14px;border:1px solid var(--border);border-radius:8px;background:rgba(255,255,255,.02)}
    .aes .s{color:var(--cyan);display:flex}
    .aes .t{font-size:12px;font-weight:600}
    .aes .sub{font-size:11px;color:var(--muted)}
    .btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:52px;margin-top:4px;
      background:var(--blue);border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:600;font-family:inherit;
      cursor:pointer;box-shadow:0 10px 24px rgba(37,99,235,.25);transition:background .15s}
    .btn:hover{background:var(--blue-h)}
    /* Path A escape hatch — mobile client only (see the #if around it). */
    .alt{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;
      min-height:52px;border:1px solid var(--border);border-radius:8px;
      color:var(--text);font-size:15px;font-weight:600;text-decoration:none}
    .unable{text-align:center;margin:20px 0 0;font-size:13px;color:var(--muted)}
    .unable a{color:var(--text);font-weight:600}
    .alert{margin-bottom:20px;padding:10px 12px;border-radius:8px;font-size:13px}
    .alert-error{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#FCA5A5}
    .alert-success{background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:#6EE7B7}
    .alert-warning,.alert-info{background:rgba(37,99,235,.1);border:1px solid rgba(37,99,235,.3);color:#93C5FD}
    /* Badges + footer */
    .badges{display:flex;gap:28px;color:var(--dim);font-size:11px;letter-spacing:.02em}
    .badges span{display:inline-flex;align-items:center;gap:6px}
    .footer{display:flex;align-items:center;justify-content:space-between;padding:18px 48px;border-top:1px solid var(--border);
      color:var(--dim);font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
    .footer .links{display:flex;gap:24px}
    @media (max-width:640px){.topbar,.footer{padding-left:20px;padding-right:20px}.topnav .item.hide,.footer .links{display:none}}
  </style>
</head>
<body>
  <header class="topbar">
    <img src="${url.resourcesPath}/img/wordmark.png" alt="Construction OS">
    <nav class="topnav">
      <span class="item hide">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" stroke-linecap="round"/><path d="M12 17h.01" stroke-linecap="round"/></svg>
        ${msg("cosSupport")}
      </span>
      <span class="item"><span class="dot"></span>${msg("cosSystemStatus")}</span>
    </nav>
  </header>

  <main class="main">
    <div class="card">
      <div class="card-head">
        <div class="logo-box"><img src="${url.resourcesPath}/img/logo-mark.png" alt=""></div>
        <h1>${msg("loginAccountTitle")}</h1>
        <p>${msg("cosSubtitle")}</p>
      </div>
      <div class="card-body">
        <#if message?? && message.summary?has_content>
          <div class="alert alert-${message.type}">${kcSanitize(message.summary)?no_esc}</div>
        </#if>

        <form id="kc-form-login" action="${url.loginAction}" method="post">
          <label class="lbl" for="username">${msg("cosEmailLabel")}</label>
          <div class="field">
            <span class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span>
            <input id="username" name="username" type="text" value="${(login.username)!''}" placeholder="${msg('cosEmailPlaceholder')}" autofocus autocomplete="username" tabindex="1">
          </div>

          <div class="lbl-row">
            <label class="lbl" style="margin:0" for="password">${msg("password")}</label>
            <#if realm.resetPasswordAllowed>
              <a class="forgot" href="${url.loginResetCredentialsUrl}" tabindex="5">${msg("doForgotPassword")}</a>
            </#if>
          </div>
          <div class="field">
            <span class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>
            <input id="password" name="password" type="password" placeholder="••••••••" autocomplete="current-password" tabindex="2">
            <button type="button" class="eye" aria-label="Show password" onclick="cosTogglePw()" tabindex="3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>

          <div class="aes">
            <span class="s"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg></span>
            <div><div class="t">${msg("cosAesTitle")}</div><div class="sub">${msg("cosAesSub")}</div></div>
          </div>

          <input type="hidden" id="id-hidden-input" name="credentialId" value="<#if auth?? && auth.selectedCredential?has_content>${auth.selectedCredential}</#if>">
          <button id="kc-login" name="login" type="submit" class="btn" tabindex="4">
            ${msg("doLogIn")}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
          </button>
        </form>

        <#-- Way back to Path A. Only the mobile client gets it: mockup/00_login_flow/mobile/03 offers
             "Login with phone (OTP)" as the escape from this page, while the web mockup (…/web/03)
             has no such control — the browser's own back button serves there. Keycloak serves one
             page to both, so gate it on the client. `cos://oauth2redirect` is the app's AuthSession
             redirect (see apps/mobile/src/app/(auth)/login.tsx); returning to it without a code
             cancels the OIDC request and drops the user back on the login screen. -->
        <#if client?? && client.clientId?? && client.clientId == "cos-mobile">
          <a class="alt" href="cos://oauth2redirect">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>
            ${msg("cosLoginWithPhone")}
          </a>
        </#if>

        <p class="unable">${msg("cosUnable")} <a href="#">${msg("cosContactAdmin")}</a></p>
      </div>
    </div>

    <div class="badges">
      <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6l-8-3Z"/></svg>${msg("cosSoc2")}</span>
      <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6 19Z"/></svg>${msg("cosGdpr")}</span>
      <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>${msg("cosIso")}</span>
    </div>
  </main>

  <footer class="footer">
    <span>${msg("cosFooterUnit")}</span>
    <div class="links">
      <span>${msg("cosTerms")}</span>
      <span>${msg("cosPrivacy")}</span>
      <span>${msg("cosSystemStatus")}</span>
    </div>
  </footer>

  <script>
    function cosTogglePw(){var p=document.getElementById('password');if(p){p.type=p.type==='password'?'text':'password';}}
  </script>
</body>
</html>
