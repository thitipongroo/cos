# Deployment Guide

## Pre-Deployment Checklist

### 1. Environment Configuration

Create `.env.production` file:
```bash
cp .env.example .env.production
```

Fill in all required environment variables:
- API endpoint URL
- Firebase configuration
- Google Maps API key
- Sentry DSN for error monitoring

### 2. Backend Requirements

Your backend API must implement these endpoints:

```
POST   /auth/login              - Email/password authentication
POST   /auth/biometric          - Biometric authentication
POST   /auth/refresh            - Refresh access token
POST   /auth/logout             - Logout

GET    /tasks                   - Get all tasks
GET    /tasks/:id               - Get task by ID
PUT    /tasks/:id               - Update task
POST   /tasks                   - Create task

POST   /reports/daily           - Submit daily report
POST   /reports/issue           - Submit issue report
GET    /reports                 - Get all reports

POST   /photos/upload           - Upload photo
GET    /photos/:id              - Get photo

GET    /procurement             - Get procurement items
POST   /procurement             - Create procurement request

GET    /user/profile            - Get user profile
PUT    /user/profile            - Update user profile

GET    /notifications           - Get notifications
POST   /notifications           - Create notification
PUT    /notifications/:id/read  - Mark as read
```

### 3. Firebase Setup (Push Notifications)

1. Create Firebase project at https://console.firebase.google.com
2. Enable Cloud Messaging
3. Add Web App to project
4. Copy configuration to `.env.production`
5. Generate VAPID key pair
6. Update `notification.service.ts` with Firebase SDK

### 4. Build for Production

```bash
pnpm build
```

Output will be in `dist/` directory.

### 5. Deploy

#### Option A: Vercel
```bash
pnpm add -g vercel
vercel --prod
```

#### Option B: Netlify
```bash
pnpm add -g netlify-cli
netlify deploy --prod
```

#### Option C: AWS S3 + CloudFront
```bash
aws s3 sync dist/ s3://your-bucket-name
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

### 6. Post-Deployment

1. Test all features in production:
   - [ ] Login with real credentials
   - [ ] Submit report (verify API call)
   - [ ] Upload photo
   - [ ] Test offline mode
   - [ ] Verify push notifications
   - [ ] Test biometric login

2. Set up monitoring:
   - [ ] Configure Sentry for errors
   - [ ] Set up uptime monitoring
   - [ ] Configure analytics (Google Analytics, Mixpanel, etc.)

3. Performance:
   - [ ] Run Lighthouse audit (target score > 90)
   - [ ] Test on slow 3G network
   - [ ] Verify service worker caching

## Progressive Web App (PWA)

### Enable PWA

1. Install Vite PWA plugin:
```bash
pnpm add -D vite-plugin-pwa
```

2. Update `vite.config.ts`:
```typescript
import { VitePWA } from 'vite-plugin-pwa';

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Field Operations',
        short_name: 'FieldOps',
        description: 'Mobile-first field operations management',
        theme_color: '#0066FF',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.fieldops\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          }
        ]
      }
    })
  ]
};
```

### Testing PWA

1. Build for production
2. Serve locally: `npx serve dist`
3. Open Chrome DevTools → Application → Service Workers
4. Verify manifest and service worker registration
5. Test "Add to Home Screen"

## Mobile App (Optional)

Convert to native mobile app using Capacitor:

```bash
pnpm add @capacitor/core @capacitor/cli
pnpm add @capacitor/ios @capacitor/android

npx cap init
npx cap add ios
npx cap add android

pnpm build
npx cap sync
npx cap open ios
npx cap open android
```

## SSL Certificate

Always use HTTPS in production:

1. **Free option**: Let's Encrypt via Certbot
2. **Managed option**: CloudFlare SSL
3. **Cloud providers**: AWS Certificate Manager, Google Cloud SSL

## Performance Optimization

### 1. Code Splitting
```typescript
const PhotoAnnotation = lazy(() => import('./components/camera/PhotoAnnotation'));
```

### 2. Image Optimization
```bash
pnpm add -D vite-plugin-imagemin
```

### 3. Bundle Analysis
```bash
pnpm add -D rollup-plugin-visualizer
pnpm build
# Open stats.html
```

## Monitoring

### Sentry Setup
```bash
pnpm add @sentry/react
```

```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 1.0,
});
```

## Rollback Plan

If issues occur in production:

1. Revert to previous deployment:
```bash
vercel rollback
# or
netlify rollback
```

2. Monitor error rate in Sentry
3. Check API logs
4. Verify database integrity

## Support

For deployment issues:
- Check build logs
- Verify environment variables
- Test API endpoints with Postman
- Check browser console for errors
- Review service worker status

---

**Deployment takes ~5 minutes with proper backend setup! 🚀**
