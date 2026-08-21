// ==========================================
// 🚀 نظام استقبال الأوامر المركزي (الطلب الأول + العداد)
// ==========================================
(function initNinjaCommandReceiver() {
    let wsCmd;
    let localConfig = { targetSec: 0, targetMs: 0, isArmed: false, enableFirstRequest: false };
    
    let hasFiredFirstRequest = false; 
    let hasFiredTimer = false;
    let timerLoop = null;

    // مهلة الانتظار للطلب الأول (نفس القيمة التي كنت تستخدمها سابقاً 5.8 ثواني)
    const delayMs = 5800; 

    function connectWs() {
        wsCmd = new WebSocket('ws://localhost:8080');
        
        wsCmd.onopen = () => console.log("[🥷 NINJA] متصل بالسيرفر المركزي لتلقي الأوامر.");
        
        wsCmd.onmessage = (e) => {
            try {
                let data = JSON.parse(e.data);
                if (data.action === 'SYNC_TIMER_CONFIG') {
                    localConfig = data.config;
                    console.log("[🥷 NINJA] تم تحديث الإعدادات من السيرفر:", localConfig);
                    evaluateState();
                }
            } catch (err) { }
        };

        wsCmd.onclose = () => setTimeout(connectWs, 2000);
    }

    // دالة إرسال الطلب الأوتوماتيكي الأول (طلب الدخول الأول)
    function attemptFirstRequest() {
        if (hasFiredFirstRequest) return;

        const SLOT_SELECTOR = 'div[id][style*="padding: 10px"][style*="border-radius: 5px"]';
        const slotDivs = document.querySelectorAll(SLOT_SELECTOR);

        if (slotDivs.length > 0 && typeof apptDate_A !== 'undefined' && typeof data_1 !== 'undefined') {
            
            // 🛑 الفحص الذهبي: إذا كان السيرفر يقول (لا ترسل)، سنتوقف هنا تماماً ولن نرسل!
            if (!localConfig.enableFirstRequest) {
                console.log("[🥷 NINJA] 🛑 أمر السيرفر: التوقف في الصفحة وعدم إرسال الطلب الأول.");
                return;
            }

            // إذا كان مسموحاً، نقوم بالإرسال
            hasFiredFirstRequest = true;
            const targetSlotId = slotDivs[0].id;
            
            console.log("[🥷 NINJA] 🚀 إطلاق طلب الدخول الأول الأوتوماتيكي (استهلاك التوكن الأول)!");
            let from_Data = btn_submit_milyoudas(data_1, apptDate_A, targetSlotId, getBestAvailableToken());
            
            fetch_Mily(from_Data).then(status => {
                checkAppointmentIndividual(targetSlotId);
            });
            
            showStatusMessage(`✅ تم إرسال طلب الدخول الأول بنجاح`, "#4caf50");
        } else {
            // المحاولة مجدداً إذا لم تظهر الساعات بعد
            setTimeout(attemptFirstRequest, 300);
        }
    }

    function evaluateState() {
        // 1. نظام العداد المتزامن (الضربة الثانية المحمية)
        if (localConfig.isArmed) {
            if (!timerLoop && !hasFiredTimer) {
                let submitBtn = document.getElementById('btnSubmit') || document.getElementById('btnSubmit_milyoudas');
                if (!submitBtn) return; // ننتظر حتى تحمل الصفحة بالكامل

                console.log(`[🥷 NINJA] ⏳ العداد يتربص للثانية ${localConfig.targetSec} والميلي ${localConfig.targetMs}`);
                
                timerLoop = setInterval(() => {
                    if (hasFiredTimer || !localConfig.isArmed) {
                        clearInterval(timerLoop);
                        timerLoop = null;
                        return;
                    }

                    let d = new Date();
                    if (d.getSeconds() === localConfig.targetSec && d.getMilliseconds() >= localConfig.targetMs) {
                        hasFiredTimer = true;
                        clearInterval(timerLoop);
                        timerLoop = null;
                        
                        console.log(`[🥷 NINJA] 🎯 تطابق الوقت! إطلاق الضربة المركزية للعداد!`);
                        submitBtn.click(); // الضغط لاستهلاك التوكن الثاني (الاحتياطي)
                    }
                }, 5); // دقة متناهية كل 5 ميلي ثانية
            }
        } else {
            // إيقاف العداد إذا ضغطت "إيقاف" من السيرفر
            if (timerLoop) {
                clearInterval(timerLoop);
                timerLoop = null;
                console.log("[🥷 NINJA] 🛑 تم إيقاف العداد من السيرفر.");
            }
            hasFiredTimer = false; // إعادة الضبط ليكون جاهزاً
        }
    }

    // بدء الاتصال
    connectWs();

    // تشغيل محاولة إرسال الطلب الأول (مع احترام مهلة الـ 5800 ملي ثانية الخاصة بك)
    setTimeout(attemptFirstRequest, delayMs);

    // فحص دوري للعداد لضمان تفاعله حتى لو تأخر تحميل الزر
    setInterval(() => {
        if (localConfig.isArmed && !hasFiredTimer) {
            evaluateState();
        }
    }, 500);

})();
