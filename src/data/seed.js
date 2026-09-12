// Demo seed data: sites, stations, work orders, technicians.
// Extracted from app.js (Phase 0a-1).

export const initial = {
  view: "dashboard", selectedWork: "WO-2048", selectedTech: "Ayşe Demir", completed: 27,
  // Assignments dispatched to technicians' phones (core/notify.js). Empty at
  // seed: the demo shows them arriving when the planner publishes a day.
  techNotifications: [],
  // Stock and its movement log are loaded from Supabase (repo/inventory.js).
  // Nine invented products with invented lot numbers, prices and two frozen
  // movements used to sit here. They were replaced at runtime, but a slow or
  // failed load left the fabrication on screen as if it were this company's
  // warehouse — which is exactly the failure mode worth removing at source.
  inventory: [],
  inventoryTransactions: [],
  // Invoices come from the invoices table (repo/billing.js) and technician
  // hourly rates from technician_rates. Two invented invoices and four demo
  // technicians' ₺/hour rates used to sit here; a rate that is not this
  // company's produces a labour cost that is not this company's, and that cost
  // is what the profit margin is computed from.
  invoices: [],
  techRates: {},
  sites: [
    { 
      id:"s1", company:"Acme Foods", name:"Gebze Üretim Tesisi", city:"Kocaeli", score:62, state:"risk", issues:3, last:"12 Tem · Ayşe Demir", next:"Bugün, 14:30", color:"#e8d8c7",
      sector: "Gıda Üretimi & Depolama",
      address: "Gebze OSB, 41400 Gebze/Kocaeli",
      contact: { name: "Ahmet Yılmaz", phone: "+90 532 123 4567", email: "ahmet@acmefoods.com" },
      methods: [
        { name: "Kemirgen İstasyon Kontrolü", desc: "Tesis dış çevresinde kilitli yem istasyonları ile kemirgen mücadelesi.", active: true },
        { name: "Yürüyen Haşere İzleme", desc: "Hammadde depolarında yapışkan pheromone tuzakları.", active: true },
        { name: "Uçan Haşere UV Işıklı Cihazlar", desc: "Ambalaj hattında yapışkan bantlı UV cihaz denetimi.", active: true },
        { name: "Rezidüel Bariyer İlaçlaması", desc: "Kritik giriş kapılarında kalıcı sıvı ilaç uygulaması.", active: false }
      ],
      files: [
        { name: "Hizmet_Sozlesmesi_2026.pdf", type: "pdf", size: "1.2 MB", date: "02 Ocak 2026" },
        { name: "Tesis_Risk_Analizi_Raporu.pdf", type: "pdf", size: "3.4 MB", date: "15 Ocak 2026" },
        { name: "Biyosidal_Urun_Izin_Belgeleri.pdf", type: "pdf", size: "850 KB", date: "12 Şubat 2026" }
      ],
      stations: [
        { code:"R-01", type:"rodent", x:15, y:22, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"R-02", type:"rodent", x:45, y:28, checked:true, status:"clean", baitStatus:"replaced", pestType:"none", pestCount:0, notes:"" },
        { code:"R-03", type:"rodent", x:75, y:24, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"C-01", type:"crawler", x:20, y:72, checked:true, status:"activity", baitStatus:"consumed", pestType:"cockroach", pestCount:4, notes:"Hammadde deposu girişinde yoğunlaşma var." },
        { code:"C-02", type:"crawler", x:50, y:78, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"F-01", type:"flying", x:80, y:68, checked:true, status:"activity", baitStatus:"intact", pestType:"fly", pestCount:12, notes:"Atık alanı yakınındaki cihaz kontrol edilmeli." },
        { code:"ILT-01", type:"insect_light_trap", x:35, y:48, checked:true, status:"damaged", baitStatus:"missing", pestType:"none", pestCount:0, notes:"UV ampulü patlak, yenilenmesi gerek." },
        { code:"ILT-02", type:"insect_light_trap", x:65, y:52, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" }
      ],
      serviceScope: {
        outdoorRodent: { frequency: 2, unit: 'ay', seasonNote: '' },
        indoorRodent: { frequency: 4, unit: 'ay', seasonNote: '' },
        crawlingPest: { frequency: 4, unit: 'ay', seasonNote: '' },
        flyingPest: { frequency: 4, unit: 'ay', seasonNote: 'Nisan-Ekim: 4/ay, Kasım-Mart: 2/ay' },
        storagePest: { frequency: 4, unit: 'ay', seasonNote: '' }
      },
      contract: { taxOffice: 'Gebze VD', taxNo: '1234567890', annualPrice: 48000, monthlyPrice: 4000, extraVisitPrice: 750, emergencyCallPrice: 1500, period: '01.01.2026 - 31.12.2026' },
      chemicalsUsed: [
        { id: 'cu1', chemicalId: 'ch1', date: '12 Tem 2026', quantity: '250 ml', area: '500 m²', tech: 'Ayşe Demir', notes: 'Dış çevre rezidüel bariyer uygulaması' },
        { id: 'cu2', chemicalId: 'ch3', date: '12 Tem 2026', quantity: '400 gr', area: '20 istasyon', tech: 'Ayşe Demir', notes: 'Kemirgen yem istasyonlarına yem yerleştirme' },
        { id: 'cu3', chemicalId: 'ch2', date: '28 Haz 2026', quantity: '35 gr', area: '120 m²', tech: 'Mert Kaya', notes: 'Hammadde deposu hamamböceği jel uygulaması' }
      ]
    },
    { 
      id:"s2", company:"Kuzey Lojistik", name:"Hadımköy Dağıtım Merkezi", city:"İstanbul", score:68, state:"risk", issues:2, last:"11 Tem · Mert Kaya", next:"Bugün, 16:00", color:"#d8e9e4",
      sector: "Lojistik & Depolama",
      address: "Hadımköy, 34555 Arnavutköy/İstanbul",
      contact: { name: "Banu Gök", phone: "+90 541 456 7890", email: "bgok@kuzeylojistik.com.tr" },
      methods: [
        { name: "Kemirgen İstasyon Kontrolü", desc: "Tesis dış çevresinde kilitli yem istasyonları ile kemirgen mücadelesi.", active: true },
        { name: "Yürüyen Haşere İzleme", desc: "Depo içlerinde yapışkan pheromone tuzakları.", active: true },
        { name: "Uçan Haşere UV Işıklı Cihazlar", desc: "Kabul bölümünde UV cihaz denetimi.", active: false }
      ],
      files: [
        { name: "Lojistik_Servis_Sozlesmesi.pdf", type: "pdf", size: "980 KB", date: "10 Ocak 2026" },
        { name: "Hadimkoy_Kroki_Haritasi.pdf", type: "pdf", size: "2.1 MB", date: "11 Ocak 2026" }
      ],
      stations: [
        { code:"R-01", type:"rodent", x:12, y:18, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"R-02", type:"rodent", x:38, y:22, checked:true, status:"clean", baitStatus:"replaced", pestType:"none", pestCount:0, notes:"" },
        { code:"R-03", type:"rodent", x:62, y:19, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"R-04", type:"rodent", x:88, y:25, checked:true, status:"activity", baitStatus:"consumed", pestType:"mouse", pestCount:1, notes:"A-3 kapısı dış çevresinde kemirilme var." },
        { code:"C-01", type:"crawler", x:22, y:58, checked:true, status:"activity", baitStatus:"consumed", pestType:"cockroach", pestCount:2, notes:"Yükleme rampasında yürüye haşere var." },
        { code:"C-02", type:"crawler", x:72, y:62, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"F-01", type:"flying", x:50, y:82, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" }
      ]
    },
    { 
      id:"s3", company:"Aster Hospital", name:"Ataşehir Kampüsü", city:"İstanbul", score:74, state:"watch", issues:1, last:"12 Tem · Ece Yılmaz", next:"14 Tem, 09:00", color:"#e8e0f5",
      sector: "Sağlık & Hastane",
      address: "Ataşehir, 34758 İstanbul",
      contact: { name: "Dr. Selim Tekin", phone: "+90 533 987 6543", email: "selim.tekin@asterhospital.com" },
      methods: [
        { name: "Kemirgen Kokusuz Jel Uygulaması", desc: "Kritik mutfak ve sterilizasyon alanlarında jel ilaçlama.", active: true },
        { name: "Yürüyen Haşere İzleme", desc: "Koridor ve sosyal alanlarda yapışkan tuzaklar.", active: true },
        { name: "UV Cihaz Denetimi", desc: "Yemekhane bölümünde UV ışıklı tuzaklar.", active: true }
      ],
      files: [
        { name: "Hastane_Hijyen_Sertifikasi.pdf", type: "pdf", size: "1.5 MB", date: "05 Şubat 2026" },
        { name: "Biyosidal_Urun_Bildirim_Formu.pdf", type: "pdf", size: "430 KB", date: "20 Şubat 2026" }
      ],
      stations: [
        { code:"R-01", type:"rodent", x:18, y:32, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"R-02", type:"rodent", x:48, y:38, checked:true, status:"clean", baitStatus:"replaced", pestType:"none", pestCount:0, notes:"" },
        { code:"R-03", type:"rodent", x:78, y:34, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"C-01", type:"crawler", x:32, y:72, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"C-02", type:"crawler", x:62, y:78, checked:true, status:"activity", baitStatus:"intact", pestType:"other", pestCount:1, notes:"Gümüşcün böceği görüldü, ilaçlama yapıldı." },
        { code:"ILT-01", type:"insect_light_trap", x:52, y:18, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" }
      ]
    },
    { 
      id:"s4", company:"Bora Retail", name:"Levent Merkez Mağaza", city:"İstanbul", score:81, state:"watch", issues:0, last:"10 Tem · Can Öztürk", next:"15 Tem, 11:00", color:"#f4e6bf",
      sector: "Perakende & Mağazacılık",
      address: "Levent, 34330 Beşiktaş/İstanbul",
      contact: { name: "Mustafa Çelik", phone: "+90 535 765 4321", email: "mustafa.celik@boraretail.com" },
      methods: [
        { name: "Yürüyen Haşere İzleme", desc: "Raf ve reyon altlarında yapışkan tuzaklar.", active: true },
        { name: "Uçan Haşere UV Işıklı Cihazlar", desc: "Depo girişinde UV sinek tuzağı.", active: true }
      ],
      files: [
        { name: "Bora_Merkez_Sozlesme.pdf", type: "pdf", size: "750 KB", date: "15 Aralık 2025" }
      ],
      stations: [
        { code:"R-01", type:"rodent", x:22, y:22, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"R-02", type:"rodent", x:78, y:24, checked:true, status:"clean", baitStatus:"replaced", pestType:"none", pestCount:0, notes:"" },
        { code:"C-01", type:"crawler", x:28, y:68, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"C-02", type:"crawler", x:72, y:72, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"F-01", type:"flying", x:50, y:48, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" }
      ]
    },
    { 
      id:"s5", company:"Novatek", name:"Çayırova Ar-Ge Merkezi", city:"Kocaeli", score:91, state:"healthy", issues:0, last:"12 Tem · Mert Kaya", next:"18 Tem, 10:30", color:"#d7e9f4",
      sector: "Ar-Ge & Laboratuvar",
      address: "Çayırova, 41420 Kocaeli",
      contact: { name: "Eren Demir", phone: "+90 530 234 5678", email: "eren.demir@novatek.io" },
      methods: [
        { name: "Kemirgen İstasyon Kontrolü", desc: "Tesis dış çevresinde kilitli yem istasyonları.", active: true },
        { name: "Yürüyen Haşere İzleme", desc: "Laboratuvar girişlerinde yapışkan tuzaklar.", active: true }
      ],
      files: [
        { name: "Novatek_Hizmet_Protokolu.pdf", type: "pdf", size: "1.1 MB", date: "10 Ocak 2026" }
      ],
      stations: [
        { code:"R-01", type:"rodent", x:20, y:24, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"R-02", type:"rodent", x:50, y:22, checked:true, status:"clean", baitStatus:"replaced", pestType:"none", pestCount:0, notes:"" },
        { code:"R-03", type:"rodent", x:80, y:26, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"C-01", type:"crawler", x:30, y:72, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"C-02", type:"crawler", x:70, y:74, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"ILT-01", type:"insect_light_trap", x:50, y:48, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" }
      ]
    },
    { 
      id:"s6", company:"Orion Hotels", name:"Taksim Otel", city:"İstanbul", score:88, state:"healthy", issues:0, last:"11 Tem · Ece Yılmaz", next:"19 Tem, 13:30", color:"#f0dbe2",
      sector: "Turizm & Otelcilik",
      address: "Taksim, 34437 Beyoğlu/İstanbul",
      contact: { name: "Selin Şen", phone: "+90 542 345 6789", email: "selin.sen@orionhotels.com" },
      methods: [
        { name: "Jel İlaçlama Uygulaması", desc: "Mutfak ve depo alanlarında yürüyen haşere jeli.", active: true },
        { name: "Fly Trap Cihaz Denetimi", desc: "Lobi ve restaurant alanlarında dekoratif UV cihazları.", active: true },
        { name: "Kemirgen İstasyon Kontrolü", desc: "Kazan dairesi ve dış çevre kontrol noktaları.", active: true }
      ],
      files: [
        { name: "Orion_Taksim_Servis_Sozlesmesi.pdf", type: "pdf", size: "1.4 MB", date: "28 Aralık 2025" }
      ],
      stations: [
        { code:"R-01", type:"rodent", x:18, y:26, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"R-02", type:"rodent", x:48, y:22, checked:true, status:"clean", baitStatus:"replaced", pestType:"none", pestCount:0, notes:"" },
        { code:"R-03", type:"rodent", x:78, y:28, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"C-01", type:"crawler", x:32, y:68, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"C-02", type:"crawler", x:68, y:72, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"ILT-01", type:"insect_light_trap", x:50, y:48, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" }
      ]
    },
    {
      id:"s7", company:"Acme Foods", name:"İzmir Soğuk Hava Deposu", city:"İzmir", score:77, state:"watch", issues:1, last:"11 Tem · Ece Yılmaz", next:"16 Tem, 10:00", color:"#d7e9f4",
      sector: "Gıda Üretimi & Depolama",
      address: "Kemalpaşa OSB, 35730 Kemalpaşa/İzmir",
      contact: { name: "Ahmet Yılmaz", phone: "+90 532 123 4567", email: "ahmet@acmefoods.com" },
      methods: [
        { name: "Kemirgen İstasyon Kontrolü", desc: "Soğuk hava deposu dış çevresinde kilitli yem istasyonları.", active: true },
        { name: "Yürüyen Haşere İzleme", desc: "Yükleme koridorlarında yapışkan pheromone tuzakları.", active: true },
        { name: "Uçan Haşere UV Işıklı Cihazlar", desc: "Sevkiyat kabul alanında UV cihaz denetimi.", active: true }
      ],
      files: [
        { name: "Acme_Izmir_Servis_Sozlesmesi.pdf", type: "pdf", size: "1.1 MB", date: "04 Ocak 2026" }
      ],
      stations: [
        { code:"R-01", type:"rodent", x:16, y:24, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"R-02", type:"rodent", x:52, y:26, checked:true, status:"clean", baitStatus:"replaced", pestType:"none", pestCount:0, notes:"" },
        { code:"R-03", type:"rodent", x:82, y:22, checked:true, status:"activity", baitStatus:"consumed", pestType:"mouse", pestCount:1, notes:"Sevkiyat kapısı çevresinde kemirgen izi." },
        { code:"C-01", type:"crawler", x:28, y:70, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"C-02", type:"crawler", x:68, y:74, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"F-01", type:"flying", x:50, y:50, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" }
      ],
      serviceScope: {
        outdoorRodent: { frequency: 2, unit: 'ay', seasonNote: '' },
        indoorRodent: { frequency: 4, unit: 'ay', seasonNote: '' },
        crawlingPest: { frequency: 4, unit: 'ay', seasonNote: '' },
        flyingPest: { frequency: 4, unit: 'ay', seasonNote: 'Nisan-Ekim: 4/ay, Kasım-Mart: 2/ay' },
        storagePest: { frequency: 4, unit: 'ay', seasonNote: '' }
      },
      contract: { taxOffice: 'Gebze VD', taxNo: '1234567890', annualPrice: 39600, monthlyPrice: 3300, extraVisitPrice: 650, emergencyCallPrice: 1300, period: '01.01.2026 - 31.12.2026' }
    },
    {
      id:"s8", company:"Acme Foods", name:"Ankara Dağıtım Merkezi", city:"Ankara", score:86, state:"healthy", issues:0, last:"10 Tem · Can Öztürk", next:"17 Tem, 09:30", color:"#d8e9e4",
      sector: "Gıda Üretimi & Depolama",
      address: "Başkent OSB, 06909 Sincan/Ankara",
      contact: { name: "Ahmet Yılmaz", phone: "+90 532 123 4567", email: "ahmet@acmefoods.com" },
      methods: [
        { name: "Kemirgen İstasyon Kontrolü", desc: "Dağıtım merkezi dış çevresinde kilitli yem istasyonları.", active: true },
        { name: "Yürüyen Haşere İzleme", desc: "Depo içlerinde yapışkan pheromone tuzakları.", active: true }
      ],
      files: [
        { name: "Acme_Ankara_Servis_Sozlesmesi.pdf", type: "pdf", size: "980 KB", date: "04 Ocak 2026" }
      ],
      stations: [
        { code:"R-01", type:"rodent", x:20, y:24, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"R-02", type:"rodent", x:50, y:22, checked:true, status:"clean", baitStatus:"replaced", pestType:"none", pestCount:0, notes:"" },
        { code:"R-03", type:"rodent", x:80, y:26, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"C-01", type:"crawler", x:30, y:72, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"C-02", type:"crawler", x:70, y:74, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
        { code:"ILT-01", type:"insect_light_trap", x:50, y:48, checked:true, status:"clean", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" }
      ],
      serviceScope: {
        outdoorRodent: { frequency: 2, unit: 'ay', seasonNote: '' },
        indoorRodent: { frequency: 4, unit: 'ay', seasonNote: '' },
        crawlingPest: { frequency: 4, unit: 'ay', seasonNote: '' },
        flyingPest: { frequency: 4, unit: 'ay', seasonNote: 'Nisan-Ekim: 4/ay, Kasım-Mart: 2/ay' },
        storagePest: { frequency: 4, unit: 'ay', seasonNote: '' }
      },
      contract: { taxOffice: 'Gebze VD', taxNo: '1234567890', annualPrice: 42000, monthlyPrice: 3500, extraVisitPrice: 680, emergencyCallPrice: 1400, period: '01.01.2026 - 31.12.2026' }
    }
  ],
  work: [
    {id:"WO-2048", siteId:"s1", title:"Kemirgen aktivitesi — acil inceleme", site:"Acme Foods · Gebze Üretim Tesisi", priority:"critical", type:"Kritik bulgu", visitType:"AC", due:"Bugün, 14:30", tech:"Ayşe Demir", description:"R-12 yem istasyonunda yüksek kemirgen aktivitesi tespit edildi. Alanın incelenmesi ve aksiyon planının kayıt altına alınması gerekiyor."},
    {id:"WO-2047", siteId:"s2", title:"Yükleme alanı istasyon kontrolü", site:"Kuzey Lojistik · Hadımköy DM", priority:"critical", type:"Kritik bulgu", visitType:"RZ", due:"Bugün, 16:00", tech:"Mert Kaya", description:"Yükleme rampası çevresindeki üç istasyon için kontrol ve yenileme servisi planlandı."},
    {id:"WO-2045", siteId:"s3", title:"Periyodik saha servisi", site:"Aster Hospital · Ataşehir Kampüsü", priority:"high", type:"Planlı servis", visitType:"RZ", due:"14 Tem, 09:00", tech:"Ece Yılmaz", description:"Aylık sözleşme kapsamındaki rutin saha servisi ve dijital istasyon denetimi."},
    {id:"WO-2042", siteId:"s4", title:"Müşteri talebi — uçan haşere", site:"Bora Retail · Levent Merkez", priority:"high", type:"Müşteri talebi", visitType:"ES", due:"15 Tem, 11:00", tech:"Can Öztürk", description:"Müşteri tarafından bildirilen uçan haşere aktivitesinin yerinde kontrolü."}
  ]
};

export const techData={"Ayşe Demir":['AD','Müşteride','Gebze Üretim Tesisi','İlk QR 10:11','2 dk önce','#efe5d8'],"Mert Kaya":['MK','Yolda','Hadımköy Dağıtım Merkezi','Son QR 09:42','4 dk önce','#dce9f7'],"Ece Yılmaz":['EY','Müşteride','Taksim Otel','İlk QR 09:36','1 dk önce','#e8dff4'],"Can Öztürk":['CÖ','Rotada','Levent Merkez Mağaza','Son QR 08:58','6 dk önce','#f1e4d5']};
// techSites used to live here: four demo technician names mapped to four
// seeded site ids, used by the Ekip page's "Tesis planını görüntüle" button
// with a hardcoded 's1' fallback for every technician not in the map — which
// was every real one. The button now reads the real site off the technician's
// actual first stop for the day (team.js's todaysStopsFor()).
