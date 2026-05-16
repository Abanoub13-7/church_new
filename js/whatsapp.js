/* ============================================================
   WHATSAPP.js — opens WhatsApp Web/App with templated message
   جاهز للاستبدال بـ Cloud API (Meta) لاحقاً
   ============================================================ */
(function(){
  const Templates = {
    welcome: m => `سلام ونعمة 🌹\nأهلاً بك ${m.full_name} في كنيستنا. نتشرف بانضمامك ونتمنى لقاءك دائماً.`,
    absence: m => `سلام ونعمة 🌹\n${m.full_name}، افتقدناك. نتمنى رؤيتك قريباً 🙏`,
    event_reminder: (m,e) => `سلام ونعمة 🌹\nتذكير بفعالية: ${e.title} - ${new Date(e.starts_at).toLocaleString('ar-EG')}`,
    birthday: m => `كل سنة وحضرتك طيب 🎉🎂\n${m.full_name} كل عام وأنت بخير`,
    confession: m => `سلام ونعمة 🌹\n${m.full_name}، تذكير بميعاد الاعتراف هذا الأسبوع 🙏`
  };

  const WhatsApp = {
    Templates,
    send(phone, message){
      if (!phone) return UI.toast('لا يوجد رقم تواصل','error');
      let p = phone.replace(/[^\d]/g,'');
      if (p.startsWith('0')) p = '2'+p; // EG default
      const url = `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
      window.open(url,'_blank');
    },
    sendTemplate(member, templateKey, ...extra){
      const tpl = Templates[templateKey];
      if (!tpl) return UI.toast('قالب غير معروف','error');
      const msg = tpl(member, ...extra);
      const phone = member.phone || member.parent_phone;
      WhatsApp.send(phone, msg);
    }
  };
  window.WhatsApp = WhatsApp;
})();
