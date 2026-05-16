/* ============================================================
   QR.js — QR generation + scanner integration
   ============================================================ */
(function(){
  const QR = {
    generate(text, container, size=160){
      container.innerHTML = '';
      try{
        new QRCode(container, { text, width:size, height:size, correctLevel:QRCode.CorrectLevel.H });
      }catch(e){
        container.textContent = text;
      }
    },
    startScanner(elementId, onScan){
      if (typeof Html5Qrcode === 'undefined'){
        UI.toast('مكتبة QR Scanner غير متاحة','error'); return null;
      }
      const scanner = new Html5Qrcode(elementId);
      scanner.start({ facingMode:'environment' },
        { fps:10, qrbox:{ width:250, height:250 } },
        decoded => { onScan(decoded); },
        () => {}
      ).catch(err => UI.toast('فشل تشغيل الكاميرا: '+err,'error'));
      return scanner;
    },
    stopScanner(scanner){ try{ scanner?.stop(); }catch(_){} }
  };
  window.QR = QR;
})();
