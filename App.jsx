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
  Share2,
  FileSpreadsheet,
  ArrowRightLeft,
  CheckSquare,
  Square,
  Image as ImageIcon,
  Upload,
  Eye
} from 'lucide-react';

// Инициализация Firebase
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'facade-constructor-pro';

const apiKey = "const apiKey = process.env.REACT_APP_GEMINI_KEY || "";  

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
  const [viewImage, setViewImage] = useState(null); // Модалка для просмотра фото
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

  const [formData, setFormData] = useState({ 
    height: '', 
    width: '', 
    count: '1', 
    type: 'solid', 
    note: '',
    photo: null 
  });
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
    
    const realArea = items.reduce((acc, item) => {
        const h = Math.max(0, Number(item.height));
        const w = Math.max(0, Number(item.width));
        const c = Math.max(0, Number(item.count));
        return acc + (h * w * c) / 1000000;
    }, 0);
    
    let roundedAreaForPrice = 1;
    if (realArea > 0) {
      if (realArea < 1) {
        roundedAreaForPrice = 1;
      } else {
        const integerPart = Math.floor(realArea);
        const decimalPart = realArea - integerPart;
        roundedAreaForPrice = decimalPart < 0.5 ? integerPart : integerPart + 1;
      }
    }

    const complexTypes = ['integrated', 'grille', 'panno', 'multi_panels', 'yoke', 'plinth', 'column', 'custom'];
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

  const handlePhotoUpload = (e, isForm = true, itemId = null) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      if (isForm) {
        setFormData(prev => ({ ...prev, photo: base64 }));
      } else if (itemId && user) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', itemId), { photo: base64 });
      }
    };
    reader.readAsDataURL(file);
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
        const prompt = `Анализируй фото заказа. Извлеки JSON список деталей: [{"height": число, "width": число, "count": число}]. Тип всегда "solid". Поле note должно быть пустым. Только JSON.`;
        
        const fetchWithRetry = async (url, options, retries = 5, backoff = 1000) => {
          try {
            const res = await fetch(url, options);
            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
            return await res.json();
          } catch (err) {
            if (retries > 0) {
              await new Promise(r => setTimeout(r, backoff));
              return fetchWithRetry(url, options, retries - 1, backoff * 2);
            }
            throw err;
          }
        };

        const result = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: file.type, data: base64Data } }] }] })
        });

        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
          const cleanJson = textResponse.replace(/```json|```/g, '').trim();
          const parsedItems = JSON.parse(cleanJson);
          const baseTime = Date.now();
          const batch = writeBatch(db);
          
          parsedItems.forEach((item, i) => {
            if (item.height > 0 && item.width > 0) {
              const newDocRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'currentOrder'));
              batch.set(newDocRef, {
                height: item.height, 
                width: item.width, 
                count: item.count > 0 ? item.count : 1, 
                type: 'solid', 
                note: '', // Всегда пусто по требованию пользователя
                photo: null,
                createdAt: baseTime + i
              });
            }
          });
          await batch.commit();
        }
      } catch (err) { 
        console.error("Scanning error:", err);
      } finally { 
        setIsScanning(false); 
        e.target.value = ''; 
      }
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
      photo: formData.photo,
      createdAt: Date.now()
    });
    setFormData({ height: '', width: '', count: '1', type: 'solid', note: '', photo: null });
    heightRef.current?.focus();
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

  const sendToWhatsApp = () => {
    const text = `📐 *ЗАКАЗ ФАСАДОВ*\n` +
      `🏷️ Модель: ${orderMeta.facadeName || 'Не указано'}\n` +
      `📏 Толщина: ${orderMeta.thickness || 'Не указано'} мм\n\n` + 
      sortedItems.map((item, i) => `${i+1}. ${item.height}x${item.width} мм — ${item.count}шт (${FACADE_TYPES.find(t => t.id === item.type)?.name})${item.note ? ` [${item.note}]` : ''}${item.photo ? ' 📸 (+эскиз)' : ''}`).join('\n') +
      `\n\n--- ИТОГО ---\n📏 Факт. площадь: ${calculation.area} м²\n💰 Сумма: ${calculation.total} ₽`;
    const cleanPhone = config.managerPhone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
    setShowShareModal(false);
  };

  const cleanNumericInput = (val, allowFloat = true) => {
    if (!val) return '';
    let cleaned = val.replace(/,/g, '.');
    if (cleaned.startsWith('.')) cleaned = cleaned.substring(1);
    cleaned = allowFloat ? cleaned.replace(/[^0-9.]/g, '') : cleaned.replace(/[^0-9]/g, '');
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
        {/* ВЕРХНЯЯ ПАНЕЛЬ: МЕТА ДАННЫЕ */}
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
            <div className="flex gap-2 h-[52px]">
                <label className={`w-12 flex items-center justify-center border-2 border-dashed rounded-xl cursor-pointer transition-all ${formData.photo ? 'border-emerald-500 bg-emerald-50' : 'hover:border-black'}`}>
                    {formData.photo ? <img src={formData.photo} className="w-full h-full object-cover rounded-lg" /> : <ImageIcon className="w-5 h-5 text-zinc-300" />}
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handlePhotoUpload(e)} />
                </label>
                <button onClick={handleAddItem} className="px-8 bg-black text-white rounded-xl font-black uppercase text-[10px] hover:bg-zinc-800 transition-all shadow-lg">Добавить</button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <input type="text" placeholder="Примечание..." className="flex-1 bg-zinc-50 border rounded-xl px-4 py-3 text-xs italic outline-none focus:ring-1 focus:ring-black" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} />
            
            <div className="flex gap-2">
              {items.length > 0 && !isConverted && (
                <button onClick={convertCmToMm} className="flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition-all shadow-sm">
                  <ArrowRightLeft className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase">СМ → ММ</span>
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

        {/* ТАБЛИЦА СПИСКА */}
        <section className="bg-white rounded-[2rem] border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-zinc-50 text-[9px] font-black uppercase text-zinc-400 border-b">
                <tr>
                  <th className="px-4 py-4 text-left w-10">
                    <button onClick={() => {
                        if (selectedIds.length === items.length) setSelectedIds([]);
                        else setSelectedIds(items.map(i => i.id));
                    }} className="p-1 hover:bg-zinc-200 rounded transition-colors">
                      {selectedIds.length === items.length && items.length > 0 ? <CheckSquare className="w-5 h-5 text-black" /> : <Square className="w-5 h-5" />}
                    </button>
                  </th>
                  <th className="px-4 py-4 text-center">Выс (мм)</th>
                  <th className="px-4 py-4 text-center">Шир (мм)</th>
                  <th className="px-4 py-4 text-center">Шт</th>
                  <th className="px-6 py-4 text-left">Тип</th>
                  <th className="px-6 py-4 text-left">Примечание</th>
                  <th className="px-6 py-4 text-center">Эскиз/Фото</th>
                  <th className="px-6 py-4 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {items.length === 0 ? (
                  <tr><td colSpan="8" className="py-20 text-center text-zinc-200 font-black uppercase tracking-widest">Список пуст</td></tr>
                ) : (
                  sortedItems.map(item => (
                    <tr key={item.id} className={`hover:bg-zinc-50/50 group transition-colors ${selectedIds.includes(item.id) ? 'bg-zinc-100/50' : ''}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])} className="p-1">
                          {selectedIds.includes(item.id) ? <CheckSquare className="w-5 h-5 text-black" /> : <Square className="w-5 h-5 text-zinc-300 group-hover:text-zinc-400" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-bold">
                        <input type="text" className="w-16 bg-transparent text-center outline-none focus:bg-white focus:ring-1 focus:ring-black rounded" value={item.height} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', item.id), { height: cleanNumericInput(e.target.value, false) })} />
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-bold">
                        <input type="text" className="w-16 bg-transparent text-center outline-none focus:bg-white focus:ring-1 focus:ring-black rounded" value={item.width} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', item.id), { width: cleanNumericInput(e.target.value, false) })} />
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        <input type="text" className="w-10 bg-transparent text-center outline-none focus:bg-white focus:ring-1 focus:ring-black rounded" value={item.count} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', item.id), { count: cleanNumericInput(e.target.value, false) })} />
                      </td>
                      <td className="px-6 py-3">
                         <select className="text-[10px] font-black uppercase px-2 py-1 bg-zinc-100 rounded-md outline-none" value={item.type} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', item.id), { type: e.target.value })}>
                            {FACADE_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                         </select>
                      </td>
                      <td className="px-6 py-3 italic text-xs">
                         <input type="text" className="w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-black rounded px-2 py-1" value={item.note || ''} placeholder="..." onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', item.id), { note: e.target.value })} />
                      </td>
                      <td className="px-6 py-3 text-center">
                        <div className="flex justify-center">
                            <label className={`w-10 h-10 flex items-center justify-center border rounded-xl cursor-pointer hover:bg-zinc-100 transition-all overflow-hidden ${item.photo ? 'border-emerald-200' : 'border-dashed border-zinc-200'}`}>
                                {item.photo ? (
                                    <div className="relative w-full h-full group/img" onClick={(e) => { e.preventDefault(); setViewImage(item.photo); }}>
                                        <img src={item.photo} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-all">
                                            <Eye className="w-4 h-4 text-white" />
                                        </div>
                                    </div>
                                ) : (
                                    <Upload className="w-4 h-4 text-zinc-300" />
                                )}
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handlePhotoUpload(e, false, item.id)} />
                            </label>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right">
                         <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'currentOrder', item.id))} className="text-zinc-200 hover:text-red-500 p-2 transition-colors">
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
            <div className="p-8 bg-zinc-900 text-white flex flex-col md:flex-row justify-between items-end gap-6">
              <div className="space-y-4 w-full md:w-auto">
                <div>
                  <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">Факт. площадь</p>
                  <p className="text-2xl font-mono">{calculation.area} м²</p>
                </div>
                {selectedIds.length > 0 && (
                    <button onClick={deleteSelected} className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors">
                        <Trash2 className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Удалить выбранные ({selectedIds.length})</span>
                    </button>
                )}
              </div>
              <div className="text-right w-full md:w-auto">
                <p className="text-[10px] text-zinc-500 uppercase font-black mb-1">Итого (округл. {calculation.roundedArea} м²)</p>
                <p className="text-6xl font-black tracking-tighter leading-none">{calculation.total.toLocaleString()} ₽</p>
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

      {/* МОДАЛЬНОЕ ОКНО ПРОСМОТРА ФОТО */}
      {viewImage && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[110] flex items-center justify-center p-4" onClick={() => setViewImage(null)}>
            <div className="relative max-w-4xl max-h-[90vh] flex items-center justify-center">
                <button className="absolute -top-12 right-0 text-white p-2 hover:bg-white/10 rounded-full transition-all">
                    <X className="w-8 h-8" />
                </button>
                <img src={viewImage} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />
            </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО ОТПРАВКИ */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="font-black uppercase tracking-widest text-sm text-zinc-400">Экспорт заказа</h3>
                    <button onClick={() => setShowShareModal(false)} className="p-2 hover:bg-zinc-100 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3">
                    <button onClick={sendToWhatsApp} className="w-full bg-[#25D366] text-white p-5 rounded-2xl font-black flex items-center justify-center gap-3 uppercase text-[10px] tracking-widest shadow-lg shadow-green-100">
                        <Phone className="w-4 h-4" /> WhatsApp Менеджеру
                    </button>
                    <button onClick={() => {
                        const headers = ["№", "Выс", "Шир", "Шт", "Тип", "Примеч"];
                        const rows = sortedItems.map((it, i) => [i+1, it.height, it.width, it.count, it.type, it.note]);
                        const csv = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n");
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.download = "заказ.csv";
                        link.click();
                        setShowShareModal(false);
                    }} className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black flex items-center justify-center gap-3 uppercase text-[10px] tracking-widest shadow-lg shadow-blue-100">
                        <FileSpreadsheet className="w-4 h-4" /> Скачать в Excel (CSV)
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* НАСТРОЙКИ */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="font-black uppercase tracking-widest text-sm text-zinc-400">Цены и Контакты</h3>
                    <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-100 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block">Телефон менеджера</label>
                        <input type="text" className="w-full bg-zinc-50 border rounded-2xl px-5 py-4 font-bold" value={config.managerPhone} onChange={e => setConfig({...config, managerPhone: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest">Цена за 1 м² (₽)</label>
                        <input type="number" className="w-full bg-zinc-50 border rounded-2xl px-5 py-4 font-bold" value={config.pricePerM2} onChange={e => setConfig({...config, pricePerM2: Number(e.target.value)})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block">1-я фреза (₽)</label>
                            <input type="number" className="w-full bg-zinc-50 border rounded-2xl px-5 py-4 font-bold" value={config.firstSizeExtra} onChange={e => setConfig({...config, firstSizeExtra: Number(e.target.value)})} />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block">След. фреза (₽)</label>
                            <input type="number" className="w-full bg-zinc-50 border rounded-2xl px-5 py-4 font-bold" value={config.nextSizeExtra} onChange={e => setConfig({...config, nextSizeExtra: Number(e.target.value)})} />
                        </div>
                    </div>
                    <button onClick={() => setShowSettings(false)} className="w-full bg-black text-white p-5 rounded-2xl font-black uppercase text-[10px] tracking-widest mt-4">Сохранить</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;