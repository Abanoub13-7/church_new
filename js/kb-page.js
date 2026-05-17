/* ============================================================
   KB.PAGE.js — Knowledge Base
   ============================================================ */
(function(){
  if (!App.init('knowledge-base')) return;
  const session = Auth.session();
  const isSuper = session.role==='super_admin';
  function render(){
    const arts = Support.kbList();
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">قاعدة المعرفة</h1>
        <p class="page-subtitle">دلائل، أسئلة شائعة، واستكشاف الأخطاء</p></div>
        ${isSuper?'<div><button class="btn btn-primary" id="new"><i class="fa-solid fa-plus"></i> مقال جديد</button></div>':''}
      </div>
      <div class="grid grid-3">
        ${arts.map(a=>`<div class="card" style="cursor:pointer" data-id="${a.article_id}">
          <h3 style="margin-top:0">${a.title}</h3>
          <span class="badge blue">${a.category}</span>
          <p class="muted" style="font-size:.85rem">${(a.body||'').slice(0,120)}...</p>
          <small class="muted">${a.views||0} مشاهدة</small>
        </div>`).join('')||'<p class="muted">لا توجد مقالات</p>'}
      </div>
    `);
    if (isSuper) document.getElementById('new').onclick = ()=> edit();
    document.querySelectorAll('[data-id]').forEach(c => c.onclick = ()=> view(c.dataset.id));
  }
  function view(id){
    const a = Support.kbGet(id);
    UI.modal(`<h3>${a.title}</h3><span class="badge blue">${a.category}</span>
      <div style="margin:1rem 0;line-height:1.8;white-space:pre-wrap">${a.body}</div>
      <div style="text-align:left">
        ${isSuper?`<button class="btn btn-ghost" id="ed">تعديل</button>
        <button class="btn btn-red" id="del">حذف</button>`:''}
        <button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button>
      </div>`);
    if (isSuper){
      document.getElementById('ed').onclick = ()=>{ UI.closeModal(); edit(a); };
      document.getElementById('del').onclick = ()=>{ if(confirm('حذف؟')){ Support.kbDelete(id); UI.closeModal(); render(); } };
    }
  }
  function edit(a){
    a = a||{};
    UI.modal(`<h3>${a.article_id?'تعديل':'مقال جديد'}</h3>
      <label>العنوان</label><input id="t" class="input" value="${a.title||''}">
      <label>التصنيف</label>
      <select id="c" class="input">
        ${['onboarding','faq','guide','troubleshooting','release'].map(x=>`<option value="${x}" ${a.category===x?'selected':''}>${x}</option>`).join('')}
      </select>
      <label>المحتوى</label><textarea id="b" class="input" rows="10">${a.body||''}</textarea>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="ok">حفظ</button></div>`);
    document.getElementById('ok').onclick = ()=>{
      Support.kbUpsert({ article_id:a.article_id, title:t.value, category:c.value, body:b.value });
      UI.toast('تم الحفظ','success'); UI.closeModal(); render();
    };
  }
  render();
})();
