# Church Mega Platform v4.0 — Enterprise SaaS Edition

منصة إدارة الكنائس الشاملة — معمارية احترافية متعددة المستأجرين Multi-Tenant SaaS.

## 🏛️ المعمارية

```
project/
├── index.html              # Landing / Login redirect
├── login.html              # تسجيل الدخول
├── dashboard.html          # لوحة التحكم الرئيسية
├── members.html            # المخدومين
├── users.html              # المستخدمين (حسابات الدخول)
├── attendance.html         # نظام الحضور الذكي
├── events.html             # الفعاليات والحجوزات
├── followup.html           # الافتقاد والمتابعة
├── finance.html            # الماليات
├── workflows.html          # محرك Workflow
├── ai-insights.html        # AI Behavior Engine
├── notifications.html      # الإشعارات
├── settings.html           # الإعدادات
├── super-admin.html        # SaaS Super Admin Dashboard
│
├── css/
│   ├── main.css            # المتغيرات + Reset + Base
│   ├── components.css      # المكونات (Cards, Buttons, Forms, Modals)
│   ├── dashboard.css       # تنسيقات اللوحات
│   └── responsive.css      # Responsive + Dark mode
│
├── js/
│   ├── app.js              # Bootstrap + Router
│   ├── auth.js             # المصادقة وإدارة الجلسات
│   ├── permissions.js      # RBAC + Multi-tenant guards
│   ├── db.js               # طبقة الوصول للبيانات (LocalStorage adapter)
│   ├── dashboard.js
│   ├── attendance.js       # Attendance Engine متعدد الأنشطة
│   ├── events.js
│   ├── followup.js
│   ├── finance.js
│   ├── ai-engine.js        # AI Behavior Analysis + Risk Score
│   ├── workflow-engine.js  # محرك Workflow + Escalation
│   ├── notifications.js
│   ├── qr.js               # QR Check-in
│   ├── whatsapp.js         # WhatsApp Integration
│   └── super-admin.js
│
├── data/
│   ├── schema.js           # تعريف كل الـ Tables (Mock DB Schema)
│   └── mock-data.js        # بيانات تجريبية
│
└── assets/
    ├── icons/
    └── images/
```

## 🗄️ نموذج البيانات (Data Model)

### الفصل المنطقي بين Members و Users

- **Members** = الأشخاص داخل الكنيسة (مخدومين، أطفال، شباب). قد لا يملكون حساب دخول.
- **Users** = أصحاب حسابات الدخول فقط (خدام، إداريين). كل User قد يرتبط بـ Member عبر `member_id`.

### الجداول

| Table | الوصف |
|---|---|
| `churches` | الكنائس المشتركة في المنصة |
| `users` | حسابات الدخول |
| `members` | المخدومين |
| `attendance_sessions` | جلسات الحضور (قداس، اجتماع، رحلة...) |
| `attendance_records` | سجلات الحضور الفردية |
| `events` | الفعاليات |
| `event_bookings` | الحجوزات |
| `followup_tasks` | مهام الافتقاد |
| `followup_logs` | سجل تنفيذ الافتقاد |
| `notifications` | الإشعارات |
| `financial_transactions` | المعاملات المالية |
| `service_classes` | الفصول والخدمات |
| `servant_assignments` | تعيينات الخدام |
| `member_notes` | ملاحظات المخدومين |
| `member_risk_scores` | درجات الخطر (AI) |
| `workflow_actions` | إجراءات Workflow |
| `workflow_history` | سجل تنفيذ Workflows |
| `church_settings` | إعدادات الكنيسة |
| `audit_logs` | سجل التدقيق |

> **كل جدول يحتوي على `church_id`** لضمان عزل بيانات كل كنيسة (Multi-Tenant Isolation).

## 🤖 AI Behavior Engine

يحلل لكل عضو:
- تردد الحضور — `attendance frequency`
- مدة عدم النشاط — `inactivity duration`
- المشاركة في الخدمة — `serving participation`
- الاستجابة للافتقاد — `follow-up response`
- الانتظام المالي — `donation consistency`
- حضور العائلة — `family attendance`

ويُنتج **Risk Score**: `Low | Medium | High | Critical`.

## ⚙️ Workflow Engine

محرك أحداث حقيقي بـ Triggers + Actions + Escalation:

```
Trigger: غاب طفل 3 مرات متتالية
  → إنشاء Follow-up Task
  → إسناده لخادم الفصل
  → بعد 48س بدون تنفيذ → تصعيد للمشرف
  → استمرار الغياب → تصعيد لأمين الخدمة
  → تحديث Risk Score
  → اقتراح رسالة WhatsApp
  → تسجيل كل خطوة في workflow_history
```

## 👑 Super Admin (SaaS Layer)

يرى **بيانات تشغيلية فقط** عن الكنائس (اسم، شعار، اشتراك، عدد المستخدمين، النشاط).

🚫 **لا يرى أبداً**: بيانات الأعضاء، الاعترافات، الافتقاد، الحضور التفصيلي، أو الملاحظات الداخلية.

## 🚀 التشغيل

افتح `index.html` في المتصفح مباشرة — لا يحتاج build step.

بيانات تسجيل دخول تجريبية:
- **Admin كنيسة**: `admin@church.local` / `admin123`
- **Super Admin**: `super@platform.local` / `super123`

## 🛣️ Roadmap للإنتاج

البنية جاهزة للترقية إلى:
- **Frontend**: React + TypeScript
- **Backend**: Node.js + Express / NestJS
- **Database**: PostgreSQL مع RLS (Row-Level Security) لعزل `church_id`
- **Auth**: JWT + Refresh Tokens
- **Storage**: S3 للصور و QR
- **Realtime**: WebSockets للإشعارات
