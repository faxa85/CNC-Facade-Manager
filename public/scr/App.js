import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  Trash2, 
  Settings, 
  Loader2,
  X,
  Camera,
  Phone,
  CheckCircle2,
  Share2,
  FileSpreadsheet,
  ArrowRightLeft,
  CheckSquare,
  Square
} from 'lucide-react';

// Инициализация Firebase
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'facade-constructor-pro';
const apiKey = process.env.REACT_APP_GEMINI_KEY || ""; 

const FACADE_TYPES = [
  { id: 'solid', name: 'Глухой' },
  { id: 'integrated', name: 'С интеграцией' },
  { id: 'glass', name: 'Стекло' },
  { id: 'drawer', name: 'Ящик' },
  { id: 'viborka', name: 'Выборка' },
  { id: 'raw', name: 'Без обработки' },
  { id: 'grille', name: 'Решетка' },
  { id: 'panno', name: 'Панно' },
  { id: 'multi_panels', name: 'Несколько филёнок' },
  { id: 'yoke', name: 'Коромысло' },
  { id: 'plinth', name: 'Цоколь' },
  { id: 'column', name: 'Колонна' },
  { id: 'custom', name: 'Нестандарт' },
];

const UNITS = [
  { id: 'mm', name: 'мм', factor: 1 },
  { id: 'cm', name: 'см', factor: 10 },
  { id: 'm', name: 'м', factor: 1000 },
];

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [inputUnit, setInputUnit] = useState('mm'); 
  const [showShareModal, setShowShareModal] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [isConverted, setIsConverted] = useState(false); 

  const [orderMeta, setOrderMeta] = useState({
    facadeName: '',
    thickness: '',
  });

  const [config, setConfig] = useState({
    managerPhone: '79285316645',
    pricePerM2: 200, 
    firstSizeExtra: 200,
    nextSizeExtra: 100,
  });

  const [formData, setFormData] = useState({ height: '', width: '', count: '1', type: 'solid', note: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const heightRef = useRef(null);
  const widthRef = useRef(null);
  const countRef = useRef(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error("Auth error", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const metaRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'orderMeta');
    getDoc(metaRef).then(docSnap => {
      if (docSnap.exists()) setOrderMeta(docSnap.data());
    });
    const q = collection(db, 'artifacts', appId, 'users', user.uid, 'currentOrder');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(newItems);
      if (newItems.length === 0) setIsConverted(false);
    }, (error) => console.error("Firestore error:", error));
    return () => unsubscribe();
  }, [user]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.createdAt - b.createdAt);
  }, [items]);

  const updateOrderMeta = async (field, value) => {
    const newMeta = { ...orderMeta, [field]: value };
    setOrderMeta(newMeta);
    if (user) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'orderMeta'), newMeta);
  };

  const calculation = useMemo(() => {
    if (items.length === 0) return { area: 0, roundedArea: 0, complexityExtra: 0, total: 0 };
    
    // Считаем точную фактическую площадь в м2
    const realArea = items.reduce((acc, item) => {
        const h = Math.max(0, Number(item.height));
        const w = Math.max(0, Number(item.width));
        const c = Math.max(0, Number(item.count));
        return acc + (h * w * c) / 1000000;
    }, 0);
    
    // ЛОГИКА ОКРУГЛЕНИЯ:
    // 1. Если < 1 -> 1
    // 2. Если дробная часть < 0.5 -> целое в меньшую сторону (floor)
    // 3. Если дробная часть >= 0.5 -> целое в большую сторону (ceil)
    
    let roundedAreaForPrice = 1;
    if (realArea > 0) {
      if (realArea < 1) {
        roundedAreaForPrice = 1;
      } else {
        const integerPart = Math.floor(realArea);
        const decimalPart = realArea - integerPart;
        
        // Пример: 7.08 -> 0.08 < 0.5 -> 7
        // Пример: 7.5 -> 0.5 >= 0.5 -> 8
        if (decimalPart < 0.5) {
          roundedAreaForPrice = integerPart;
        } else {
          roundedAreaForPrice = integerPart + 1;
        }
      }
    }

    const complexTypes = [
      'integrated', 'grille', 'panno', 'multi_panels', 'yoke', 'plinth', 'column', 'custom'
    ];
    
    const complexItems = items.filter(i => complexTypes.includes(i.type));
    
    let complexityExtra = 0;
    if (complexItems.length > 0) {
      const uniqueSizes = new Set(complexItems.map(item => `${item.height}x${item.width}`));
      complexityExtra = config.firstSizeExtra + (uniqueSizes.size - 1) * config.nextSizeExtra;
    }
    
    return {
      area: realArea.toFixed(3), 
      roundedArea: roundedAreaForPrice,
      complexityExtra,
      total: Math.round((roundedAreaForPrice * config.pricePerM2) + complexityExtra),
    };
  }, [items, config]);

  const handleFileUploadForItem = async (id, e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', id), {
        file: { data: reader.result, name: file.name }
      });
    };
    reader.readAsDataURL(file);
  };

  const convertCmToMm = async () => {
    if (!user || items.length === 0 || isConverted) return;
    const batch = writeBatch(db);
    items.forEach(item => {
      const itemRef = doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', item.id);
      batch.update(itemRef, {
        height: Math.round(Number(item.height) * 10),
        width: Math.round(Number(item.width) * 10)
      });
    });
    await batch.commit();
    setIsConverted(true);
  };

  const handleScanImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsScanning(true);
    setIsConverted(false);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result.split(',')[1];
      try {
        const prompt = `Анализируй фото заказа. Извлеки JSON список деталей: [{"height": число, "width": число, "count": число, "note": "текст"}]. Все изделия должны иметь тип "solid". Соблюдай порядок деталей точно как в списке. Только JSON.`;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64Data } }] }] })
        });
        const result = await response.json();
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
          const cleanJson = textResponse.replace(/```json|```/g, '').trim();
          const parsedItems = JSON.parse(cleanJson);
          const baseTime = Date.now();
          for (let i = 0; i < parsedItems.length; i++) {
            const item = parsedItems[i];
            if (item.height > 0 && item.width > 0) {
              await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'currentOrder'), {
                height: item.height, 
                width: item.width, 
                count: item.count > 0 ? item.count : 1, 
                type: 'solid', 
                note: item.note || '', 
                createdAt: baseTime + i,
                file: null
              });
            }
          }
        }
      } catch (err) { console.error(err); } finally { setIsScanning(false); e.target.value = ''; }
    };
    reader.readAsDataURL(file);
  };

  const handleAddItem = async () => {
    const hRaw = String(formData.height).replace(',', '.');
    const wRaw = String(formData.width).replace(',', '.');
    const h = Number(hRaw);
    const w = Number(wRaw);
    const c = Number(formData.count);
    if (!user || isNaN(h) || h <= 0 || isNaN(w) || w <= 0) return;
    const factor = UNITS.find(u => u.id === inputUnit).factor;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'currentOrder'), {
      height: Math.round(h * factor), 
      width: Math.round(w * factor), 
      count: isNaN(c) || c <= 0 ? 1 : c, 
      type: formData.type, 
      note: formData.note, 
      file: null, 
      createdAt: Date.now()
    });
    setFormData({ ...formData, height: '', width: '', count: '1', note: '' });
    heightRef.current?.focus();
  };

  const updateItem = async (id, field, value) => {
    let finalValue = value;
    if (['height', 'width', 'count'].includes(field)) {
        const num = Number(String(value).replace(',', '.'));
        finalValue = isNaN(num) ? value : num;
    }
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', id), { [field]: finalValue });
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) setSelectedIds([]);
    else setSelectedIds(items.map(i => i.id));
  };

  const deleteSelected = async () => {
    if (!user || selectedIds.length === 0) return;
    const batch = writeBatch(db);
    selectedIds.forEach(id => {
      batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', id));
    });
    await batch.commit();
    setSelectedIds([]);
  };

  const exportToExcel = () => {
    const headers = ["№", "Высота (мм)", "Ширина (мм)", "Кол-во (шт)", "Тип", "Примечание"];
    const rows = sortedItems.map((item, index) => [
      index + 1,
      item.height,
      item.width,
      item.count,
      FACADE_TYPES.find(t => t.id === item.type)?.name,
      (item.note || "").replace(/;/g, ',')
    ]);
    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Заказ_${orderMeta.facadeName || 'детали'}.csv`;
    link.click();
    setShowShareModal(false);
  };

  const sendToWhatsApp = () => {
    const text = `📐 *ЗАКАЗ ФАСАДОВ*\n` +
      `🏷️ Модель: ${orderMeta.facadeName || 'Не указано'}\n` +
      `📏 Толщина: ${orderMeta.thickness || 'Не указано'} мм\n\n` + 
      sortedItems.map((item, i) => `${i+1}. ${item.height}x${item.width} мм — ${item.count}шт (${FACADE_TYPES.find(t => t.id === item.type)?.name})${item.note ? ` [${item.note}]` : ''}`).join('\n') +
      `\n\n--- ИТОГО ---\n📏 Факт. площадь: ${calculation.area} м²\n💰 Сумма (окур.): ${calculation.total} ₽`;
    const cleanPhone = config.managerPhone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
    setShowShareModal(false);
  };

  const cleanNumericInput = (val, allowFloat = true) => {
    if (!val) return '';
    let cleaned = val.replace(/,/g, '.');
    if (cleaned.startsWith('.')) cleaned = cleaned.substring(1);
    if (allowFloat) {
      const parts = cleaned.split('.');
      if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
      cleaned = cleaned.replace(/[^0-9.]/g, '');
    } else {
      cleaned = cleaned.replace(/[^0-9]/g, '');
    }
    return cleaned;
  };

  const handleSmartNavigation = (e, currentField) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentField === 'height' && formData.height) widthRef.current?.focus();
      else if (currentField === 'width' && formData.width) countRef.current?.focus();
      else if (currentField === 'count' && formData.height && formData.width) handleAddItem();
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><Loader2 className="animate-spin text-zinc-400 w-8 h-8" /></div>;

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 font-sans pb-10 text-[13px]">
      <header className="bg-white border-b px-6 py-4 sticky top-0 z-40 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-black text-base">F</div>
          <h1 className="font-black text-xs uppercase tracking-widest hidden sm:block">Конструктор Фасадов Pro</h1>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-2 text-zinc-400 hover:text-black transition-colors"><Settings className="w-5 h-5" /></button>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        {/* МЕТА ДАННЫЕ */}
        <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row gap-6 items-center">
            <div className="flex bg-zinc-100 p-1.5 rounded-2xl w-full md:w-auto">
              {UNITS.map(u => (
                <button key={u.id} onClick={() => setInputUnit(u.id)} className={`px-8 py-3 rounded-xl text-xs font-black uppercase transition-all ${inputUnit === u.id ? 'bg-white shadow-md text-black ring-1 ring-zinc-200' : 'text-zinc-400'}`}>{u.name}</button>
              ))}
            </div>
            <div className="flex-1 flex gap-4 w-full">
              <div className="flex-1">
                <label className="text-[10px] font-black uppercase text-zinc-400 mb-1 block">Модель фасада</label>
                <input type="text" placeholder="Название модели" className="w-full bg-zinc-50 border rounded-xl px-4 py-3 font-bold uppercase outline-none focus:ring-1 focus:ring-black" value={orderMeta.facadeName} onChange={e => updateOrderMeta('facadeName', e.target.value)} />
              </div>
              <div className="w-24">
                <label className="text-[10px] font-black uppercase text-zinc-400 mb-1 block">Толщина</label>
                <input type="number" placeholder="мм" className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-center font-mono outline-none focus:ring-1 focus:ring-black" value={orderMeta.thickness} onChange={e => updateOrderMeta('thickness', e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        {/* ФОРМА ВВОДА */}
        <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[100px]">
              <label className="text-[10px] font-black uppercase text-zinc-400 mb-1 block">Высота</label>
              <input ref={heightRef} type="text" inputMode="decimal" className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-lg font-mono outline-none focus:ring-2 focus:ring-black" value={formData.height} onChange={e => setFormData({...formData, height: cleanNumericInput(e.target.value)})} onKeyDown={e => handleSmartNavigation(e, 'height')} />
            </div>
            <div className="flex-1 min-w-[100px]">
              <label className="text-[10px] font-black uppercase text-zinc-400 mb-1 block">Ширина</label>
              <input ref={widthRef} type="text" inputMode="decimal" className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-lg font-mono outline-none focus:ring-2 focus:ring-black" value={formData.width} onChange={e => setFormData({...formData, width: cleanNumericInput(e.target.value)})} onKeyDown={e => handleSmartNavigation(e, 'width')} />
            </div>
            <div className="w-16">
              <label className="text-[10px] font-black uppercase text-zinc-400 mb-1 block text-center">Шт</label>
              <input ref={countRef} type="text" inputMode="numeric" className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-lg font-mono text-center font-bold outline-none focus:ring-2 focus:ring-black" value={formData.count} onChange={e => setFormData({...formData, count: cleanNumericInput(e.target.value, false)})} onKeyDown={e => handleSmartNavigation(e, 'count')} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-[10px] font-black uppercase text-zinc-400 mb-1 block">Вид фасада</label>
              <select className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-xs font-bold uppercase h-[52px] outline-none" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                {FACADE_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button onClick={handleAddItem} className="px-8 py-4 bg-black text-white rounded-xl font-black uppercase text-[10px] h-[52px] hover:bg-zinc-800 transition-all shadow-lg">Добавить</button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <input type="text" placeholder="Примечание к детали..." className="flex-1 bg-zinc-50 border rounded-xl px-4 py-3 text-xs italic outline-none focus:ring-1 focus:ring-black" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} />
            
            <div className="flex gap-2">
              {items.length > 0 && !isConverted && (
                <button onClick={convertCmToMm} className="flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition-all shadow-sm">
                  <ArrowRightLeft className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase">Конвертировать СМ → ММ</span>
                </button>
              )}
              <label className={`flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all ${isScanning ? 'bg-zinc-100 opacity-50' : 'bg-white hover:border-black'}`}>
                 {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 text-emerald-500" />}
                 <span className="text-[10px] font-black uppercase">Фото списка</span>
                 <input type="file" className="hidden" accept="image/*" disabled={isScanning} onChange={handleScanImage} />
              </label>
            </div>
          </div>
        </section>

        {/* ПАНЕЛЬ МАССОВЫХ ДЕЙСТВИЙ */}
        {selectedIds.length > 0 && (
          <div className="bg-black text-white p-4 rounded-2xl flex items-center justify-between animate-in slide-in-from-top-4 duration-300 shadow-xl">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="font-bold">Выбрано: {selectedIds.length} поз.</span>
            </div>
            <button 
              onClick={deleteSelected}
              className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500 text-red-100 px-4 py-2 rounded-xl transition-all font-black uppercase text-[10px]"
            >
              <Trash2 className="w-4 h-4" /> Удалить выбранное
            </button>
          </div>
        )}

        {/* ТАБЛИЦА */}
        <section className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-zinc-50 text-[9px] font-black uppercase text-zinc-400 border-b">
                <tr>
                  <th className="px-4 py-4 text-left w-10">
                    <button onClick={toggleSelectAll} className="p-1 hover:bg-zinc-200 rounded transition-colors">
                      {selectedIds.length === items.length && items.length > 0 ? <CheckSquare className="w-5 h-5 text-black" /> : <Square className="w-5 h-5" />}
                    </button>
                  </th>
                  <th className="px-4 py-4 text-center">Выс (мм)</th>
                  <th className="px-4 py-4 text-center">Шир (мм)</th>
                  <th className="px-4 py-4 text-center">Шт</th>
                  <th className="px-6 py-4 text-left">Тип фасада</th>
                  <th className="px-6 py-4 text-left">Примечание</th>
                  <th className="px-6 py-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {items.length === 0 ? (
                  <tr><td colSpan="7" className="py-20 text-center text-zinc-200 font-black uppercase tracking-widest">Список пуст</td></tr>
                ) : (
                  sortedItems.map(item => (
                    <tr key={item.id} className={`hover:bg-zinc-50/50 group transition-colors ${selectedIds.includes(item.id) ? 'bg-zinc-100/50' : ''}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(item.id)} className="p-1">
                          {selectedIds.includes(item.id) ? <CheckSquare className="w-5 h-5 text-black" /> : <Square className="w-5 h-5 text-zinc-300 group-hover:text-zinc-400" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                         <input type="text" inputMode="decimal" className="w-16 text-center bg-transparent outline-none font-mono font-bold text-base focus:text-black border-b border-transparent focus:border-zinc-200" value={item.height} onChange={e => updateItem(item.id, 'height', cleanNumericInput(e.target.value))} />
                      </td>
                      <td className="px-4 py-3 text-center">
                         <input type="text" inputMode="decimal" className="w-16 text-center bg-transparent outline-none font-mono font-bold text-base focus:text-black border-b border-transparent focus:border-zinc-200" value={item.width} onChange={e => updateItem(item.id, 'width', cleanNumericInput(e.target.value))} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input type="text" inputMode="numeric" className="w-10 text-center bg-zinc-50 rounded-lg py-1 font-bold outline-none" value={item.count} onChange={e => updateItem(item.id, 'count', cleanNumericInput(e.target.value, false))} />
                      </td>
                      <td className="px-6 py-3">
                        <select 
                          className={`text-[10px] font-black uppercase px-2 py-1 rounded-md outline-none transition-colors ${[
                            'integrated', 'grille', 'panno', 'multi_panels', 'yoke', 'plinth', 'column', 'custom'
                          ].includes(item.type) ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100'}`} 
                          value={item.type} 
                          onChange={e => updateItem(item.id, 'type', e.target.value)}
                        >
                          {FACADE_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>
                      <td className="px-6 py-3">
                        <input type="text" className="w-full bg-transparent border-b border-transparent focus:border-zinc-200 outline-none italic text-xs text-zinc-500" value={item.note || ''} onChange={e => updateItem(item.id, 'note', e.target.value)} placeholder="..." />
                      </td>
                      <td className="px-6 py-3 text-right flex items-center justify-end gap-3">
                        {item.file ? (
                          <div className="relative group/img flex items-center">
                            <div onClick={() => setPreviewImage(item.file.data)} className="w-10 h-10 rounded-lg overflow-hidden border-2 border-emerald-500 cursor-pointer shadow-sm hover:scale-110 transition-transform bg-zinc-100">
                              <img src={item.file.data} alt="Превью" className="w-full h-full object-cover" />
                            </div>
                            <button onClick={() => updateItem(item.id, 'file', null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-lg opacity-0 group-hover/img:opacity-100 transition-opacity scale-75">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer p-2 rounded-lg text-zinc-300 hover:text-emerald-500 transition-all hover:bg-zinc-100 border border-transparent hover:border-zinc-200">
                            <Camera className="w-5 h-5" />
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUploadForItem(item.id, e)} />
                          </label>
                        )}
                        <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', item.id))} className="text-zinc-200 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {items.length > 0 && (
            <div className="p-8 bg-zinc-900 text-white flex justify-between items-end">
              <div className="space-y-4">
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">Факт. площадь</p>
                  <p className="text-2xl font-mono">{calculation.area} м²</p>
                </div>
                {calculation.complexityExtra > 0 && (
                  <div>
                    <p className="text-[9px] text-amber-500 uppercase font-black tracking-widest">Наценка за сложность</p>
                    <p className="text-2xl font-mono text-amber-400">+{calculation.complexityExtra} ₽</p>
                  </div>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] text-zinc-500 uppercase font-black mb-1">Итого (с округл. {calculation.roundedArea} м²)</p>
                <p className="text-6xl font-black tracking-tighter">{calculation.total.toLocaleString()} ₽</p>
              </div>
            </div>
          )}
        </section>

        {items.length > 0 && (
          <button onClick={() => setShowShareModal(true)} className="w-full bg-black text-white py-6 rounded-[2.5rem] font-black flex items-center justify-center gap-3 uppercase text-xs tracking-widest hover:scale-[1.01] transition-all shadow-2xl">
            <Share2 className="w-5 h-5" /> Поделиться заказом
          </button>
        )}
      </main>

      {previewImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-6 right-6 p-3 bg-white/10 text-white rounded-full hover:bg-white/20">
            <X className="w-8 h-8" />
          </button>
          <div className="max-w-4xl max-h-[85vh] relative" onClick={e => e.stopPropagation()}>
            <img src={previewImage} alt="Full view" className="max-w-full max-h-full rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 object-contain" />
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowShareModal(false)}>
          <div className="bg-white rounded-[3rem] w-full max-w-sm p-10 space-y-8 animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b pb-4">
              <h3 className="font-black uppercase text-xs tracking-widest text-zinc-400">Экспорт заказа</h3>
              <button onClick={() => setShowShareModal(false)} className="p-2 bg-zinc-100 rounded-full hover:bg-zinc-200 transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <button onClick={sendToWhatsApp} className="w-full flex items-center gap-6 p-6 bg-emerald-50 rounded-3xl hover:bg-emerald-100 transition-all border border-emerald-100">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                  <Phone className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="font-black uppercase text-[10px] text-emerald-600">WhatsApp</p>
                  <p className="text-xs text-zinc-500">Отправить менеджеру</p>
                </div>
              </button>
              <button onClick={exportToExcel} className="w-full flex items-center gap-6 p-6 bg-zinc-50 rounded-3xl hover:bg-zinc-100 transition-all border border-zinc-100">
                <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-white">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="font-black uppercase text-[10px] text-zinc-600">Excel / CSV</p>
                  <p className="text-xs text-zinc-500">Скачать файл</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] w-full max-w-sm p-10 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-4">
              <h3 className="font-black uppercase text-xs tracking-widest">Конфигурация</h3>
              <button onClick={() => setShowSettings(false)} className="p-2 bg-zinc-100 rounded-full"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-zinc-400 uppercase block mb-1">WhatsApp менеджера</label>
                <input type="text" className="w-full p-4 bg-zinc-50 border rounded-xl font-mono" value={config.managerPhone} onChange={e => setConfig({...config, managerPhone: e.target.value})} />
              </div>
              <div>
                <label className="text-[9px] font-black text-zinc-400 uppercase block mb-1">Цена за м² (₽)</label>
                <input type="number" className="w-full p-4 bg-zinc-50 border rounded-xl font-mono" value={config.pricePerM2} onChange={e => setConfig({...config, pricePerM2: Number(e.target.value)})} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-black text-zinc-400 uppercase block mb-1">Первый размер (₽)</label>
                  <input type="number" className="w-full p-4 bg-zinc-50 border rounded-xl font-mono text-center" value={config.firstSizeExtra} onChange={e => setConfig({...config, firstSizeExtra: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-[9px] font-black text-zinc-400 uppercase block mb-1">Повтор (₽)</label>
                  <input type="number" className="w-full p-4 bg-zinc-50 border rounded-xl font-mono text-center" value={config.nextSizeExtra} onChange={e => setConfig({...config, nextSizeExtra: Number(e.target.value)})} />
                </div>
              </div>
            </div>
            <button onClick={() => setShowSettings(false)} className="w-full bg-black text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest">Сохранить</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;