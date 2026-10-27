import { cloneElement, createContext, isValidElement, useContext, useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { Archive, ArrowDownToLine, ArrowLeft, BarChart3, Banknote, Barcode, Camera, Check, ChevronDown, CircleAlert, ClipboardList, CreditCard, Eye, House, LockKeyhole, Minus, Package, Palette, Pencil, Plus, Printer, Search, Settings, Share2, ShieldCheck, ShoppingBasket, ShoppingCart, Store, Trash2, TrendingUp, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable, { Table as AutoTableTable } from 'jspdf-autotable';
import JSZip from 'jszip';
import JsBarcode from 'jsbarcode';
import { calculatePromotionDiscounts } from '../shared/promotions';
import { voucherCodePrefix } from '../shared/vouchers';
import homeBanner from './home-banner.svg';
import type { AppState, AuthenticatedEmployee, Employee, EmployeeInput, Expense, Printer as PrinterDevice, Product, ProductInput, ProductUnit, Promotion, PromotionInput, Sale, SaleItem, Section } from '../shared/types';

let money = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
let dateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });
let receiptDate = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short' });
let receiptTime = new Intl.DateTimeFormat('it-IT', { timeStyle: 'short' });
let navbarDate = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
let navbarTime = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
let quantityFormat = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });
let receiptQuantity = quantityFormat;
const roundQuantity = (quantity: number) => Math.round((quantity + Number.EPSILON) * 1000) / 1000;
const colors = ['var(--green)', '#c17e4f', '#658499', '#a9aa64', '#8a7461', '#609085'];
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const safeFilePart = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'Dipendente';
const permanentPromotionEnd = '9999-12-31';
const promotionDurations = ['1 giorno', '3 giorni', '7 giorni', '1 mese', 'Sempre', 'Personalizzata'];
const expenseCategories = ['Affitto', 'Utenze', 'Forniture', 'Stipendi', 'Manutenzione', 'Trasporti', 'Altro'];
const defaultEmployeeRoles = ['Proprietario', 'Direttore', 'Contabilità', 'cassiere'];
type AppLanguage = 'it' | 'ar';
const arabicUiTranslations: Record<string, string> = {
  'ACCESSO AL GESTIONALE': 'تسجيل الدخول إلى النظام', 'Inserisci il PIN di sicurezza': 'أدخل رمز الأمان', 'PIN di sicurezza': 'رمز الأمان',
  'Accedi': 'دخول', 'Accedi con barcode': 'الدخول باستخدام الرمز الشريطي', 'Scansiona il barcode del dipendente per accedere': 'امسح الرمز الشريطي للموظف لتسجيل الدخول',
  'Barcode dipendente': 'الرمز الشريطي للموظف', 'Verifica barcode': 'تحقق من الرمز الشريطي', 'Homepage': 'الرئيسية', 'Magazzino': 'المخزن',
  'Controllo': 'الفحص', 'Storico Magazzino': 'سجل المخزن', 'Carica e scarica merce': 'إدخال وإخراج البضائع', 'Cassa': 'نقطة البيع',
  'Vendite': 'المبيعات', 'Statistiche': 'الإحصاءات', 'Bilancio gestionale': 'الميزانية الإدارية', 'Spese': 'المصروفات',
  'Modifica o Elimina': 'تعديل أو حذف', 'Offerta': 'العروض', 'Promozioni': 'العروض الترويجية', 'Crea buoni sconto': 'إنشاء قسائم الخصم',
  'Lista buoni sconto': 'قائمة قسائم الخصم', 'Dipendenti': 'الموظفون', 'Lista Dipendenti': 'قائمة الموظفين', 'Crea Dipendente': 'إنشاء موظف',
  'Paga Stipendi': 'دفع الرواتب', 'Tracker Dipendenti': 'سجل أنشطة الموظفين', 'Impostazioni': 'الإعدادات', 'GESTIONE NEGOZIO': 'إدارة المتجر',
  'OPERATIVITÀ': 'العمليات', 'GESTIONE EXTRA': 'إدارة إضافية', 'Articoli in magazzino': 'المنتجات في المخزن',
  'articoli registrati': 'منتجات مسجلة', 'Scarica report': 'تنزيل التقرير', 'Aggiungi nuovo articolo': 'إضافة منتج جديد', 'Categoria': 'الفئة',
  'Tutte': 'الكل', 'Disponibilità': 'التوفر', 'Tutto': 'الكل', 'Disponibile': 'متوفر', 'In esaurimento': 'قارب على النفاد',
  'Esaurito': 'نفد', 'Cerca per nome o codice…': 'البحث بالاسم أو الرمز…', 'Avviso date di scadenza': 'تنبيه تواريخ انتهاء الصلاحية',
  'Prodotti scaduti': 'منتجات منتهية الصلاحية', 'Gestisci articoli scaduti': 'إدارة المنتجات منتهية الصلاحية',
  'Nuovo articolo': 'منتج جديد', 'Modifica articolo': 'تعديل المنتج', 'Nome articolo': 'اسم المنتج', 'Codice a barre': 'الرمز الشريطي',
  'Unità di vendita': 'وحدة البيع', 'Prezzo di vendita': 'سعر البيع', 'Prezzo di acquisto': 'سعر الشراء', 'Giacenza': 'المخزون',
  'Soglia minima avviso': 'حد التنبيه الأدنى', 'Gestione data di scadenza': 'إدارة تاريخ انتهاء الصلاحية', 'Data di scadenza': 'تاريخ انتهاء الصلاحية',
  'Nuova categoria': 'فئة جديدة', 'Aggiungi': 'إضافة', 'Salva articolo': 'حفظ المنتج', 'Elimina articolo': 'حذف المنتج',
  'Annulla': 'إلغاء', 'Salva modifiche': 'حفظ التغييرات', 'Cerca per nome o barcode…': 'البحث بالاسم أو الرمز الشريطي…',
  'Cerca con fotocamera': 'البحث بالكاميرا', 'Esporta Excel': 'تصدير Excel', 'Periodo': 'الفترة', 'Dipendente': 'الموظف',
  'Da': 'من', 'A': 'إلى', 'Stampa': 'طباعة', 'Stampa lista': 'طباعة القائمة', 'Scarica lista': 'تنزيل القائمة',
  'Scarica lista Excel': 'تنزيل القائمة بصيغة Excel', 'Data e ora': 'التاريخ والوقت', 'Attività': 'النشاط', 'Sezione': 'القسم', 'Dettagli': 'التفاصيل',
  'Nessuna attività registrata per i filtri selezionati.': 'لا توجد أنشطة مسجلة للفلاتر المحددة.', 'Nessun articolo trovato': 'لم يتم العثور على منتجات',
  'Modifica la ricerca o aggiungi un articolo.': 'عدّل البحث أو أضف منتجًا.', 'Nome': 'الاسم', 'Cognome': 'اسم العائلة', 'Ruolo': 'الدور', 'Sede': 'الفرع',
  'Cerca dipendente, ruolo o sede…': 'البحث عن موظف أو دور أو فرع…', 'Scarica contratti': 'تنزيل العقود', 'Nessun dipendente registrato.': 'لا يوجد موظفون مسجلون.',
  'Nessun dipendente corrisponde alla ricerca.': 'لا يوجد موظفون مطابقون للبحث.', 'Foto del dipendente': 'صورة الموظف', 'Foto documenti': 'صور المستندات',
  'Contratto in PDF': 'العقد بصيغة PDF', 'Seleziona immagine': 'اختيار صورة', 'Aggiungi immagini': 'إضافة صور', 'Età': 'العمر',
  'Sesso': 'الجنس', 'Seleziona sesso': 'اختر الجنس', 'Donna': 'أنثى', 'Uomo': 'ذكر', 'Altro': 'أخرى', 'Indirizzo di casa': 'عنوان المنزل',
  'Indirizzo email': 'البريد الإلكتروني', 'Password iniziale': 'كلمة المرور الأولية', 'Numero di telefono': 'رقم الهاتف', 'Sede Operativa': 'فرع العمل',
  'Seleziona ruolo': 'اختر الدور', 'Turno': 'الوردية', 'Seleziona turno': 'اختر الوردية', 'Mattina': 'صباحًا', 'Pomeriggio': 'مساءً',
  'Notte': 'ليلًا', 'Turno unico': 'وردية واحدة', 'Variabile': 'متغير', 'Metodo di pagamento': 'طريقة الدفع', 'Contanti': 'نقدًا', 'Bonifico': 'تحويل بنكي',
  'IBAN': 'رقم الحساب المصرفي الدولي', 'Stipendio (€)': 'الراتب (€)', 'Codice riconoscimento': 'رمز التعريف', 'Barcode di riconoscimento': 'الرمز الشريطي للتعريف',
  'Elimina dipendente': 'حذف الموظف', 'Crea dipendente': 'إنشاء موظف', 'Nome offerta': 'اسم العرض', 'Sconto': 'الخصم', 'Applicazione': 'التطبيق',
  'Durata offerta': 'مدة العرض', 'Requisito minimo': 'الحد الأدنى المطلوب', 'Nessuno': 'لا يوجد', 'Spesa minima': 'الحد الأدنى للشراء',
  'Crea promozione': 'إنشاء عرض ترويجي', 'Modifica': 'تعديل', 'Elimina': 'حذف', 'Vendite di oggi': 'مبيعات اليوم', 'Netto vendite': 'صافي المبيعات',
  'Articoli venduti': 'المنتجات المباعة', 'scontrini emessi': 'إيصالات صادرة',
  'Verifica dipendente': 'التحقق من الموظف', 'Scansiona o inserisci il barcode del dipendente per aprire il controllo magazzino.': 'امسح أو أدخل الرمز الشريطي للموظف لفتح فحص المخزن.',
  'Numero scontrino': 'رقم الإيصال', 'Cerca numero scontrino…': 'البحث عن رقم الإيصال…', 'Quantità totale': 'الكمية الإجمالية', 'Totale lordo': 'الإجمالي قبل الخصم',
  'Totale netto': 'الإجمالي بعد الخصم', 'Caricamento archivio…': 'جارٍ تحميل الأرشيف…', 'Articolo': 'المنتج', 'Codice': 'الرمز',
  'Prezzo vendita': 'سعر البيع', 'Quantità': 'الكمية', 'Persona': 'الشخص', 'Nota': 'ملاحظة', 'Movimento': 'الحركة', 'Stato': 'الحالة', 'Azione': 'الإجراء',
  'Stipendio': 'الراتب', 'Metodo': 'الطريقة', 'Paga': 'ادفع', 'Ricevuta': 'الإيصال', 'Da pagare': 'غير مدفوع', 'Registra una spesa': 'تسجيل مصروف',
  'Inserisci descrizione, categoria, importo e data.': 'أدخل الوصف والفئة والمبلغ والتاريخ.', 'Descrizione': 'الوصف', 'Importo': 'المبلغ', 'Data': 'التاريخ',
  'Registra spesa': 'تسجيل المصروف', 'Immagine homepage': 'صورة الصفحة الرئيسية', 'Accesso PIN': 'دخول برمز PIN', 'Account locale': 'حساب محلي',
  'Pezzi': 'قطع', 'Affitto': 'إيجار', 'Utenze': 'خدمات', 'Forniture': 'مستلزمات', 'Stipendi': 'رواتب', 'Manutenzione': 'صيانة', 'Trasporti': 'نقل',
  'Dispensa': 'مواد غذائية', 'Freschi': 'منتجات طازجة', 'Bevande': 'مشروبات', 'Surgelati': 'مجمدات', 'Igiene': 'نظافة', 'Frutta e verdura': 'فواكه وخضروات',
  'Proprietario': 'المالك', 'Direttore': 'المدير', 'Contabilità': 'المحاسبة', 'cassiere': 'أمين الصندوق', 'Automatica': 'تلقائي', 'Manuale': 'يدوي',
  'Analisi vendite': 'تحليل المبيعات', 'Gestione prodotti scaduti': 'إدارة المنتجات منتهية الصلاحية',
  'Modifica vendita': 'تعديل البيع', 'Modifica vendita completata': 'تم تعديل البيع', 'Nuova password (opzionale)': 'كلمة مرور جديدة (اختياري)',
  'Annulla modifica': 'إلغاء التعديل', 'Crea forma': 'إنشاء صيغة', 'Percentuale %': 'النسبة المئوية %', 'Applicata': 'تم التطبيق', 'Applica': 'تطبيق',
  'Offerte manuali disponibili': 'العروض اليدوية المتاحة', 'Offerte automatiche applicate': 'العروض التلقائية المطبقة', 'Nessuna offerta automatica applicabile al carrello.': 'لا توجد عروض تلقائية تنطبق على السلة.',
  'CARRELLO': 'السلة', 'Carrello': 'السلة', 'Aggiungi al carrello': 'إضافة إلى السلة', 'Svuota carrello': 'إفراغ السلة',
  'Seleziona gli articoli': 'اختر المنتجات', 'per iniziare una vendita': 'لبدء عملية بيع', 'Procedi al pagamento': 'المتابعة إلى الدفع',
  'Subtotale': 'المجموع الفرعي', 'TOTALE': 'الإجمالي', 'Totale': 'الإجمالي', 'Totale da pagare': 'الإجمالي المستحق',
  'Prezzo prima dello sconto': 'السعر قبل الخصم', 'Buono sconto': 'قسيمة خصم', 'Verifica': 'تحقق', 'Conferma e stampa scontrino': 'تأكيد وطباعة الإيصال',
  'Lo scontrino viene registrato nel database locale.': 'يتم تسجيل الإيصال في قاعدة البيانات المحلية.', 'Pagamento': 'الدفع', 'Carta': 'بطاقة',
  'Bancomat': 'بطاقة خصم', 'Buono': 'قسيمة', 'Scontrino #': 'الإيصال رقم ', 'Numero scontrino:': 'رقم الإيصال:', 'Grazie per averci scelto!': 'شكرًا لاختياركم لنا!',
  'Stampa scontrino': 'طباعة الإيصال', 'Nessuno scontrino trovato con questo numero.': 'لم يتم العثور على هذا الإيصال.',
  'Esporta report vendite': 'تصدير تقرير المبيعات', 'Esporta report contabilità e finanza': 'تصدير تقرير المحاسبة والمالية', 'Esporta tutto': 'تصدير الكل',
  'Rispetta il filtro di tempo': 'Applica il filtro temporale', 'Tutte le vendite →': 'كل المبيعات ←', 'Tutti': 'الكل', 'Oggi': 'اليوم', 'Ieri': 'أمس',
  'Ultima settimana': 'الأسبوع الماضي', 'Ultimi 3 mesi': 'آخر 3 أشهر', 'Ultimi 6 mesi': 'آخر 6 أشهر', 'Ultimo anno': 'العام الماضي', 'Da - A': 'من - إلى',
  'Vai al magazzino →': 'الانتقال إلى المخزن ←', 'Valore del magazzino': 'قيمة المخزون', 'Valorizzazione della giacenza attuale': 'قيمة المخزون الحالي',
  'Prodotti più e meno venduti': 'المنتجات الأكثر والأقل مبيعًا', 'Vendite giornaliere': 'المبيعات اليومية', 'Vendite per categoria': 'المبيعات حسب الفئة',
  'Calendario vendite': 'تقويم المبيعات', 'Andamento mensile': 'الاتجاه الشهري', 'Ricavi': 'الإيرادات', 'Costo merce': 'تكلفة البضائع',
  'Spese operative': 'المصروفات التشغيلية', 'Ricavi, costo merce, spese operative e risultato': 'الإيرادات وتكلفة البضائع والمصروفات والنتيجة',
  'Incasso per giorno': 'الإيراد اليومي', 'Incasso per mese nel periodo selezionato': 'الإيراد الشهري للفترة المحددة', 'Composizione del bilancio': 'مكونات الميزانية',
  'Pagamenti per metodo': 'المدفوعات حسب الطريقة', 'Valore degli articoli venduti nel periodo selezionato': 'قيمة المنتجات المباعة خلال الفترة المحددة',
  'Ultimi sette giorni nel periodo selezionato': 'آخر سبعة أيام من الفترة المحددة', 'Dettaglio mensile ·': 'التفاصيل الشهرية ·',
  'Nessun prodotto registrato.': 'لا توجد منتجات مسجلة.', 'Nessun articolo in magazzino trovato.': 'لم يتم العثور على منتجات في المخزن.',
  'Nessun articolo in scadenza nei prossimi 10 giorni': 'لا توجد منتجات تنتهي صلاحيتها خلال الأيام العشرة القادمة',
  'Nessun prodotto scaduto': 'لا توجد منتجات منتهية الصلاحية', 'Non ci sono prodotti scaduti da gestire.': 'لا توجد منتجات منتهية الصلاحية لإدارتها.',
  'Nessun movimento nel periodo selezionato.': 'لا توجد حركات خلال الفترة المحددة.', 'Nessuna vendita registrata.': 'لا توجد مبيعات مسجلة.',
  'Nessun pagamento nel periodo selezionato.': 'لا توجد مدفوعات خلال الفترة المحددة.', 'Quantità venduta': 'الكمية المباعة', 'Quantità non venduta': 'الكمية غير المباعة',
  'Disponibili': 'متوفر', 'Disponibilità:': 'التوفر:', 'Prezzo': 'السعر', 'Prodotto': 'المنتج', 'Gruppo': 'المجموعة', 'Riordinare': 'إعادة الطلب',
  'Es. 0,750': 'مثال: 0.750', 'Peso in kg': 'الوزن بالكيلوغرام', 'Volume in litri': 'الحجم باللتر', 'PEZZO': 'قطعة', 'kg': 'كغ', 'lit.': 'لتر', 'pz': 'قطعة',
  'Seleziona un dispositivo per configurarlo.': 'اختر جهازًا لإعداده.', 'Dispositivi': 'الأجهزة', 'Info negozio': 'معلومات المتجر', 'Tema dell’app': 'مظهر التطبيق',
  'Tema dell\'app': 'مظهر التطبيق', 'Scegli i colori dell’interfaccia. La selezione viene salvata su questo dispositivo.': 'اختر ألوان الواجهة. سيتم حفظ الاختيار على هذا الجهاز.',
  'Nome negozio': 'اسم المتجر', 'Nome e logo del negozio per il menu e la barra superiore.': 'اسم المتجر وشعاره للقائمة والشريط العلوي.',
  'Scegli logo': 'اختيار الشعار', 'Sostituisci logo': 'استبدال الشعار', 'Logo del negozio': 'شعار المتجر', 'Scegli immagine': 'اختيار صورة',
  'Sostituisci immagine': 'استبدال الصورة', 'Scegli un’immagine salvata nel gestionale per la pagina iniziale.': 'اختر صورة محفوظة في النظام للصفحة الرئيسية.',
  'Accesso e sicurezza': 'الدخول والأمان', 'Attiva PIN': 'تفعيل رمز PIN', 'Aggiorna PIN': 'تحديث رمز PIN', 'Nuovo PIN (4–8 cifre)': 'رمز PIN جديد (4–8 أرقام)',
  'Usa il PIN': 'استخدام رمز PIN', 'PIN alternativo attivo': 'رمز PIN البديل مفعل', 'Nessun PIN alternativo configurato': 'لم يتم إعداد رمز PIN بديل',
  'Configura un PIN da 4 a 8 cifre come alternativa al barcode.': 'قم بإعداد رمز PIN من 4 إلى 8 أرقام كبديل للرمز الشريطي.',
  'All’avvio viene richiesto il barcode di un dipendente; puoi mantenere il PIN come alternativa.': 'يُطلب عند التشغيل الرمز الشريطي للموظف؛ ويمكنك الاحتفاظ برمز PIN كبديل.',
  'Operativo': 'يعمل', 'Stato operativo': 'حالة التشغيل', 'Stato corrente del gestionale.': 'الحالة الحالية للنظام.',
  'Database SQLite': 'قاعدة بيانات SQLite', 'Archivio locale': 'الأرشيف المحلي', 'Archivio locale attivo': 'الأرشيف المحلي نشط',
  'Database SQLite e copie giornaliere dei dati.': 'قاعدة بيانات SQLite ونسخ يومية من البيانات.', 'Scegli cartella': 'اختيار مجلد',
  'Cartella esportazioni giornaliere': 'مجلد التصدير اليومي', 'Ogni giorno a mezzanotte vengono aggiornati file TXT e PDF nelle cartelle Magazzino, Cassa, Vendite e Statistiche.': 'يتم تحديث ملفات TXT وPDF يوميًا عند منتصف الليل في مجلدات المخزن ونقطة البيع والمبيعات والإحصاءات.',
  'Stampante scontrini': 'طابعة الإيصالات', 'Seleziona stampante': 'اختيار الطابعة', 'Rileva stampanti': 'البحث عن الطابعات',
  'Collega una stampante rilevata dal sistema.': 'وصّل طابعة تم اكتشافها بواسطة النظام.', 'Nessuna stampante rilevata. Verifica che sia collegata e installata nel sistema.': 'لم يتم اكتشاف طابعة. تحقق من توصيلها وتثبيتها في النظام.',
  'La stampante salvata non è attualmente disponibile: selezionane una nuova.': 'الطابعة المحفوظة غير متاحة حاليًا؛ اختر طابعة أخرى.',
  'Lettore di codici a barre': 'قارئ الرموز الشريطية', 'Configura il lettore collegato al computer.': 'إعداد القارئ المتصل بالحاسوب.',
  'In attesa della prima lettura del lettore USB/HID.': 'بانتظار أول قراءة من قارئ USB/HID.', 'Rilevato: è stata acquisita almeno una scansione su questo computer.': 'تم الكشف: جرت قراءة واحدة على الأقل على هذا الحاسوب.',
  'La scansione del badge verifica e apre automaticamente la vendita.': 'تتحقق قراءة البطاقة من الموظف وتفتح البيع تلقائيًا.',
  'I lettori USB che si comportano come tastiera vengono riconosciuti automaticamente quando inviano un codice. La preferenza resta salvata tra gli avvii.': 'يتم التعرف تلقائيًا على قارئات USB التي تعمل كلوحة مفاتيح عند إرسال رمز. ويُحفظ هذا الإعداد بين مرات التشغيل.',
  'Mese': 'الشهر', 'Mese di competenza': 'شهر الاستحقاق', 'Data di pagamento': 'تاريخ الدفع', 'Paga tutti gli stipendi': 'دفع جميع الرواتب',
  'Scarica ricevute del mese': 'تنزيل إيصالات الشهر', 'Pagato il': 'تم الدفع في',
  'Ricevuta pagamento affitto': 'إيصال دفع الإيجار', 'Ricevuta allegata': 'تم إرفاق الإيصال',
  'Menu principale': 'القائمة الرئيسية', 'Torna al magazzino': 'العودة إلى المخزن', 'Dettaglio articolo': 'تفاصيل المنتج', 'DETTAGLIO ARTICOLO': 'تفاصيل المنتج',
  'Giacenza attuale:': 'المخزون الحالي:', 'Condividi': 'مشاركة', 'Vedi lista': 'عرض القائمة', 'Scarica': 'تنزيل', 'Salva nome': 'حفظ الاسم',
  'Inizio': 'البداية', 'Scadenza': 'انتهاء الصلاحية', 'Sempre': 'دائمًا', 'Attivo': 'مفعل', 'Disattivo': 'معطل', 'On': 'تشغيل', 'Off': 'إيقاف',
  'Rimuovi articolo dalla vendita': 'إزالة المنتج من البيع', 'Nuova quantità': 'كمية جديدة',
  'Conferma giacenza': 'تأكيد المخزون', 'Autorizza modifica articolo': 'السماح بتعديل المنتج', 'Autorizza nuova quantità': 'السماح بالكمية الجديدة',
  'Articoli': 'المنتجات', 'Posizione': 'الموقع',
  'Conferma e salva': 'تأكيد وحفظ', 'Nuovo totale': 'الإجمالي الجديد', 'Sconto in euro': 'الخصم باليورو', 'Pagamento:': 'الدفع:', 'Risparmio:': 'التوفير:',
  'Ok': 'حسنًا', 'F2': 'F2', 'ITALIANO': 'الإيطالية', 'Chiudi': 'إغلاق', 'Cancella ricerca': 'مسح البحث', 'Non applicata (massimo 1)': 'غير مطبقة (بحد أقصى 1)',
  'Non risultano articoli rimanenti in magazzino.': 'لا توجد منتجات متبقية في المخزن.', 'Le categorie appariranno dopo la prima vendita.': 'ستظهر الفئات بعد أول عملية بيع.',
  'Puoi aggiungerlo come nuovo articolo: il codice acquisito sarà già inserito nel modulo.': 'يمكنك إضافته كمنتج جديد؛ سيتم إدخال الرمز الممسوح مسبقًا في النموذج.',
  'Puoi usare il PIN dalla schermata di accesso.': 'يمكنك استخدام رمز PIN من شاشة تسجيل الدخول.', 'Il codice a barre': 'الرمز الشريطي',
  'Scansiona o inserisci il barcode di riconoscimento del dipendente per': 'امسح أو أدخل الرمز الشريطي للتعريف بالموظف من أجل',
  'Scansiona il barcode di un dipendente per continuare con «': 'امسح الرمز الشريطي للموظف للمتابعة مع «',
  'Nessuna spesa registrata.': 'لا توجد مصروفات مسجلة.', 'Nessuna spesa corrisponde alla ricerca.': 'لا توجد مصروفات تطابق البحث.',
  'Nessuna stampante rilevata.': 'لم يتم اكتشاف طابعة.', 'Risultato': 'النتيجة', 'Soglia': 'الحد الأدنى', 'Stampa codici': 'طباعة الرموز', 'Genera codici': 'إنشاء الرموز',
  'Articoli ancora in magazzino': 'المنتجات المتبقية في المخزن',
  'Aggiungi articoli': 'إضافة منتجات', 'Conferma l’aggiunta': 'تأكيد الإضافة', 'Conferma l\'aggiunta': 'تأكيد الإضافة', 'Modifica dipendente': 'تعديل الموظف',
  'GESTIONALE': 'نظام الإدارة', 'MODIFICA VENDITA': 'تعديل البيع', '% di sconto': '٪ خصم',
  'Aggiungi articolo': 'إضافة منتج', 'Anteprima intestazione scontrino': 'معاينة عنوان الإيصال', 'Barcode': 'الرمز الشريطي',
  'Buoni sconto gruppo': 'مجموعة قسائم الخصم', 'Buono sconto (': 'قسيمة خصم (', 'Butta articolo': 'إتلاف المنتج', 'Elimina vendita': 'حذف عملية البيع',
  'Contratto PDF allegato': 'تم إرفاق العقد بصيغة PDF', 'PNG, JPG o WEBP · massimo 5 MB ciascuna': 'PNG أو JPG أو WEBP · بحد أقصى 5 ميغابايت لكل صورة',
  'Scarica bilancio': 'تنزيل الميزانية', 'Totale incassato nel periodo': 'إجمالي الإيرادات خلال الفترة',
  'Verifica gli articoli scaduti e registra lo smaltimento.': 'تحقق من المنتجات منتهية الصلاحية وسجّل التخلص منها.',
  'Vuoi applicare al report il filtro temporale selezionato (': 'هل تريد تطبيق عامل التصفية الزمني المحدد على التقرير (',
  'disponibili': 'متوفر', 'non è presente tra gli articoli.': 'غير موجود ضمن المنتجات.', 'questo scontrino.': 'هذا الإيصال.',
};
const AppLanguageContext = createContext<AppLanguage>('it');
const AppDynamicNamesContext = createContext<Set<string>>(new Set());
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const localizedText = (value: string, language: AppLanguage, dynamicNames = new Set<string>()) => {
  if (language !== 'ar') return value;
  if (dynamicNames.has(value.trim())) return value;
  const exact = arabicUiTranslations[value.trim()];
  if (exact) return value.replace(value.trim(), exact);
  return Object.entries(arabicUiTranslations)
    .filter(([source]) => source.length > 2)
    .sort(([first], [second]) => second.length - first.length)
    .reduce((text, [source, translated]) => text.replace(
      new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(source)})(?=$|[^\\p{L}\\p{N}])`, 'giu'),
      (_match, prefix: string, match: string) => `${prefix}${dynamicNames.has(match) ? match : translated}`,
    ), value);
};

function LocalizedNodes({ children }: { children: ReactNode }) {
  const language = useContext(AppLanguageContext);
  const dynamicNames = useContext(AppDynamicNamesContext);
  const translate = (node: ReactNode, preserve = false, parentClass = ''): ReactNode => {
    if (typeof node === 'string') {
      if (preserve || language !== 'ar' || dynamicNames.has(node.trim())) return node;
      const trimmed = node.trim();
      const translated = localizedText(trimmed, language, dynamicNames);
      return node.replace(trimmed, translated);
    }
    if (Array.isArray(node)) return node.map((child) => translate(child, preserve, parentClass));
    if (!isValidElement<{ children?: ReactNode; className?: string; value?: string }>(node)) return node;
    const className = node.props.className ?? '';
    const elementType = typeof node.type === 'string' ? node.type : '';
    const preserveContent = preserve || className.split(/\s+/).includes('cell-primary')
      || (elementType === 'strong' && ['employee-card', 'product-tile', 'cash-product', 'cart-line-name', 'employee-detail-hero', 'user-card'].some((name) => parentClass.split(/\s+/).includes(name)));
    if (node.props.children === undefined) return node;
    if (elementType === 'option') {
      const optionValue = node.props.value ?? (typeof node.props.children === 'string' ? node.props.children : undefined);
      return cloneElement(node, { value: optionValue }, translate(node.props.children, preserveContent, className || parentClass));
    }
    return cloneElement(node, undefined, translate(node.props.children, preserveContent, className || parentClass));
  };
  return <>{translate(children)}</>;
}
const appThemes = [
  { id: 'green', label: 'Verde', color: '#72bf6a' },
  { id: 'blue', label: 'Blu', color: '#42A4F6' },
  { id: 'purple', label: 'Viola', color: '#8b74a6' },
  { id: 'orange', label: 'Arancione', color: '#F3500A' },
] as const;
type AppTheme = typeof appThemes[number]['id'];
type PromotionMinimum = 'none' | 'spend' | 'kilograms' | 'pieces' | 'liters';
const nav: { section: Section; label: string; icon: typeof House }[] = [
  { section: 'home', label: 'Homepage', icon: House }, { section: 'inventory', label: 'Magazzino', icon: Package },
  { section: 'cash', label: 'Cassa', icon: ShoppingBasket }, { section: 'sales', label: 'Vendite', icon: ClipboardList },
  { section: 'statistics', label: 'Statistiche', icon: BarChart3 },
];
const sectionNames: Partial<Record<Section, string>> = {
  'inventory-history': 'Storico Magazzino', 'stock-movement': 'Carica e scarica merce',
  'sale-management': 'Modifica o Elimina', promotions: 'Offerta', 'vouchers-create': 'Crea buoni sconto',
  'vouchers-list': 'Lista buoni sconto',
  expenses: 'Spese', statistics: 'Analisi vendite', 'financial-balance': 'Bilancio gestionale',
  'expired-products': 'Gestisci articoli scaduti',
  employees: 'Lista Dipendenti', 'employee-create': 'Crea Dipendente', payroll: 'Paga Stipendi', 'employee-tracker': 'Tracker Dipendenti', 'inventory-control': 'Controllo',
};
function normalizedRole(role: string): string {
  return role.trim().toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function canAccessSection(role: string, section: Section): boolean {
  switch (normalizedRole(role)) {
    case 'proprietario':
      return true;
    case 'cassiere':
      return section === 'cash' || section === 'sale-management' || section === 'settings';
    case 'direttore':
      return !['cash', 'sale-management', 'employees', 'employee-create', 'payroll', 'employee-tracker', 'promotions', 'vouchers-create', 'vouchers-list'].includes(section);
    case 'contabilita':
      return ['home', 'sales', 'statistics', 'financial-balance', 'employees', 'employee-create', 'payroll', 'employee-tracker', 'promotions', 'vouchers-create', 'vouchers-list', 'settings'].includes(section);
    default:
      return section === 'cash';
  }
}
function defaultSectionForRole(role: string): Section {
  if (normalizedRole(role) === 'proprietario') return 'cash';
  return (['home', 'cash', 'settings', 'inventory'] as Section[])
    .find((section) => canAccessSection(role, section)) ?? 'cash';
}
function isCashierRole(role: string): boolean {
  return !['proprietario', 'direttore', 'contabilita'].includes(normalizedRole(role));
}
const voucherCodeSpace = 10_000_000_000;
function randomVoucherCode(prefix: string, usedCodes: Set<string>): string {
  const randomValues = new Uint8Array(1);
  let code = '';
  do {
    let digits = '';
    for (let index = 0; index < 10; index += 1) {
      let value: number;
      do {
        window.crypto.getRandomValues(randomValues);
        value = randomValues[0];
      } while (value >= 250);
      digits += String(value % 10);
    }
    code = `${prefix}${digits}`;
  } while (usedCodes.has(code));
  usedCodes.add(code);
  return code;
}
function employeeDocumentImages(documentsData: string): string[] {
  try {
    const parsed: unknown = JSON.parse(documentsData);
    if (Array.isArray(parsed) && parsed.every((image) => typeof image === 'string')) return parsed;
  } catch {
    return documentsData ? [documentsData] : [];
  }
  return documentsData ? [documentsData] : [];
}
function newEmployeeDraft(employees: Employee[]): EmployeeInput {
  const usedRecognitionCodes = new Set(employees.map((employee) => employee.recognition_code));
  const randomRecognitionCode = () => {
    const values = new Uint32Array(1);
    let code = '';
    do {
      window.crypto.getRandomValues(values);
      code = `DIP${String(values[0] % 100_000_000).padStart(8, '0')}`;
    } while (usedRecognitionCodes.has(code));
    return code;
  };
  const recognitionCode = randomRecognitionCode();
  return {
    first_name: '', last_name: '', age: 18, gender: '', home_address: '', email: '', initial_password: '',
    phone: '', operational_site: '', role: '', shift: '', salary: 0, payment_method: 'Contanti', iban: '',
    recognition_code: recognitionCode, barcode: recognitionCode,
    photo_data: '', documents_data: '[]', contract_pdf_data: '',
  };
}
function barcodePng(code: string): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, code, { format: 'CODE128', width: 1.5, height: 36, displayValue: false, margin: 0 });
  return canvas.toDataURL('image/png');
}
function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Impossibile leggere il file ${file.name}.`));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error(`Formato non valido per il file ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
function dataUrlExtension(value: string): string {
  const mime = value.slice(5, value.indexOf(';')).toLowerCase();
  return mime === 'application/pdf' ? 'pdf' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
}
function imageAsPng(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('Impossibile inserire la foto del dipendente nel PDF.'));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Impossibile preparare la foto per il PDF.'));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.src = dataUrl;
  });
}
const inventoryFilters: { value: 'all' | 'available' | 'low' | 'out'; label: string }[] = [
  { value: 'all', label: 'Tutto' }, { value: 'available', label: 'Disponibile' },
  { value: 'low', label: 'In esaurimento' }, { value: 'out', label: 'Esaurito' },
];
const statisticsPeriods = ['Tutti', 'Ultimo giorno', 'Ultimi 3 giorni', 'Ultima settimana', 'Ultimo mese', 'Ultimi 3 mesi', 'Ultimi 6 mesi', 'Ultimo anno'];
const blankProduct: ProductInput = { code: '', name: '', unit: 'PEZZO', category: 'Dispensa', sale_price: 0, purchase_price: 0, stock: 0, low_stock_threshold: 5, expiry_enabled: false, expiry_date: '' };
const blankPromotion = (): PromotionInput => ({ name: '', discount_type: 'percentage', percentage: 10, buy_quantity: 2, free_quantity: 1, category: 'Tutte', starts_at: localDateKey(), ends_at: localDateKey(), minimum_spend: 0, minimum_kilograms: 0, minimum_pieces: 0, minimum_liters: 0, application_mode: 'Automatica' });
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Operazione non riuscita.';
type PromotionDiscountType = 'percentage' | '2+1' | '3+1' | 'custom';

function promotionEndDate(start: string, duration: string): string {
  if (duration === 'Sempre') return permanentPromotionEnd;
  const date = new Date(`${start}T00:00:00`);
  if (duration === '3 giorni') date.setDate(date.getDate() + 2);
  else if (duration === '7 giorni') date.setDate(date.getDate() + 6);
  else if (duration === '1 mese') {
    const day = date.getDate();
    const targetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    date.setMonth(date.getMonth() + 1, Math.min(day, targetMonth.getDate()));
  }
  return localDateKey(date);
}

function Field({ label, fieldClassName, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; fieldClassName?: string }) {
  const language = useContext(AppLanguageContext);
  return <label className={`field${fieldClassName ? ` ${fieldClassName}` : ''}`}><span>{localizedText(label, language)}</span><input {...props} /></label>;
}

function Modal({ title, close, children, wide = false, rightHalf = false, narrowPanel = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean; rightHalf?: boolean; narrowPanel?: boolean }) {
  const language = useContext(AppLanguageContext);
  return <div className={`modal-backdrop${rightHalf ? ' modal-right-half' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className={`modal${wide ? ' modal-wide' : ''}${rightHalf ? ' modal-payment-panel' : ''}${narrowPanel ? ' modal-payment-narrow' : ''}`} role="dialog" aria-modal="true"><header className="modal-header"><div><p className="eyebrow">GESTIONALE</p><h2>{localizedText(title, language)}</h2></div><button className="icon-button" onClick={close} aria-label={localizedText('Chiudi', language)}><X size={18} /></button></header><LocalizedNodes>{children}</LocalizedNodes></section></div>;
}

function BarcodeImage({ value }: { value: string }) {
  const barcode = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (barcode.current) JsBarcode(barcode.current, value, { format: 'CODE128', width: 1.2, height: 28, displayValue: false, margin: 0 });
  }, [value]);
  return <svg className="barcode-image" ref={barcode} role="img" aria-label={`Barcode ${value}`} />;
}

function EmployeeForm({ initial, save, cancel, notify, canDelete = false, onDelete }: { initial: EmployeeInput; save: (employee: EmployeeInput) => Promise<void>; cancel: () => void; notify: (message: string) => void; canDelete?: boolean; onDelete?: () => Promise<void> }) {
  const [employee, setEmployee] = useState(initial);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial.id);
  const documentImages = employeeDocumentImages(employee.documents_data);
  const setAttachment = async (field: 'photo_data' | 'contract_pdf_data', file: File | undefined) => {
    if (!file) return;
    const isContract = field === 'contract_pdf_data';
    const allowedType = isContract ? file.type === 'application/pdf' : ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
    const maxSize = isContract ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (!allowedType || file.size > maxSize) {
      notify(isContract ? 'Allega un contratto PDF di massimo 10 MB.' : 'Allega un’immagine PNG, JPG o WEBP di massimo 5 MB.');
      return;
    }
    try {
      const dataUrl = await fileAsDataUrl(file);
      setEmployee((current) => ({ ...current, [field]: dataUrl }));
    } catch (error) {
      notify(errorText(error));
    }
  };
  const addDocumentImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    if (documentImages.length + selectedFiles.length > 20
      || selectedFiles.some((file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      notify('Puoi allegare fino a 20 immagini PNG, JPG o WEBP da massimo 5 MB ciascuna.');
      return;
    }
    try {
      const images = await Promise.all(selectedFiles.map(fileAsDataUrl));
      setEmployee((current) => ({
        ...current,
        documents_data: JSON.stringify([...employeeDocumentImages(current.documents_data), ...images]),
      }));
    } catch (error) {
      notify(errorText(error));
    }
  };
  const removeDocumentImage = (index: number) => {
    setEmployee((current) => ({
      ...current,
      documents_data: JSON.stringify(employeeDocumentImages(current.documents_data).filter((_, imageIndex) => imageIndex !== index)),
    }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing && (!employee.photo_data || !documentImages.length || !employee.contract_pdf_data)) {
      notify('Allega la foto del dipendente, la foto dei documenti e il contratto PDF.');
      return;
    }
    setSaving(true);
    try {
      await save(employee);
    } catch (error) {
      notify(errorText(error));
    } finally {
      setSaving(false);
    }
  };
  return <LocalizedNodes><form className="employee-form" onSubmit={submit}>
    <div className="employee-uploads">
      <label className="employee-upload">
        <span>Foto del dipendente</span>
        <div className="employee-upload-box">{employee.photo_data ? <img src={employee.photo_data} alt="Foto del dipendente" /> : <><Camera size={25} /><small>Seleziona immagine</small></>}</div>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void setAttachment('photo_data', event.target.files?.[0])} />
      </label>
      <div className="employee-upload employee-document-upload">
        <span>Foto documenti</span>
        <div className="employee-document-images">{documentImages.map((image, index) => <div className="employee-document-image" key={`${index}-${image.slice(0, 32)}`}><img src={image} alt={`Documento ${index + 1}`} /><button type="button" className="icon-button small" aria-label={`Rimuovi documento ${index + 1}`} onClick={() => removeDocumentImage(index)}><X size={14} /></button></div>)}
          <label className="employee-upload-box employee-document-add"><Camera size={25} /><small>Aggiungi immagini</small><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { void addDocumentImages(event.target.files); event.currentTarget.value = ''; }} /></label>
        </div>
        <small>PNG, JPG o WEBP · massimo 5 MB ciascuna</small>
      </div>
    </div>
    <label className="field employee-contract"><span>Contratto in PDF</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => void setAttachment('contract_pdf_data', event.target.files?.[0])} />{employee.contract_pdf_data && <small>Contratto PDF allegato</small>}</label>
    <div className="employee-fields">
      <Field label="Nome" value={employee.first_name} onChange={(event) => setEmployee({ ...employee, first_name: event.target.value })} required />
      <Field label="Cognome" value={employee.last_name} onChange={(event) => setEmployee({ ...employee, last_name: event.target.value })} required />
      <Field label="Età" type="number" min="16" max="100" step="1" value={employee.age} onChange={(event) => setEmployee({ ...employee, age: Number(event.target.value) })} required />
      <label className="field"><span>Sesso</span><select value={employee.gender} onChange={(event) => setEmployee({ ...employee, gender: event.target.value })} required><option value="">Seleziona sesso</option><option>Donna</option><option>Uomo</option><option>Altro</option></select></label>
      <Field fieldClassName="employee-wide-field" label="Indirizzo di casa" value={employee.home_address} onChange={(event) => setEmployee({ ...employee, home_address: event.target.value })} required />
      <Field label="Indirizzo email" type="email" value={employee.email} onChange={(event) => setEmployee({ ...employee, email: event.target.value })} required />
      <Field label={editing ? 'Nuova password (opzionale)' : 'Password iniziale'} type="password" autoComplete="new-password" minLength={8} value={employee.initial_password ?? ''} onChange={(event) => setEmployee({ ...employee, initial_password: event.target.value })} required={!editing} />
      <Field label="Numero di telefono" type="tel" value={employee.phone} onChange={(event) => setEmployee({ ...employee, phone: event.target.value })} required />
      <Field label="Sede Operativa" value={employee.operational_site} onChange={(event) => setEmployee({ ...employee, operational_site: event.target.value })} required />
      <label className="field"><span>Ruolo</span><select value={employee.role} onChange={(event) => setEmployee((current) => ({ ...current, role: event.target.value }))} required><option value="">Seleziona ruolo</option>{[...new Set([...defaultEmployeeRoles, employee.role].filter(Boolean))].map((role) => <option key={role}>{role}</option>)}</select></label>
      <label className="field"><span>Turno</span><select value={employee.shift} onChange={(event) => setEmployee({ ...employee, shift: event.target.value })} required><option value="">Seleziona turno</option><option>Mattina</option><option>Pomeriggio</option><option>Notte</option><option>Turno unico</option><option>Variabile</option></select></label>
      <label className="field"><span>Metodo di pagamento</span><select value={employee.payment_method} onChange={(event) => setEmployee({ ...employee, payment_method: event.target.value as EmployeeInput['payment_method'], iban: event.target.value === 'Bonifico' ? employee.iban : '' })} required><option>Contanti</option><option>Bonifico</option></select></label>
      <Field label="IBAN" value={employee.iban} onChange={(event) => setEmployee({ ...employee, iban: event.target.value.toUpperCase() })} disabled={employee.payment_method !== 'Bonifico'} required={employee.payment_method === 'Bonifico'} />
      <Field label="Stipendio (€)" type="number" min="0" step="1" value={employee.salary || ''} onChange={(event) => setEmployee((current) => ({ ...current, salary: Number(event.target.value) }))} required />
      <Field label="Codice riconoscimento" value={employee.recognition_code} readOnly />
      <label className="field employee-barcode-field"><span>Barcode di riconoscimento</span>      <div className="employee-barcode"><BarcodeImage value={employee.recognition_code} /><small>{employee.recognition_code}</small></div></label>
    </div>
    <div className={`form-actions${editing && canDelete ? ' has-delete' : ''}`}>{editing && canDelete && onDelete && <button className="button button-danger" type="button" onClick={() => void onDelete()}>Elimina dipendente</button>}<button className="button button-quiet" type="button" onClick={cancel}>Annulla</button><button className="button button-primary" disabled={saving}><Check size={16} /> {editing ? 'Salva modifiche' : 'Crea dipendente'}</button></div>
  </form></LocalizedNodes>;
}

function ProductForm({ initial, save, close, categories, addCategory, deleteCategory, onDelete }: { initial: ProductInput; save: (product: ProductInput) => Promise<void>; close: () => void; categories: string[]; addCategory: (category: string) => void; deleteCategory: (category: string) => Promise<string>; onDelete?: () => Promise<void> }) {
  const [product, setProduct] = useState({ ...initial, expiry_enabled: initial.expiry_enabled ?? false, expiry_date: initial.expiry_date ?? '' });
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const change = (key: keyof ProductInput, value: string) => setProduct((current) => ({ ...current, [key]: ['sale_price', 'purchase_price', 'stock', 'low_stock_threshold'].includes(key) ? Number(value) : value }));
  const createCategory = () => {
    const nextCategory = newCategory.trim();
    if (!nextCategory || categories.some((item) => item.toLocaleLowerCase('it') === nextCategory.toLocaleLowerCase('it'))) return;
    addCategory(nextCategory);
    setProduct((current) => ({ ...current, category: nextCategory }));
    setNewCategory('');
  };
  const removeCategory = async (name: string) => {
    const fallback = await deleteCategory(name);
    if (product.category === name) setProduct((current) => ({ ...current, category: fallback }));
  };
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); try { await save(product); close(); } finally { setSaving(false); } };
  return <Modal title={initial.name ? 'Modifica articolo' : 'Nuovo articolo'} close={close} rightHalf={!initial.name}><form className="form-grid product-form" onSubmit={submit}>
    <Field label="Nome articolo" value={product.name} onChange={(e) => change('name', e.target.value)} required autoFocus />
    <Field label="Codice a barre" value={product.code} onChange={(e) => change('code', e.target.value)} required />
    <fieldset className="unit-choice"><legend>Unità di vendita</legend>{(['KG', 'PEZZO', ...(product.unit === 'LITRO' ? ['LITRO'] : [])] as ProductUnit[]).map((unit) => <label key={unit}><input type="radio" name="product-unit" checked={(product.unit ?? 'PEZZO') === unit} onChange={() => setProduct({ ...product, unit })} /><span>{unit}</span></label>)}</fieldset>
    <Field label={`Prezzo di vendita${product.unit === 'KG' ? ' al kg' : product.unit === 'LITRO' ? ' al litro' : ''}`} type="number" min="0" step="0.01" value={product.sale_price || ''} onChange={(e) => change('sale_price', e.target.value)} required />
    <Field label={`Prezzo di acquisto${product.unit === 'KG' ? ' al kg' : product.unit === 'LITRO' ? ' al litro' : ''}`} type="number" min="0" step="0.01" value={product.purchase_price || ''} onChange={(e) => change('purchase_price', e.target.value)} required />
    <Field label={`Giacenza${product.unit === 'KG' ? ' (kg)' : product.unit === 'LITRO' ? ' (litri)' : ''}`} type="number" min="0" step={product.unit === 'PEZZO' ? '1' : 'any'} value={product.stock || ''} onChange={(e) => change('stock', e.target.value)} required />
    <Field label={`Soglia minima avviso${product.unit === 'KG' ? ' (kg)' : product.unit === 'LITRO' ? ' (litri)' : ''}`} type="number" min="0" step={product.unit === 'PEZZO' ? '1' : 'any'} value={product.low_stock_threshold || ''} onChange={(e) => change('low_stock_threshold', e.target.value)} required />
    <div className="expiry-field">
      <span className="field-label">Gestione data di scadenza</span>
      <button className={`toggle-button${product.expiry_enabled ? ' enabled' : ''}`} type="button" role="switch" aria-checked={product.expiry_enabled} onClick={() => setProduct((current) => ({ ...current, expiry_enabled: !current.expiry_enabled }))}>
        {product.expiry_enabled ? 'On' : 'Off'}
      </button>
      {product.expiry_enabled && <Field label="Data di scadenza" type="date" value={product.expiry_date ?? ''} onChange={(e) => setProduct((current) => ({ ...current, expiry_date: e.target.value }))} required />}
    </div>
    <label className="field product-category-field"><span>Categoria</span><select value={product.category} onChange={(event) => change('category', event.target.value)} required>{[...new Set([...categories, product.category].filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</select></label>
    <div className="product-category-manager"><div className="product-category-add"><Field label="Nuova categoria" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} /><button className="button button-outline" type="button" onClick={createCategory} disabled={!newCategory.trim()}><Plus size={14} /> Aggiungi</button></div><div className="product-category-list">{categories.map((item) => <span key={item}>{item}<button type="button" className="icon-button small" aria-label={`Elimina categoria ${item}`} title={`Elimina categoria ${item}`} onClick={() => void removeCategory(item)}><Trash2 size={13} /></button></span>)}</div></div>
    <div className={`form-actions${onDelete ? ' has-delete' : ''}`}>{onDelete && <button className="button button-danger product-delete-button" type="button" onClick={() => void onDelete()}>Elimina articolo</button>}<button className="button button-quiet" type="button" onClick={close}>Annulla</button><button className="button button-primary" disabled={saving}><Check size={16} /> Salva articolo</button></div>
  </form></Modal>;
}

export default function App() {
  const [data, setData] = useState<AppState | null>(null);
  const [section, setSection] = useState<Section>('cash');
  const [openSidebarMenu, setOpenSidebarMenu] = useState<'inventory' | 'offers' | 'statistics' | 'employees' | null>(null);
  const [stockMovementType, setStockMovementType] = useState<'Carico' | 'Scarico'>('Carico');
  const [stockMovementProduct, setStockMovementProduct] = useState('');
  const [stockMovementQuantity, setStockMovementQuantity] = useState('');
  const [stockMovementNote, setStockMovementNote] = useState('');
  const [stockMovementEmployeeBarcode, setStockMovementEmployeeBarcode] = useState('');
  const [inventoryHistoryPeriod, setInventoryHistoryPeriod] = useState('Tutti');
  const [inventoryHistoryFrom, setInventoryHistoryFrom] = useState('');
  const [inventoryHistoryTo, setInventoryHistoryTo] = useState('');
  const [inventoryHistorySearch, setInventoryHistorySearch] = useState('');
  const [activityPeriod, setActivityPeriod] = useState('Tutti');
  const [activityFrom, setActivityFrom] = useState('');
  const [activityTo, setActivityTo] = useState('');
  const [activityEmployeeId, setActivityEmployeeId] = useState('Tutti');
  const [statisticsPeriod, setStatisticsPeriod] = useState('Tutti');
  const [unsoldListOpen, setUnsoldListOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | null>(null);
  const [deviceTab, setDeviceTab] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    const savedTheme = window.localStorage.getItem('app-theme');
    return appThemes.find((theme) => theme.id === savedTheme)?.id ?? 'green';
  });
  const [language, setLanguage] = useState<AppLanguage>(() => window.localStorage.getItem('app-language') === 'ar' ? 'ar' : 'it');
  const [savedCategories, setSavedCategories] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem('product-categories') ?? 'null');
      return Array.isArray(stored) && stored.every((item) => typeof item === 'string') ? stored : ['Dispensa'];
    } catch {
      return ['Dispensa'];
    }
  });
  const [voucherPrintBatch, setVoucherPrintBatch] = useState<AppState['voucherBatches'][number] | null>(null);
  const [voucherViewBatch, setVoucherViewBatch] = useState<AppState['voucherBatches'][number] | null>(null);
  const [voucherPercentage, setVoucherPercentage] = useState('10');
  const [voucherQuantity, setVoucherQuantity] = useState('1');
  const [voucherStartsAt, setVoucherStartsAt] = useState(localDateKey());
  const [voucherEndsAt, setVoucherEndsAt] = useState(localDateKey());
  const [voucherPreview, setVoucherPreview] = useState<{ discount_percentage: number; starts_at: string; ends_at: string; codes: string[] } | null>(null);
  const [editingVoucherBatchId, setEditingVoucherBatchId] = useState<number | null>(null);
  const [balancePeriod, setBalancePeriod] = useState<'Ultimi 3 mesi' | 'Ultimi 6 mesi' | 'Ultimo anno'>('Ultimi 6 mesi');
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [locked, setLocked] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthenticatedEmployee | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState('');
  const [loginBarcode, setLoginBarcode] = useState('');
  const [pinFallback, setPinFallback] = useState(false);
  const loginBarcodeAttempt = useRef('');
  const [notice, setNotice] = useState('');
  const [productForm, setProductForm] = useState<ProductInput | null>(null);
  const [productEditingId, setProductEditingId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productAuthorization, setProductAuthorization] = useState<{ product: Product; action: 'edit' | 'quantity' } | null>(null);
  const [productAuthorizationBarcode, setProductAuthorizationBarcode] = useState('');
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockInput, setStockInput] = useState('');
  const [saleDialog, setSaleDialog] = useState<Sale | null>(null);
  const [saleAction, setSaleAction] = useState<{ sale: Sale; action: 'edit' | 'delete' } | null>(null);
  const [saleEmployeeBarcode, setSaleEmployeeBarcode] = useState('');
  const [saleDiscountPercentage, setSaleDiscountPercentage] = useState(0);
  const [saleAdjustment, setSaleAdjustment] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [scannerSearch, setScannerSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryControlAuthorized, setInventoryControlAuthorized] = useState(false);
  const [inventoryControlBarcode, setInventoryControlBarcode] = useState('');
  const [inventoryControlSearch, setInventoryControlSearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeDraft, setEmployeeDraft] = useState<EmployeeInput | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<Employee | null>(null);
  const [reportExportOpen, setReportExportOpen] = useState(false);
  const [reportExportType, setReportExportType] = useState<'sales-pdf' | 'sales-xlsx' | 'balance'>('sales-pdf');
  const [payrollMonth, setPayrollMonth] = useState(localDateKey().slice(0, 7));
  const [payrollDate, setPayrollDate] = useState(localDateKey());
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseCategory, setExpenseCategory] = useState(expenseCategories[0]);
  const [expenseOtherCategory, setExpenseOtherCategory] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(localDateKey());
  const [expenseReceiptData, setExpenseReceiptData] = useState('');
  const [inventoryStatus, setInventoryStatus] = useState<'all' | 'available' | 'low' | 'out'>('available');
  const [saleSearch, setSaleSearch] = useState('');
  const [saleManagementSearch, setSaleManagementSearch] = useState('');
  const [salesPeriod, setSalesPeriod] = useState('Tutti');
  const [salesFrom, setSalesFrom] = useState('');
  const [salesTo, setSalesTo] = useState('');
  const [salesCategory, setSalesCategory] = useState('Tutte');
  const [category, setCategory] = useState('Tutte');
  const [paymentMethod, setPaymentMethod] = useState('Carta');
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherMessage, setVoucherMessage] = useState('');
  const [voucherDiscountPercentage, setVoucherDiscountPercentage] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [promotionDuration, setPromotionDuration] = useState('1 giorno');
  const [saleAddOpen, setSaleAddOpen] = useState(false);
  const [saleProductSearch, setSaleProductSearch] = useState('');
  const [saleCart, setSaleCart] = useState<SaleItem[]>([]);
  const [measuredProduct, setMeasuredProduct] = useState<Product | null>(null);
  const [measuredQuantity, setMeasuredQuantity] = useState('');
  const [measuredTarget, setMeasuredTarget] = useState<'cash' | 'sale-edit'>('cash');
  const [camera, setCamera] = useState(false);
  const [pendingUnknownCode, setPendingUnknownCode] = useState('');
  const [shopName, setShopName] = useState('');
  const [archiveFolder, setArchiveFolder] = useState('');
  const [newPin, setNewPin] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [promotion, setPromotion] = useState<PromotionInput>(blankPromotion);
  const [promotionDiscountType, setPromotionDiscountType] = useState<PromotionDiscountType>('percentage');
  const [promotionMinimum, setPromotionMinimum] = useState<PromotionMinimum>('none');
  const [manualPromotionId, setManualPromotionId] = useState<number | undefined>();
  const [automaticPromotionId, setAutomaticPromotionId] = useState<number | null | undefined>(undefined);
  const scannerSequence = useRef({ value: '', startedAt: 0, lastAt: 0 });

  const refresh = async () => { const next = await window.gestionale.getState(); setData(next); setShopName(next.settings.shop_name); setArchiveFolder(next.settings.archive_folder); return next; };
  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 3600); };
  const activeRole = currentUser?.role ?? (data && data.employees.length === 0 ? 'Proprietario' : 'cassiere');
  const canAccess = (target: Section) => canAccessSection(activeRole, target);
  const trackActivity = (sectionName: string, action: string, detail = '', barcode = currentUser?.barcode) => {
    if (!barcode) return;
    void window.gestionale.recordEmployeeActivity({
      employee_barcode: barcode,
      section: sectionName,
      action,
      detail,
    }).catch((error: unknown) => notify(`Impossibile registrare l’attività: ${errorText(error)}`));
  };
  const navigateTo = (target: Section) => {
    if (!locked && data && !canAccess(target)) {
      notify('Non hai i permessi per accedere a questa sezione.');
      return;
    }
    if (target !== section) trackActivity(sectionNames[target] ?? nav.find((item) => item.section === target)?.label ?? target, 'Apertura sezione');
    setSection(target);
    if (target === 'inventory-control') {
      setInventoryControlAuthorized(false);
      setInventoryControlBarcode('');
      setInventoryControlSearch('');
    }
    setOpenSidebarMenu(null);
    if (target === 'employee-tracker') void refresh();
  };
  const saveEmployee = async (employee: EmployeeInput) => {
    await window.gestionale.saveEmployee(employee);
    trackActivity('Dipendenti', employee.id ? 'Dipendente modificato' : 'Dipendente creato', `${employee.first_name} ${employee.last_name}`.trim());
    await refresh();
    if (currentUser && employee.id !== undefined && currentUser.id === employee.id) {
      setCurrentUser({ ...currentUser, first_name: employee.first_name, last_name: employee.last_name, role: employee.role.trim() });
    }
    setSection(employee.id ? 'home' : 'employees');
    setOpenSidebarMenu(null);
    setEmployeeDraft(null);
    setEmployeeDetails(null);
    notify(employee.id ? 'Dipendente aggiornato correttamente.' : 'Dipendente creato correttamente.');
  };
  const deleteEmployee = async (employee: Employee) => {
    if (!window.confirm(`Eliminare ${employee.first_name} ${employee.last_name}? Verranno eliminate anche le registrazioni dei suoi stipendi.`)) return;
    try {
      await window.gestionale.deleteEmployee(employee.id, currentUser?.barcode ?? '');
      trackActivity('Dipendenti', 'Dipendente eliminato', `${employee.first_name} ${employee.last_name}`.trim());
      const next = await refresh();
      setEmployeeDetails(null);
      setEmployeeDraft(null);
      setSection(next.employees.length ? 'employees' : 'home');
      if (currentUser?.id === employee.id) {
        setCurrentUser(null);
        setLocked(next.employees.length > 0);
      }
      notify('Dipendente eliminato.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const saveExpense = async (event: FormEvent) => {
    event.preventDefault();
    if (expenseCategory === 'Altro' && !expenseOtherCategory.trim()) {
      notify('Inserisci il nome della categoria personalizzata.');
      return;
    }
    try {
      await window.gestionale.saveExpense({
        description: expenseDescription,
        category: expenseCategory === 'Altro' ? expenseOtherCategory.trim() : expenseCategory,
        amount: Number(expenseAmount),
        expense_date: expenseDate,
        site: 'Negozio',
        receipt_data: expenseReceiptData,
      });
      trackActivity('Spese', 'Spesa registrata', `${expenseDescription.trim()} · ${money.format(Number(expenseAmount))}`);
      await refresh();
      setExpenseDescription('');
      setExpenseCategory(expenseCategories[0]);
      setExpenseOtherCategory('');
      setExpenseAmount('');
      setExpenseDate(localDateKey());
      setExpenseReceiptData('');
      notify('Spesa registrata correttamente.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const attachExpenseReceipt = async (file: File | undefined) => {
    if (!file) return;
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      notify('Allega una ricevuta PDF, PNG, JPG o WEBP di massimo 10 MB.');
      return;
    }
    try {
      setExpenseReceiptData(await fileAsDataUrl(file));
    } catch (error) {
      notify(errorText(error));
    }
  };
  const deleteExpense = async (expense: Expense) => {
    if (!window.confirm(`Eliminare la spesa "${expense.description}"?`)) return;
    try {
      await window.gestionale.deleteExpense(expense.id);
      trackActivity('Spese', 'Spesa eliminata', expense.description);
      await refresh();
      notify('Spesa eliminata.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Eliminare l'articolo "${product.name}"?`)) return;
    try {
      await window.gestionale.deleteProduct(product.id);
      trackActivity('Magazzino', 'Articolo eliminato', product.name);
      await refresh();
      setSelectedProduct(null);
      setProductForm(null);
      notify('Articolo eliminato.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const disposeExpiredProduct = async (product: Product) => {
    if (!window.confirm(`Confermi lo smaltimento di ${product.name}? La giacenza verrà scaricata.`)) return;
    try {
      await window.gestionale.disposeExpiredProduct(product.id);
      trackActivity('Magazzino', 'Articolo scaduto smaltito', product.name);
      await refresh();
      notify(`${product.name} smaltito.`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const createEmployeePdf = async (employee: Employee, doc = new jsPDF(), addPage = false) => {
    if (addPage) doc.addPage();
    const photo = await imageAsPng(employee.photo_data);
    const documents = await Promise.all(employeeDocumentImages(employee.documents_data).map(imageAsPng));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Scheda dipendente', 14, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${data?.settings.shop_name ?? ''} · ${receiptDate.format(new Date())}`, 14, 25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('Foto dipendente', 14, 31);
    doc.text('Foto documenti', 60, 31);
    doc.addImage(photo, 'PNG', 14, 34, 38, 38);
    const documentColumns = 4;
    const documentWidth = 30;
    const documentHeight = 20;
    const documentGap = 3;
    documents.forEach((image, index) => {
      const column = index % documentColumns;
      const row = Math.floor(index / documentColumns);
      doc.addImage(image, 'PNG', 60 + column * (documentWidth + documentGap), 34 + row * (documentHeight + documentGap), documentWidth, documentHeight, undefined, 'FAST');
    });
    const details: Array<[string, string, string?, string?]> = [
      ['Nome', employee.first_name, 'Cognome', employee.last_name],
      ['Età', String(employee.age), 'Sesso', employee.gender],
      ['Indirizzo di casa', employee.home_address],
      ['Indirizzo email', employee.email, 'Numero cellulare', employee.phone],
      ['Ruolo', employee.role, 'Turno', employee.shift],
      ['Metodo di pagamento', employee.payment_method, 'IBAN', employee.payment_method === 'Bonifico' ? employee.iban : '—'],
      ['Stipendio', money.format(employee.salary)],
    ];
    let y = Math.max(83, 34 + Math.ceil(documents.length / documentColumns) * (documentHeight + documentGap) + 9);
    details.forEach(([firstLabel, firstValue, secondLabel, secondValue]) => {
      const fullWidth = !secondLabel;
      const columnWidth = fullWidth ? 182 : 86;
      const secondX = 110;
      const firstLines = doc.splitTextToSize(firstValue || '—', columnWidth);
      const secondLines = secondLabel ? doc.splitTextToSize(secondValue || '—', columnWidth) : [];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(111, 123, 114);
      doc.text(firstLabel, 14, y);
      if (secondLabel) doc.text(secondLabel, secondX, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(41, 53, 46);
      doc.text(firstLines, 14, y + 5);
      if (secondLabel) doc.text(secondLines, secondX, y + 5);
      y += Math.max(16, 7 + Math.max(firstLines.length, secondLines.length) * 4.5);
    });
    return doc;
  };
  const createSalaryPdf = (employee: Employee, paymentDate: string, month: string, amount = employee.salary) => {
    const doc = new jsPDF();
    const displayName = `${employee.first_name} ${employee.last_name}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(data?.settings.shop_name ?? 'Gestionale', 14, 20);
    doc.setFontSize(15);
    doc.text('Ricevuta pagamento stipendio', 14, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Dipendente: ${displayName}`, 14, 54);
    doc.text(`Ruolo: ${employee.role}`, 14, 63);
    doc.text(`Mese di competenza: ${month}`, 14, 72);
    doc.text(`Data pagamento: ${receiptDate.format(new Date(`${paymentDate}T00:00:00`))}`, 14, 81);
    doc.text(`Metodo: ${employee.payment_method}`, 14, 90);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(`Importo: ${money.format(amount)}`, 14, 106);
    doc.setDrawColor(90, 100, 93);
    doc.rect(14, 230, 82, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Firma del dipendente per ricevuta', 18, 264);
    doc.line(18, 258, 92, 258);
    return doc;
  };
  const savePdf = (doc: jsPDF, filename: string) => doc.save(filename);
  const exportEmployeePdf = async (employee: Employee) => {
    try {
      const doc = await createEmployeePdf(employee);
      savePdf(doc, `dipendente-${safeFilePart(employee.first_name)}-${safeFilePart(employee.last_name)}.pdf`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const printEmployeePdf = async (employee: Employee) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      notify('Consenti le finestre popup per stampare la scheda dipendente.');
      return;
    }
    try {
      const doc = await createEmployeePdf(employee);
      const url = URL.createObjectURL(doc.output('blob'));
      printWindow.location.href = url;
      printWindow.addEventListener('afterprint', () => URL.revokeObjectURL(url), { once: true });
      window.setTimeout(() => printWindow.print(), 800);
    } catch (error) {
      printWindow.close();
      notify(errorText(error));
    }
  };
  const exportPayrollZip = async (payments: AppState['payrollPayments']) => {
    if (!data || !payments.length) {
      notify('Non ci sono ricevute da scaricare per questo mese.');
      return;
    }
    const monthDate = new Date(`${payrollMonth}-01T00:00:00`);
    const monthName = monthDate.toLocaleDateString('it-IT', { month: 'long' });
    const folderName = `Stipendi ${monthName.charAt(0).toLocaleUpperCase('it-IT') + monthName.slice(1)} ${monthDate.getFullYear()}`;
    const zip = new JSZip();
    const folder = zip.folder(folderName);
    if (!folder) throw new Error('Impossibile creare la cartella delle ricevute.');
    for (const payment of payments) {
      const employee = data.employees.find((item) => item.id === payment.employee_id);
      if (!employee) throw new Error(`Dipendente non trovato per la ricevuta di ${payment.first_name} ${payment.last_name}.`);
      const pdf = createSalaryPdf(employee, payment.payment_date, payment.pay_month, payment.amount);
      folder.file(`Stipendio-${safeFilePart(employee.first_name)}-${safeFilePart(employee.last_name)}-${payment.payment_date}.pdf`, pdf.output('blob'));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${folderName}.zip`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const payEmployee = async (employee: Employee) => {
    try {
      await window.gestionale.paySalary({ employee_id: employee.id, pay_month: payrollMonth, payment_date: payrollDate });
      trackActivity('Dipendenti', 'Stipendio pagato', `${employee.first_name} ${employee.last_name} · ${payrollMonth}`);
      const next = await refresh();
      const payment = next.payrollPayments.find((item) => item.employee_id === employee.id && item.pay_month === payrollMonth);
      if (payment) savePdf(createSalaryPdf(employee, payment.payment_date, payment.pay_month, payment.amount), `Stipendio-${safeFilePart(employee.first_name)}-${safeFilePart(employee.last_name)}-${payment.payment_date}.pdf`);
      notify(`Stipendio di ${employee.first_name} registrato.`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const payAllEmployees = async () => {
    if (!data) return;
    const alreadyPaid = new Set(data.payrollPayments.filter((payment) => payment.pay_month === payrollMonth).map((payment) => payment.employee_id));
    const dueEmployees = data.employees.filter((employee) => !alreadyPaid.has(employee.id));
    if (!dueEmployees.length) {
      notify('Tutti gli stipendi di questo mese risultano già pagati.');
      return;
    }
    try {
      await window.gestionale.payAllSalaries({ pay_month: payrollMonth, payment_date: payrollDate });
      trackActivity('Dipendenti', 'Stipendi pagati', payrollMonth);
      const next = await refresh();
      const justPaidIds = new Set(dueEmployees.map((employee) => employee.id));
      const payments = next.payrollPayments.filter((payment) => payment.pay_month === payrollMonth && justPaidIds.has(payment.employee_id));
      try {
        await exportPayrollZip(payments);
      } catch (error) {
        notify(`Stipendi registrati, ma non è stato possibile creare lo ZIP: ${errorText(error)}`);
        return;
      }
      notify('Stipendi registrati e ricevute scaricate.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  useEffect(() => {
    const initialize = async () => {
      const [next, pinExists] = await Promise.all([window.gestionale.getState(), window.gestionale.hasPin()]);
      setData(next);
      setShopName(next.settings.shop_name);
      setArchiveFolder(next.settings.archive_folder);
      setHasPin(pinExists);
      setLocked(next.employees.length > 0);
    };
    void initialize().catch((error: unknown) => notify(errorText(error)));
  }, []);
  useEffect(() => window.gestionale.onSalesExpired(() => {
    void refresh().catch((error: unknown) => notify(errorText(error)));
  }), []);
  useEffect(() => {
    if (locked || !data || canAccessSection(activeRole, section)) return;
    setSection(defaultSectionForRole(activeRole));
    setOpenSidebarMenu(null);
  }, [activeRole, data, locked, section]);
  useEffect(() => {
    document.documentElement.dataset.theme = appTheme;
    window.localStorage.setItem('app-theme', appTheme);
  }, [appTheme]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    window.localStorage.setItem('app-language', language);
    const locale = language === 'ar' ? 'ar' : 'it-IT';
    money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
    dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });
    receiptDate = new Intl.DateTimeFormat(locale, { dateStyle: 'short' });
    receiptTime = new Intl.DateTimeFormat(locale, { timeStyle: 'short' });
    navbarDate = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    navbarTime = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
    quantityFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
    receiptQuantity = quantityFormat;
    setCurrentTime(new Date());
  }, [language]);
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const openCash = (event: KeyboardEvent) => {
      if (event.key === 'F2' && !locked && canAccessSection(activeRole, 'cash')) {
        event.preventDefault();
        navigateTo('cash');
      }
    };
    window.addEventListener('keydown', openCash);
    return () => window.removeEventListener('keydown', openCash);
  }, [activeRole, locked, data]);
  useEffect(() => {
    if (section === 'cash' && !camera && !pendingUnknownCode && !productForm) {
      requestAnimationFrame(() => document.getElementById('scanner-field')?.focus());
    }
  }, [section, camera, pendingUnknownCode, productForm]);
  useEffect(() => { if (receipt) { const barcode = document.getElementById('receipt-barcode'); if (barcode) JsBarcode(barcode, receipt.receipt_no, { format: 'CODE128', width: 2.1, height: 48, displayValue: false, margin: 0 }); } }, [receipt]);
  useEffect(() => {
    if (!voucherPrintBatch) return;
    const clearPrintBatch = () => setVoucherPrintBatch(null);
    window.addEventListener('afterprint', clearPrintBatch);
    window.print();
    return () => window.removeEventListener('afterprint', clearPrintBatch);
  }, [voucherPrintBatch]);

  const categories = [...new Set([...savedCategories, ...(data?.products.map((item) => item.category) ?? [])].filter(Boolean))];
  const addProductCategory = (category: string) => {
    const nextCategories = [...new Set([...categories, category])];
    setSavedCategories(nextCategories);
    window.localStorage.setItem('product-categories', JSON.stringify(nextCategories));
  };
  const deleteProductCategory = async (category: string) => {
    const remainingCategories = categories.filter((item) => item !== category);
    const fallback = remainingCategories[0] ?? 'Altro';
    try {
      for (const product of data?.products.filter((item) => item.category === category) ?? []) {
        await window.gestionale.saveProduct({
          code: product.code, name: product.name, unit: product.unit, category: fallback,
          sale_price: product.sale_price, purchase_price: product.purchase_price, stock: product.stock,
          low_stock_threshold: product.low_stock_threshold, expiry_enabled: product.expiry_enabled, expiry_date: product.expiry_date,
        });
      }
      const nextCategories = remainingCategories.length ? remainingCategories : [fallback];
      setSavedCategories(nextCategories);
      window.localStorage.setItem('product-categories', JSON.stringify(nextCategories));
      await refresh();
      return fallback;
    } catch (error) {
      notify(errorText(error));
      throw error;
    }
  };
  const availableSaleProducts = data?.products.filter((product) => product.stock > 0) ?? [];
  const todayKey = localDateKey();
  const promotionDiscounts = calculatePromotionDiscounts(data?.promotions ?? [], data?.products ?? [], cart, todayKey, manualPromotionId, automaticPromotionId);
  const automaticApplicableOffers = promotionDiscounts.automaticApplicablePromotions;
  const manualApplicableOffers = promotionDiscounts.manualApplicablePromotions;
  const automaticDiscount = promotionDiscounts.automaticDiscount;
  const manualDiscount = promotionDiscounts.manualDiscount;
  const addToCart = (product: Product, amount = 1) => {
    const normalizedAmount = roundQuantity(amount);
    setCart((current) => {
      const line = current.find((item) => item.product_id === product.id);
      if (product.stock - (line?.quantity ?? 0) < normalizedAmount) { notify(`Scorta insufficiente per ${product.name}.`); return current; }
      return line
        ? current.map((item) => item.product_id === product.id ? { ...item, quantity: roundQuantity(item.quantity + normalizedAmount) } : item)
        : [...current, { product_id: product.id, name: product.name, code: product.code, unit: product.unit ?? 'PEZZO', quantity: normalizedAmount, unit_price: product.sale_price, purchase_price: product.purchase_price }];
    });
  };
  const scanCode = (code: string) => {
    const normalized = code.trim();
    if (!normalized) return;
    const product = data?.products.find((item) => item.code === normalized);
    setScannerSearch('');
    if (product) addProductToCart(product);
    else if (isCashierRole(activeRole)) notify(`Il codice a barre ${normalized} non è presente tra gli articoli. Contatta un responsabile.`);
    else setPendingUnknownCode(normalized);
  };
  const saveProduct = async (item: ProductInput) => { try { await window.gestionale.saveProduct(item); trackActivity('Magazzino', 'Articolo salvato', item.name); await refresh(); setSelectedProduct(null); setProductEditingId(null); notify('Articolo salvato'); } catch (error) { notify(errorText(error)); throw error; } };
  const saveStock = async (event: FormEvent) => {
    event.preventDefault();
    if (!stockProduct) return;
    const quantity = Number(stockInput);
    if (!Number.isFinite(quantity) || quantity <= 0) { notify('Inserisci una quantità maggiore di zero.'); return; }
    if (!stockMovementEmployeeBarcode) { notify('Scansiona il barcode del personale prima di registrare il carico.'); return; }
    try {
      await window.gestionale.moveStock({ productId: stockProduct.id, type: 'Carico', quantity, employee_barcode: stockMovementEmployeeBarcode, note: 'Carico da dettaglio articolo' });
      trackActivity('Magazzino', 'Carico merce', `${stockProduct.name} · ${quantityFormat.format(quantity)}`, stockMovementEmployeeBarcode);
      await refresh();
      setStockProduct(null);
      setStockMovementEmployeeBarcode('');
      notify('Giacenza aggiornata');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const authorizeProductAction = async (barcode: string) => {
    const authorization = productAuthorization;
    const normalized = barcode.trim();
    if (!authorization || !normalized) return;
    try {
      if (!await window.gestionale.verifyEmployeeBarcode(normalized)) {
        setProductAuthorizationBarcode('');
        notify('Barcode non riconosciuto. Scansiona il badge di un dipendente registrato.');
        return;
      }
      setProductAuthorization(null);
      setProductAuthorizationBarcode('');
      if (authorization.action === 'edit') {
        const product = authorization.product;
        setProductEditingId(product.id);
        setProductForm({
          code: product.code, name: product.name, unit: product.unit ?? 'PEZZO', category: product.category,
          sale_price: product.sale_price, purchase_price: product.purchase_price, stock: product.stock,
          low_stock_threshold: product.low_stock_threshold, expiry_enabled: product.expiry_enabled, expiry_date: product.expiry_date,
        });
      } else {
        setStockInput('');
        setStockMovementEmployeeBarcode(normalized);
        setStockProduct(authorization.product);
      }
      setSelectedProduct(null);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const authorizeInventoryControl = async (barcode: string) => {
    const normalized = barcode.trim();
    if (!normalized) return;
    try {
      if (!await window.gestionale.verifyEmployeeBarcode(normalized)) {
        setInventoryControlBarcode('');
        notify('Barcode dipendente non riconosciuto.');
        return;
      }
      setInventoryControlAuthorized(true);
      setInventoryControlBarcode('');
      notify('Accesso al controllo magazzino autorizzato.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (!await window.gestionale.verifyPin(pin)) {
        notify('PIN non corretto');
        return;
      }
      setCurrentUser({ id: 0, first_name: 'Accesso PIN', last_name: '', role: 'cassiere', barcode: '' });
      setLocked(false);
      setPin('');
      await refresh();
    } catch (error) {
      notify(errorText(error));
    }
  };
  const unlockWithBarcode = async (barcode: string) => {
    const normalized = barcode.trim();
    if (!normalized || loginBarcodeAttempt.current === normalized) return;
    loginBarcodeAttempt.current = normalized;
    try {
      const employee = await window.gestionale.loginEmployee(normalized);
      if (!employee) {
        notify('Barcode non riconosciuto. Scansiona il badge di un dipendente registrato.');
        setLoginBarcode('');
        loginBarcodeAttempt.current = '';
        return;
      }
      setCurrentUser(employee);
      setLocked(false);
      trackActivity('Accesso', 'Accesso al gestionale', '', employee.barcode);
      setSection(defaultSectionForRole(employee.role));
      setLoginBarcode('');
      loginBarcodeAttempt.current = '';
      await refresh();
    } catch (error) {
      loginBarcodeAttempt.current = '';
      notify(errorText(error));
    }
  };
  const startVoucherBatchEdit = (batch: AppState['voucherBatches'][number]) => {
    setEditingVoucherBatchId(batch.id);
    setVoucherPercentage(String(batch.discount_percentage));
    setVoucherStartsAt(batch.starts_at);
    setVoucherEndsAt(batch.ends_at);
    setVoucherPreview(null);
    navigateTo('vouchers-create');
  };
  const generateVoucherPreview = (event: FormEvent) => {
    event.preventDefault();
    const percentage = Number(voucherPercentage);
    const quantity = Number(voucherQuantity);
    if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100
      || !Number.isSafeInteger(quantity) || quantity < 1 || voucherEndsAt < voucherStartsAt) {
      notify('Inserisci una percentuale da 1 a 100, una quantità valida e date corrette.');
      return;
    }
    const existingCodes = new Set(data?.voucherBatches.flatMap((batch) => batch.codes) ?? []);
    const prefix = voucherCodePrefix(data?.settings.shop_name ?? 'Il tuo supermercato');
    const usedShopCodes = [...existingCodes].filter((code) => code.startsWith(prefix)).length;
    if (quantity > voucherCodeSpace - usedShopCodes) {
      notify('Non ci sono abbastanza codici univoci disponibili per questa quantità.');
      return;
    }
    const codes: string[] = [];
    for (let index = 0; index < quantity; index += 1) codes.push(randomVoucherCode(prefix, existingCodes));
    setVoucherPreview({ discount_percentage: percentage, starts_at: voucherStartsAt, ends_at: voucherEndsAt, codes });
  };
  const cancelVoucherPreview = () => {
    setVoucherPreview(null);
    setEditingVoucherBatchId(null);
    setVoucherPercentage('10');
    setVoucherQuantity('1');
    setVoucherStartsAt(localDateKey());
    setVoucherEndsAt(localDateKey());
  };
  const confirmVoucherBatch = async () => {
    if (!voucherPreview) return;
    try {
      await window.gestionale.saveVoucherBatch(voucherPreview);
      trackActivity('Offerta', 'Gruppo buoni creato', `${voucherPreview.codes.length} buoni · ${voucherPreview.discount_percentage}%`);
      await refresh();
      cancelVoucherPreview();
      setSection('vouchers-list');
      notify('Buoni sconto aggiunti alla lista.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const saveVoucherBatchChanges = async (event: FormEvent) => {
    event.preventDefault();
    const batch = data?.voucherBatches.find((item) => item.id === editingVoucherBatchId);
    const percentage = Number(voucherPercentage);
    if (!batch || !Number.isInteger(percentage) || percentage < 1 || percentage > 100 || voucherEndsAt < voucherStartsAt) {
      notify('Controlla percentuale e date del gruppo.');
      return;
    }
    try {
      await window.gestionale.saveVoucherBatch({
        id: batch.id,
        discount_percentage: percentage,
        starts_at: voucherStartsAt,
        ends_at: voucherEndsAt,
        codes: batch.codes,
      });
      trackActivity('Offerta', 'Gruppo buoni modificato', `Gruppo ${batch.id}`);
      await refresh();
      cancelVoucherPreview();
      setSection('vouchers-list');
      notify('Gruppo di buoni sconto aggiornato.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const deleteVoucherBatch = async (batch: AppState['voucherBatches'][number]) => {
    if (!window.confirm(`Eliminare il gruppo ${batch.id} e tutti i suoi buoni non utilizzati?`)) return;
    try {
      await window.gestionale.deleteVoucherBatch(batch.id);
      trackActivity('Offerta', 'Gruppo buoni eliminato', `Gruppo ${batch.id}`);
      await refresh();
      notify('Gruppo di buoni sconto eliminato.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const downloadVoucherBatch = (batch: AppState['voucherBatches'][number]) => {
    const doc = new jsPDF();
    const barcodes = batch.codes.map((code) => barcodePng(code));
    doc.setFontSize(16);
    doc.text(`Buoni sconto gruppo ${batch.id}`, 14, 17);
    doc.setFontSize(10);
    doc.text(`Sconto: ${batch.discount_percentage}%`, 14, 25);
    doc.text(`Validità: ${batch.starts_at} - ${batch.ends_at}`, 14, 31);
    autoTable(doc, {
      startY: 38,
      head: [['Codice', 'Barcode', 'Sconto', 'Data inizio', 'Data scadenza']],
      body: batch.codes.map((code) => [code, '', `${batch.discount_percentage}%`, batch.starts_at, batch.ends_at]),
      styles: { fontSize: 9, minCellHeight: 18 },
      headStyles: { fillColor: [56, 104, 78] },
      didDrawCell: (cell) => {
        if (cell.section === 'body' && cell.column.index === 1) {
          doc.addImage(barcodes[cell.row.index], 'PNG', cell.cell.x + 2, cell.cell.y + 3, cell.cell.width - 4, 12);
        }
      },
    });
    doc.save(`buoni-sconto-gruppo-${batch.id}.pdf`);
  };
  const applyVoucherCode = async (code: string) => {
    const normalized = code.trim();
    setVoucherCode(normalized);
    setVoucherMessage('Verifica del buono in corso…');
    setVoucherDiscountPercentage(0);
    try {
      const result = await window.gestionale.validateVoucher(normalized);
      if (!result.valid) {
        setVoucherMessage(result.message);
        return;
      }
      setVoucherDiscountPercentage(result.discount_percentage);
      setVoucherMessage(`Buono valido · sconto ${result.discount_percentage}%`);
    } catch (error) {
      setVoucherMessage(errorText(error));
    }
  };
  const handleScannedCode = (code: string) => {
    const normalized = code.trim();
    const saleAuthorizationScan = section === 'sale-management' && saleAction !== null;
    const productAuthorizationScan = section === 'inventory' && productAuthorization !== null;
    if (!normalized) return;
    if (locked) {
      void unlockWithBarcode(normalized);
      return;
    }
    if (section === 'inventory-control') {
      if (!inventoryControlAuthorized) void authorizeInventoryControl(normalized);
      else {
        setInventoryControlSearch(normalized);
        if (!data?.products.some((product) => product.code === normalized && product.stock > 0)) {
          notify(`Articolo con barcode ${normalized} non presente in magazzino.`);
        }
      }
      return;
    }
    if (!data || (!data.settings.barcode_scanner_enabled && !saleAuthorizationScan && !productAuthorizationScan)) return;
    if (data.settings.barcode_scanner_enabled && !data.settings.barcode_scanner_detected) {
      setData((current) => current ? { ...current, settings: { ...current.settings, barcode_scanner_detected: true } } : current);
      void window.gestionale.saveSetting('barcode_scanner_detected', 'true').catch((error: unknown) => notify(errorText(error)));
    }
    if (productAuthorizationScan) {
      void authorizeProductAction(normalized);
    } else if (checkoutOpen) {
      void applyVoucherCode(normalized);
    }
    else if (section === 'cash') scanCode(normalized);
    else if (section === 'inventory' && stockProduct) {
      const employee = data.employees.find((item) => item.barcode === normalized);
      if (!employee) {
        setStockMovementEmployeeBarcode('');
        notify('Barcode personale non riconosciuto. Scansiona il badge di un dipendente registrato.');
        return;
      }
      setStockMovementEmployeeBarcode(normalized);
      notify(`Personale riconosciuto: ${employee.first_name} ${employee.last_name}.`);
    } else if (section === 'inventory') setInventorySearch(normalized);
    else if (section === 'sales') setSaleSearch(normalized.replace(/\D/g, ''));
    else if (section === 'sale-management') {
      if (saleAction) void authorizeSaleAction(normalized);
      else setSaleManagementSearch(normalized.replace(/\D/g, ''));
    }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const saleAuthorizationScan = section === 'sale-management' && saleAction !== null;
      const productAuthorizationScan = section === 'inventory' && productAuthorization !== null;
      if (!['cash', 'inventory', 'inventory-control', 'sales', 'stock-movement', 'sale-management'].includes(section)
        || (!locked && section !== 'inventory-control' && !data?.settings.barcode_scanner_enabled && !saleAuthorizationScan && !productAuthorizationScan)) return;
      const now = performance.now();
      const sequence = scannerSequence.current;
      if (event.key === 'Enter') {
        const averageInterval = sequence.value.length > 1 ? (now - sequence.startedAt) / (sequence.value.length - 1) : Infinity;
        const completeBarcode = saleAuthorizationScan || locked || productAuthorizationScan || section === 'inventory-control'
          ? sequence.value.length >= 4
          : sequence.value.length >= 4 && now - sequence.startedAt <= 600 && averageInterval <= 75;
        if (completeBarcode) {
          event.preventDefault();
          event.stopPropagation();
          handleScannedCode(sequence.value);
          if (section === 'cash' && !checkoutOpen) requestAnimationFrame(() => document.getElementById('scanner-field')?.focus());
        }
        sequence.value = '';
        return;
      }
      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
      if (now - sequence.lastAt > 100) {
        sequence.value = '';
        sequence.startedAt = now;
      }
      sequence.value += event.key;
      sequence.lastAt = now;
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [data, section, checkoutOpen, stockProduct, saleAction, locked, productAuthorization]);
  useEffect(() => {
    if (section !== 'settings' || settingsTab !== 'Dispositivi' || deviceTab !== 'Stampante scontrini') return;
    void window.gestionale.getPrinters().then(setPrinters).catch((error: unknown) => notify(errorText(error)));
  }, [section, settingsTab, deviceTab]);
  const changeSaleDiscount = (percentage: number) => {
    if (!saleDialog) return;
    const gross = saleDialog.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    setSaleDialog({ ...saleDialog, discount: Math.round(gross * percentage) / 100 });
  };
  const changeSaleQuantity = (index: number, quantity: number) => {
    if (!saleDialog) return;
    const items = quantity <= 0
      ? saleDialog.items.filter((_, itemIndex) => itemIndex !== index)
      : saleDialog.items.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: roundQuantity(quantity) } : item);
    const gross = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    setSaleDialog({ ...saleDialog, items, discount: Math.round(gross * saleDiscountPercentage) / 100 });
  };
  const addProductToSaleCart = (product: Product, amount?: number) => {
    if (amount === undefined && (product.unit === 'KG' || product.unit === 'LITRO')) {
      setMeasuredProduct(product);
      setMeasuredTarget('sale-edit');
      setMeasuredQuantity('');
      return;
    }
    const addedAmount = roundQuantity(amount ?? 1);
    const staged = saleCart.find((item) => item.product_id === product.id);
    const originalQuantity = data?.sales.find((sale) => sale.id === saleDialog?.id)?.items
      .filter((item) => item.product_id === product.id).reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    const editedQuantity = saleDialog?.items
      .filter((item) => item.product_id === product.id).reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    if (product.stock + originalQuantity - editedQuantity - (staged?.quantity ?? 0) < addedAmount) { notify(`Scorta insufficiente per ${product.name}.`); return; }
    setSaleCart((current) => staged
      ? current.map((item) => item.product_id === product.id ? { ...item, quantity: roundQuantity(item.quantity + addedAmount) } : item)
      : [...current, { product_id: product.id, name: product.name, code: product.code, unit: product.unit ?? 'PEZZO', quantity: addedAmount, unit_price: product.sale_price, purchase_price: product.purchase_price }]);
  };
  const addProductToSale = () => {
    if (!saleDialog || !saleCart.length) return;
    const items = saleDialog.items.map((item) => ({ ...item }));
    saleCart.forEach((added) => {
      const existing = items.find((item) => item.product_id === added.product_id);
      if (existing) existing.quantity = roundQuantity(existing.quantity + added.quantity);
      else items.push(added);
    });
    const gross = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    setSaleDialog({ ...saleDialog, items, discount: Math.round(gross * saleDiscountPercentage) / 100 });
    setSaleCart([]);
    setSaleProductSearch('');
    setSaleAddOpen(false);
  };
  const addProductToCart = (product: Product, target: 'cash' | 'sale-edit' = 'cash') => {
    if (product.unit === 'KG' || product.unit === 'LITRO') {
      setMeasuredProduct(product);
      setMeasuredTarget(target);
      setMeasuredQuantity('');
      return;
    }
    if (target === 'cash') addToCart(product);
    else addProductToSaleCart(product);
  };
  const addMeasuredQuantity = (quantityValue: number) => {
    if (!measuredProduct) return;
    const quantity = roundQuantity(quantityValue);
    if (!Number.isFinite(quantity) || quantity <= 0) { notify('Inserisci un peso o un volume maggiore di zero.'); return; }
    if (measuredTarget === 'cash') {
      const inCart = cart.find((item) => item.product_id === measuredProduct.id)?.quantity ?? 0;
      if (measuredProduct.stock - inCart < quantity) { notify(`Scorta insufficiente per ${measuredProduct.name}.`); return; }
      addToCart(measuredProduct, quantity);
    } else {
      const staged = saleCart.find((item) => item.product_id === measuredProduct.id)?.quantity ?? 0;
      const original = data?.sales.find((sale) => sale.id === saleDialog?.id)?.items
        .filter((item) => item.product_id === measuredProduct.id).reduce((sum, item) => sum + item.quantity, 0) ?? 0;
      const edited = saleDialog?.items.filter((item) => item.product_id === measuredProduct.id)
        .reduce((sum, item) => sum + item.quantity, 0) ?? 0;
      if (measuredProduct.stock + original - edited - staged < quantity) { notify(`Scorta insufficiente per ${measuredProduct.name}.`); return; }
      addProductToSaleCart(measuredProduct, quantity);
    }
    setMeasuredProduct(null);
    setMeasuredQuantity('');
  };
  const confirmMeasuredQuantity = (event: FormEvent) => {
    event.preventDefault();
    addMeasuredQuantity(Number(measuredQuantity));
  };
  const authorizeSaleAction = async (scannedBarcode = saleEmployeeBarcode.trim()) => {
    if (!saleAction) return;
    try {
      const authorized = await window.gestionale.authorizeSaleAction(scannedBarcode);
      if (!authorized) {
        notify('Barcode dipendente non riconosciuto. Scansiona il codice di riconoscimento di un dipendente.');
        return;
      }
      setSaleEmployeeBarcode(scannedBarcode);
      if (saleAction.action === 'edit') {
        setSaleDiscountPercentage(saleAction.sale.gross_total > 0
          ? saleAction.sale.discount / saleAction.sale.gross_total * 100
          : 0);
        setSaleDialog(saleAction.sale);
        setSaleAction(null);
      } else {
        await deleteSale(saleAction.sale, scannedBarcode);
        setSaleAction(null);
        setSaleEmployeeBarcode('');
      }
    } catch (error) {
      notify(errorText(error));
    }
  };
  const updateSale = async () => {
    if (!saleDialog) return;
    const items = saleDialog.items.filter((item) => item.quantity > 0);
    if (!items.length) { notify('Una vendita deve contenere almeno un articolo.'); return; }
    if (saleDiscountPercentage < 0 || saleDiscountPercentage > 100) { notify('Lo sconto deve essere compreso tra 0 e 100%.'); return; }
    try {
      const saleId = saleDialog.id;
      const previousTotal = saleDialog.total;
      await window.gestionale.updateSale({
        id: saleId,
        payment_method: saleDialog.payment_method,
        discount: saleDialog.discount,
        items,
        employee_barcode: saleEmployeeBarcode.trim(),
      });
      trackActivity('Modifica o Elimina', 'Vendita modificata', `Scontrino ${saleDialog.receipt_no}`, saleEmployeeBarcode.trim());
      const next = await refresh();
      const updatedSale = next.sales.find((sale) => sale.id === saleId);
      setSaleDialog(null);
      setSaleEmployeeBarcode('');
      if (!updatedSale) throw new Error('Vendita aggiornata ma non trovata nell’archivio.');
      setSaleAdjustment(Math.round((updatedSale.total - previousTotal) * 100) / 100);
    } catch (error) {
      notify(errorText(error));
      await refresh();
    }
  };
  const deleteSale = async (sale: Sale, employeeBarcode: string) => {
    try {
      await window.gestionale.deleteSale(sale.id, employeeBarcode);
      trackActivity('Modifica o Elimina', 'Vendita eliminata', `Scontrino ${sale.receipt_no}`, employeeBarcode);
      await refresh();
      setSaleDialog(null);
      setSaleEmployeeBarcode('');
      notify('Vendita eliminata.');
    } catch (error) {
      notify(errorText(error));
      await refresh();
    }
  };
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const totalBeforeVoucher = Math.max(0, subtotal - automaticDiscount - manualDiscount);
  const voucherDiscount = Math.round(totalBeforeVoucher * voucherDiscountPercentage) / 100;
  const total = Math.max(0, totalBeforeVoucher - voucherDiscount);
  const stockMovementSites = [...new Set((data?.employees ?? []).map((employee) => employee.operational_site.trim()).filter(Boolean))];
  const changeQuantity = (id: number, amount: number) => {
    const line = cart.find((item) => item.product_id === id);
    const product = data?.products.find((item) => item.id === id);
    const step = line?.unit === 'PEZZO' || !line?.unit ? 1 : 0.1;
    if (amount > 0 && line && product && line.quantity + step > product.stock) { notify(`Scorta insufficiente per ${line.name}.`); return; }
    setCart((current) => current.map((item) => item.product_id === id ? { ...item, quantity: Math.max(0, roundQuantity(item.quantity + amount * step)) } : item).filter((item) => item.quantity > 0));
  };
  const checkout = async () => {
    try {
      const sale = await window.gestionale.checkout({
        items: cart,
        payment_method: paymentMethod,
        employee_barcode: currentUser?.barcode || undefined,
        voucher_code: voucherCode || undefined,
        manual_promotion_id: promotionDiscounts.manualPromotion?.id,
        automatic_promotion_id: automaticPromotionId,
      });
      trackActivity('Cassa', 'Vendita completata', `Scontrino ${sale.receipt_no} · ${money.format(sale.total)}`);
      setCart([]);
      setVoucherCode('');
      setVoucherMessage('');
      setVoucherDiscountPercentage(0);
      setManualPromotionId(undefined);
      setAutomaticPromotionId(undefined);
      setCheckoutOpen(false);
      await refresh();
      setReceipt(sale);
      window.setTimeout(printReceipt, 300);
    } catch (error) { notify(errorText(error)); await refresh(); }
  };
  const saveStoreName = async (event: FormEvent) => { event.preventDefault(); await window.gestionale.saveSetting('shop_name', shopName.trim() || 'Il tuo supermercato'); await refresh(); notify('Nome negozio aggiornato'); };
  const saveReceiptPrinter = async (printerName: string) => {
    try {
      await window.gestionale.saveSetting('receipt_printer', printerName);
      await refresh();
      notify(printerName ? 'Stampante scontrini collegata' : 'Stampante scontrini rimossa');
    } catch (error) { notify(errorText(error)); }
  };
  const toggleBarcodeScanner = async () => {
    const enabled = !data?.settings.barcode_scanner_enabled;
    try {
      await window.gestionale.saveSetting('barcode_scanner_enabled', String(enabled));
      await refresh();
      notify(enabled ? 'Lettore barcode attivato' : 'Lettore barcode disattivato');
    } catch (error) { notify(errorText(error)); }
  };
  const chooseShopLogo = async () => { try { const logo = await window.gestionale.chooseShopLogo(); if (logo) { await refresh(); notify('Logo del negozio aggiornato'); } } catch (error) { notify(errorText(error)); } };
  const chooseHomepageImage = async () => { try { const image = await window.gestionale.chooseHomepageImage(); if (image) { await refresh(); notify('Immagine homepage aggiornata'); } } catch (error) { notify(errorText(error)); } };
  const chooseFolder = async () => { const chosen = await window.gestionale.chooseArchiveFolder(); if (chosen) { setArchiveFolder(chosen); await refresh(); notify('Cartella archivio aggiornata'); } };
  const savePromotion = async (event: FormEvent) => {
    event.preventDefault();
    const selectedMinimum = promotionMinimum === 'spend' ? promotion.minimum_spend : promotionMinimum === 'kilograms' ? promotion.minimum_kilograms : promotionMinimum === 'pieces' ? promotion.minimum_pieces : promotionMinimum === 'liters' ? promotion.minimum_liters : 0;
    if (promotionMinimum !== 'none' && (!Number.isFinite(selectedMinimum) || (selectedMinimum ?? 0) <= 0)) { notify('Inserisci un requisito minimo maggiore di zero.'); return; }
    try {
      await window.gestionale.savePromotion({ ...promotion, minimum_spend: promotionMinimum === 'spend' ? promotion.minimum_spend : 0, minimum_kilograms: promotionMinimum === 'kilograms' ? promotion.minimum_kilograms : 0, minimum_pieces: promotionMinimum === 'pieces' ? promotion.minimum_pieces : 0, minimum_liters: promotionMinimum === 'liters' ? promotion.minimum_liters : 0 });
      trackActivity('Offerta', promotion.id === undefined ? 'Promozione creata' : 'Promozione modificata', promotion.name);
      await refresh();
      const wasEditing = promotion.id !== undefined;
      resetPromotionForm();
      notify(wasEditing ? 'Promozione aggiornata' : 'Promozione creata');
    } catch (error) { notify(errorText(error)); }
  };
  const changePromotionDuration = (duration: string) => {
    setPromotionDuration(duration);
    if (duration !== 'Personalizzata') setPromotion((current) => ({ ...current, ends_at: promotionEndDate(current.starts_at, duration) }));
  };
  const changePromotionStart = (startsAt: string) => setPromotion((current) => ({
    ...current,
    starts_at: startsAt,
    ...(promotionDuration === 'Personalizzata' ? {} : { ends_at: promotionEndDate(startsAt, promotionDuration) }),
  }));
  const deletePromotion = async (offer: Promotion) => {
    if (!window.confirm(`Eliminare l'offerta "${offer.name}"?`)) return;
    try {
      await window.gestionale.deletePromotion(offer.id);
      trackActivity('Offerta', 'Promozione eliminata', offer.name);
      await refresh();
      if (promotion.id === offer.id) resetPromotionForm();
      notify('Offerta eliminata');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const exportReport = async (respectTimeFilters: boolean) => {
    if (!data) return;
    try {
      const reportSales = data.sales.filter((sale) => !respectTimeFilters || matchesSalesPeriod(sale.created_at));
      const gross = reportSales.reduce((sum, sale) => sum + sale.gross_total, 0);
      const net = reportSales.reduce((sum, sale) => sum + sale.total, 0);
      const cost = reportSales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.purchase_price * item.quantity, 0), 0);
      const reportPeriod = respectTimeFilters ? ` · Periodo: ${salesPeriod}` : ' · Tutto il periodo';
      const doc = new jsPDF({ orientation: 'portrait' });
      doc.setFillColor(43, 82, 61);
      doc.rect(0, 0, 210, 36, 'F');
      if (data.settings.shop_logo) {
        doc.addImage(await imageAsPng(data.settings.shop_logo), 'PNG', 12, 5, 24, 24);
      }
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(data.settings.shop_name, data.settings.shop_logo ? 43 : 14, 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Report vendite · Esportato il ${receiptDate.format(new Date())}${reportPeriod}`, data.settings.shop_logo ? 43 : 14, 26);
      doc.setFillColor(56, 104, 78);
      doc.roundedRect(8, 41, 194, 17, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`Vendite: ${reportSales.length}`, 12, 51);
      doc.text(`Lordo: ${money.format(gross)}`, 59, 51);
      doc.text(`Costo merce: ${money.format(cost)}`, 106, 51);
      doc.text(`Profitto: ${money.format(net - cost)}`, 157, 51);
      autoTable(doc, {
        startY: 64,
        head: [['Scontrino', 'Data e ora', 'Articoli', 'Pagamento', 'Prezzo acquisto', 'Prezzo vendita', 'Profitto', 'Sconto', 'Totale']],
        body: reportSales.map((sale) => {
          const purchasePrice = sale.items.reduce((sum, item) => sum + item.quantity * item.purchase_price, 0);
          const salePrice = sale.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
          const totalQuantity = sale.items.reduce((sum, item) => sum + item.quantity, 0);
          return [sale.receipt_no, dateTime.format(new Date(sale.created_at)), quantityFormat.format(totalQuantity), sale.payment_method, money.format(purchasePrice), money.format(salePrice), money.format(sale.total - purchasePrice), money.format(sale.discount), money.format(sale.total)];
        }),
        showHead: 'firstPage',
        theme: 'striped',
        styles: { fontSize: 6.5, cellPadding: 2, overflow: 'linebreak', textColor: [49, 60, 53], lineColor: [224, 230, 224] },
        headStyles: { fillColor: [56, 104, 78], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [244, 247, 244] },
        margin: { left: 8, right: 8, bottom: 14 },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(120, 130, 122);
          doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 8, 290);
        },
      });
      doc.save(`report-vendite-${respectTimeFilters ? salesPeriod.toLowerCase().replaceAll(' ', '-') : 'tutto'}-${todayKey}.pdf`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const exportInventoryReport = async () => {
    if (!data) return;
    try {
      const doc = new jsPDF({ orientation: 'portrait' });
      const stockValue = data.products.reduce((sum, item) => sum + item.stock * item.purchase_price, 0);
      const stockSaleValue = data.products.reduce((sum, item) => sum + item.stock * item.sale_price, 0);
      const lowStockCount = data.products.filter((item) => item.stock <= item.low_stock_threshold).length;
      doc.setFillColor(43, 82, 61);
      doc.rect(0, 0, 210, 36, 'F');
      if (data.settings.shop_logo) doc.addImage(await imageAsPng(data.settings.shop_logo), 'PNG', 12, 5, 24, 24);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(data.settings.shop_name, data.settings.shop_logo ? 43 : 14, 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Report magazzino · Esportato il ' + receiptDate.format(new Date()), data.settings.shop_logo ? 43 : 14, 26);
      autoTable(doc, {
        startY: 43,
        head: [['Codice', 'Articolo', 'Categoria', 'Vendita', 'Acquisto', 'Profitto', 'Giacenza', 'Soglia', 'Scadenza']],
        body: data.products.map((item) => [item.code, item.name, item.category, money.format(item.sale_price), money.format(item.purchase_price), money.format(item.sale_price - item.purchase_price), `${item.stock} ${item.unit === 'KG' ? 'kg' : item.unit === 'LITRO' ? 'lit.' : 'pz'}`, String(item.low_stock_threshold), item.expiry_enabled && item.expiry_date ? receiptDate.format(new Date(`${item.expiry_date}T00:00:00`)) : '—']),
        theme: 'striped',
        styles: { fontSize: 6, cellPadding: 1.5, overflow: 'linebreak', textColor: [49, 60, 53], lineColor: [224, 230, 224] },
        headStyles: { fillColor: [56, 104, 78], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [244, 247, 244] },
        margin: { left: 8, right: 8, bottom: 22 },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(120, 130, 122);
          doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 8, 287);
        },
      });
      const tableLayout = (doc as jsPDF & { lastAutoTable?: AutoTableTable }).lastAutoTable;
      if (tableLayout?.finalY === undefined) throw new Error('Impossibile determinare la fine della tabella del report.');
      let summaryY = tableLayout.finalY + 8;
      if (summaryY + 24 > 279) {
        doc.addPage();
        summaryY = 20;
        doc.setFontSize(8);
        doc.setTextColor(120, 130, 122);
        doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 8, 287);
      }
      doc.setFillColor(56, 104, 78);
      doc.roundedRect(14, summaryY, 182, 24, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      const summary = [
        ['Articoli', String(data.products.length)],
        ['Soglia', String(lowStockCount)],
        ['Acq.', money.format(stockValue)],
        ['Vend.', money.format(stockSaleValue)],
        ['Netto', money.format(stockSaleValue - stockValue)],
      ];
      summary.forEach(([label, value], index) => {
        const x = 17 + index * 36;
        doc.text(`${label}: ${value}`, x, summaryY + 15, { maxWidth: 35 });
      });
      doc.save(`report-magazzino-${todayKey}.pdf`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const exportEmployeeList = async () => {
    if (!data) return;
    try {
      if (!data.employees.length) {
        notify('Non ci sono dipendenti da esportare.');
        return;
      }
      const doc = new jsPDF();
      doc.setFillColor(43, 82, 61);
      doc.rect(0, 0, 210, 297, 'F');
      if (data.settings.shop_logo) doc.addImage(await imageAsPng(data.settings.shop_logo), 'PNG', 79, 46, 52, 52);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(25);
      doc.text(data.settings.shop_name, 105, data.settings.shop_logo ? 122 : 95, { align: 'center', maxWidth: 170 });
      doc.setFontSize(18);
      doc.text('Lista dipendenti', 105, data.settings.shop_logo ? 143 : 120, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`${data.employees.length} dipendenti · ${receiptDate.format(new Date())}`, 105, data.settings.shop_logo ? 155 : 132, { align: 'center' });
      for (const employee of data.employees) await createEmployeePdf(employee, doc, true);
      doc.save(`lista-dipendenti-${todayKey}.pdf`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const exportEmployeeContracts = async () => {
    if (!data) return;
    try {
      if (!data.employees.length) {
        notify('Non ci sono contratti da scaricare.');
        return;
      }
      const zip = new JSZip();
      const folder = zip.folder('Contratti dipendenti');
      if (!folder) throw new Error('Impossibile creare la cartella dei contratti.');
      for (const employee of data.employees) {
        if (!employee.contract_pdf_data.startsWith('data:application/pdf;base64,')) {
          throw new Error(`Il contratto PDF di ${employee.first_name} ${employee.last_name} non è disponibile.`);
        }
        const contract = await fetch(employee.contract_pdf_data).then((response) => response.arrayBuffer());
        const fullName = `${employee.first_name} ${employee.last_name}`;
        const duplicateName = data.employees.some((item) =>
          item.id !== employee.id && `${item.first_name} ${item.last_name}`.toLocaleLowerCase('it') === fullName.toLocaleLowerCase('it')
        );
        folder.file(`${safeFilePart(fullName)}${duplicateName ? `-${employee.id}` : ''}.pdf`, contract);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `contratti-dipendenti-${todayKey}.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const exportSalesXlsx = async (respectTimeFilters: boolean) => {
    if (!data) return;
    try {
      const sales = data.sales.filter((sale) => !respectTimeFilters || matchesSalesPeriod(sale.created_at));
      const headers = ['N° scontrino', 'Data e ora', 'Met. di pagamento', 'Articoli', 'Quantità totale', 'Totale lordo', 'Sconto', 'Totale netto'];
      const xmlText = (value: string) => value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      const columnNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const rows = sales.map((sale) => [
        sale.receipt_no,
        dateTime.format(new Date(sale.created_at)),
        sale.payment_method,
        sale.items.map((item) => `${item.name} (${quantityFormat.format(item.quantity)} ${item.unit === 'KG' ? 'kg' : item.unit === 'LITRO' ? 'lit.' : 'pz'})`).join(', '),
        sale.items.reduce((sum, item) => sum + item.quantity, 0),
        sale.gross_total,
        sale.discount,
        sale.total,
      ]);
      const makeCell = (columnIndex: number, rowIndex: number, value: string | number, style?: number) => {
        const ref = `${columnNames[columnIndex]}${rowIndex}`;
        const styleAttribute = style === undefined ? '' : ` s="${style}"`;
        if (typeof value === 'number') return `<c r="${ref}"${styleAttribute}><v>${Number.isFinite(value) ? value : 0}</v></c>`;
        return `<c r="${ref}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
      };
      const headerRow = `<row r="1" ht="30" customHeight="1">${headers.map((header, index) => makeCell(index, 1, header, 1)).join('')}</row>`;
      const bodyRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 2}">${row.map((value, columnIndex) =>
        makeCell(columnIndex, rowIndex + 2, value, columnIndex === 4 ? 3 : columnIndex >= 5 ? 2 : undefined)
      ).join('')}</row>`).join('');
      const zip = new JSZip();
      zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
      zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
      zip.folder('xl')?.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Vendite" sheetId="1" r:id="rId1"/></sheets></workbook>`);
      zip.folder('xl')?.folder('_rels')?.file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
      zip.folder('xl')?.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.000"/><numFmt numFmtId="165" formatCode="#,##0.00 &quot;€&quot;"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="14"/><color rgb="FF000000"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF38684E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`);
      zip.folder('xl')?.folder('worksheets')?.file('sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:H${rows.length + 1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="19" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="3" width="24" customWidth="1"/><col min="4" max="4" width="60" customWidth="1"/><col min="5" max="5" width="18" customWidth="1"/><col min="6" max="8" width="18" customWidth="1"/></cols><sheetData>${headerRow}${bodyRows}</sheetData></worksheet>`);
      const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vendite-${todayKey}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const exportEmployeeActivityXlsx = async () => {
    if (!data) return;
    const rows = employeeActivityList.map((entry) => [
      dateTime.format(new Date(entry.created_at)),
      entry.employee_name,
      entry.action,
      entry.section,
      entry.detail,
    ]);
    const headers = ['Data e ora', 'Dipendente', 'Attività', 'Sezione', 'Dettagli'];
    const columnNames = ['A', 'B', 'C', 'D', 'E'];
    const xmlText = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const cell = (columnIndex: number, rowIndex: number, value: string) => `<c r="${columnNames[columnIndex]}${rowIndex}"${rowIndex === 1 ? ' s="1"' : ''} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
    const headerRow = `<row r="1" ht="30" customHeight="1">${headers.map((header, index) => cell(index, 1, header)).join('')}</row>`;
    const bodyRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 2}">${row.map((value, columnIndex) => cell(columnIndex, rowIndex + 2, value)).join('')}</row>`).join('');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
    zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.folder('xl')?.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tracker" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.folder('xl')?.folder('_rels')?.file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.folder('xl')?.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="14"/><color rgb="FF000000"/><name val="Aptos"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>`);
    zip.folder('xl')?.folder('worksheets')?.file('sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:E${rows.length + 1}"/><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="27" customWidth="1"/><col min="3" max="3" width="34" customWidth="1"/><col min="4" max="4" width="30" customWidth="1"/><col min="5" max="5" width="58" customWidth="1"/></cols><sheetData>${headerRow}${bodyRows}</sheetData></worksheet>`);
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tracker-dipendenti-${todayKey}.xlsx`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const todaySales = data?.sales.filter((sale) => new Date(sale.created_at).toDateString() === new Date().toDateString()) ?? [];
  const dailyProfit = todaySales.reduce((sum, sale) =>
    sum + sale.total - sale.items.reduce((cost, item) => cost + item.quantity * item.purchase_price, 0), 0);
  const dailyGross = todaySales.reduce((sum, sale) => sum + sale.gross_total, 0);
  const dailyUnits = todaySales.reduce((sum, sale) => sum + sale.item_count, 0);
  const balanceMonthCount = balancePeriod === 'Ultimi 3 mesi' ? 3 : balancePeriod === 'Ultimi 6 mesi' ? 6 : 12;
  const balanceRangeStart = new Date();
  balanceRangeStart.setHours(0, 0, 0, 0);
  const balanceStartDay = balanceRangeStart.getDate();
  const balanceTargetMonth = new Date(balanceRangeStart.getFullYear(), balanceRangeStart.getMonth() - balanceMonthCount, 1);
  balanceRangeStart.setFullYear(
    balanceTargetMonth.getFullYear(),
    balanceTargetMonth.getMonth(),
    Math.min(balanceStartDay, new Date(balanceTargetMonth.getFullYear(), balanceTargetMonth.getMonth() + 1, 0).getDate()),
  );
  const balanceRangeStartKey = localDateKey(balanceRangeStart);
  const balanceSales = data?.sales.filter((sale) => new Date(sale.created_at) >= balanceRangeStart) ?? [];
  const balanceExpenses = data?.expenses.filter((expense) => expense.expense_date >= balanceRangeStartKey && expense.expense_date <= todayKey) ?? [];
  const balanceRevenue = balanceSales.reduce((sum, sale) => sum + sale.total, 0);
  const balanceGoodsCost = balanceSales.reduce((sum, sale) =>
    sum + sale.items.reduce((cost, item) => cost + item.quantity * item.purchase_price, 0), 0);
  const balanceOperatingExpenses = balanceExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const balanceOperatingResult = balanceRevenue - balanceGoodsCost - balanceOperatingExpenses;
  const balanceFirstMonth = new Date(balanceRangeStart.getFullYear(), balanceRangeStart.getMonth(), 1);
  const balanceMonthsInRange = (new Date().getFullYear() - balanceFirstMonth.getFullYear()) * 12
    + new Date().getMonth() - balanceFirstMonth.getMonth() + 1;
  const balanceMonthly = Array.from({ length: balanceMonthsInRange }, (_, index) => {
    const month = new Date(balanceFirstMonth.getFullYear(), balanceFirstMonth.getMonth() + index, 1);
    const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    const salesInMonth = balanceSales.filter((sale) => sale.created_at.slice(0, 7) === monthKey);
    const revenue = salesInMonth.reduce((sum, sale) => sum + sale.total, 0);
    const goodsCost = salesInMonth.reduce((sum, sale) =>
      sum + sale.items.reduce((cost, item) => cost + item.quantity * item.purchase_price, 0), 0);
    const expenses = balanceExpenses.filter((expense) => expense.expense_date.startsWith(monthKey))
      .reduce((sum, expense) => sum + expense.amount, 0);
    return {
      mese: month.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' }),
      vendite: revenue,
      costiMerce: goodsCost,
      speseOperative: expenses,
      risultato: revenue - goodsCost - expenses,
    };
  });
  const statisticsStart = new Date();
  statisticsStart.setHours(0, 0, 0, 0);
  const statisticsDays: Record<string, number> = { 'Ultimo giorno': 1, 'Ultimi 3 giorni': 3, 'Ultima settimana': 7 };
  if (statisticsDays[statisticsPeriod]) statisticsStart.setDate(statisticsStart.getDate() - statisticsDays[statisticsPeriod] + 1);
  else if (statisticsPeriod !== 'Tutti') {
    const months = statisticsPeriod === 'Ultimo mese' ? 1 : statisticsPeriod === 'Ultimi 3 mesi' ? 3 : statisticsPeriod === 'Ultimi 6 mesi' ? 6 : 12;
    const day = statisticsStart.getDate();
    const targetMonth = new Date(statisticsStart.getFullYear(), statisticsStart.getMonth() - months, 1);
    statisticsStart.setFullYear(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(day, new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate()));
  }
  if (statisticsPeriod === 'Tutti' && data?.sales.length) {
    const oldestSale = data.sales.reduce((oldest, sale) => {
      const saleDate = new Date(sale.created_at);
      return saleDate < oldest ? saleDate : oldest;
    }, new Date(data.sales[0].created_at));
    statisticsStart.setFullYear(oldestSale.getFullYear(), oldestSale.getMonth(), 1);
  }
  const statisticsSales = statisticsPeriod === 'Tutti'
    ? data?.sales ?? []
    : data?.sales.filter((sale) => new Date(sale.created_at) >= statisticsStart) ?? [];
  const statisticsExpenses = (data?.expenses ?? []).filter((expense) =>
    expense.expense_date <= todayKey && (statisticsPeriod === 'Tutti' || expense.expense_date >= localDateKey(statisticsStart)));
  const soldCost = statisticsSales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.quantity * item.purchase_price, 0), 0);
  const soldTotal = statisticsSales.reduce((sum, sale) => sum + sale.total, 0);
  const estimatedNet = soldTotal - soldCost - statisticsExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const soldUnits = statisticsSales.reduce((sum, sale) => sum + sale.item_count, 0);
  const totalTrackedUnits = soldUnits + (data?.products.reduce((sum, product) => sum + product.stock, 0) ?? 0);
  const unsoldProducts = data?.products.filter((product) => product.stock > 0) ?? [];
  const stockCost = data?.products.reduce((sum, item) => sum + item.stock * item.purchase_price, 0) ?? 0;
  const stockRetail = data?.products.reduce((sum, item) => sum + item.stock * item.sale_price, 0) ?? 0;
  const productSales = statisticsSales.flatMap((sale) => sale.items).reduce<Record<number, { quantity: number; revenue: number }>>((totals, item) => {
    const total = totals[item.product_id] ?? { quantity: 0, revenue: 0 };
    totals[item.product_id] = { quantity: total.quantity + item.quantity, revenue: total.revenue + item.quantity * item.unit_price };
    return totals;
  }, {});
  const productSalesRanking = (data?.products ?? []).map((product) => ({
    ...product,
    quantitySold: productSales[product.id]?.quantity ?? 0,
    revenue: productSales[product.id]?.revenue ?? 0,
  })).sort((left, right) => right.quantitySold - left.quantitySold || left.name.localeCompare(right.name, 'it'));
  const categoriesSales = statisticsSales.flatMap((sale) => sale.items).reduce<Record<string, number>>((totals, item) => { const cat = data?.products.find((product) => product.id === item.product_id)?.category ?? 'Altro'; totals[cat] = (totals[cat] ?? 0) + item.quantity * item.unit_price; return totals; }, {});
  const paymentTotals = statisticsSales.reduce<Record<string, number>>((totals, sale) => { totals[sale.payment_method] = (totals[sale.payment_method] ?? 0) + sale.total; return totals; }, {});
  const currentMonth = new Date();
  const monthsBetween = (currentMonth.getFullYear() - statisticsStart.getFullYear()) * 12 + currentMonth.getMonth() - statisticsStart.getMonth();
  const monthlySales = Array.from({ length: monthsBetween + 1 }, (_, index) => {
    const month = new Date(statisticsStart.getFullYear(), statisticsStart.getMonth() + index, 1);
    const monthSales = statisticsSales.filter((sale) => {
      const date = new Date(sale.created_at);
      return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
    });
    return { mese: month.toLocaleDateString('it-IT', { month: 'short' }), totale: monthSales.reduce((sum, sale) => sum + sale.total, 0) };
  });
  const chartDays = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - 6 + index); const sales = statisticsSales.filter((sale) => new Date(sale.created_at).toDateString() === date.toDateString()); return { giorno: date.toLocaleDateString('it-IT', { weekday: 'short' }), totale: sales.reduce((sum, sale) => sum + sale.total, 0) }; });
  const downloadFinancialBalance = (respectTimeFilters: boolean) => {
    if (!data) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    const reportSales = respectTimeFilters ? balanceSales : data.sales;
    const reportExpenses = respectTimeFilters ? balanceExpenses : data.expenses;
    const reportRevenue = reportSales.reduce((sum, sale) => sum + sale.total, 0);
    const reportGoodsCost = reportSales.reduce((sum, sale) => sum + sale.items.reduce((cost, item) => cost + item.quantity * item.purchase_price, 0), 0);
    const reportOperatingExpenses = reportExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const periodLabel = respectTimeFilters ? balancePeriod : 'Tutto il periodo';
    const filename = `bilancio-gestionale-${periodLabel.toLowerCase().replaceAll(' ', '-')}-${todayKey}.pdf`;
    const allDates = [...reportSales.map((sale) => sale.created_at.slice(0, 10)), ...reportExpenses.map((expense) => expense.expense_date)].sort();
    const monthlyStartDate = respectTimeFilters || !allDates.length ? balanceFirstMonth : new Date(`${allDates[0]}T00:00:00`);
    const firstMonth = new Date(monthlyStartDate.getFullYear(), monthlyStartDate.getMonth(), 1);
    const monthsCount = Math.max(1, (new Date().getFullYear() - firstMonth.getFullYear()) * 12 + new Date().getMonth() - firstMonth.getMonth() + 1);
    const reportMonthly = Array.from({ length: monthsCount }, (_, index) => {
      const month = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
      const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      const sales = reportSales.filter((sale) => sale.created_at.slice(0, 7) === monthKey);
      const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
      const cost = sales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.quantity * item.purchase_price, 0), 0);
      const expenses = reportExpenses.filter((expense) => expense.expense_date.startsWith(monthKey)).reduce((sum, expense) => sum + expense.amount, 0);
      return { month: month.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }), revenue, cost, expenses, result: revenue - cost - expenses };
    });
    const pageHeading = (title: string) => {
      doc.setFillColor(47, 91, 66);
      doc.rect(0, 0, 297, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(title, 12, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`${data.settings.shop_name} · ${periodLabel} · ${receiptDate.format(new Date())}`, 12, 21);
    };
    pageHeading('Bilancio gestionale');
    autoTable(doc, {
      startY: 36,
      head: [['Ricavi vendite', 'Costo merce', 'Spese operative', 'Risultato', 'Valore magazzino']],
      body: [[money.format(reportRevenue), money.format(reportGoodsCost), money.format(reportOperatingExpenses), money.format(reportRevenue - reportGoodsCost - reportOperatingExpenses), money.format(stockCost)]],
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 5, halign: 'center' },
      headStyles: { fillColor: [56, 104, 78] },
    });
    autoTable(doc, {
      startY: 67,
      head: [['Mese', 'Ricavi', 'Costo merce', 'Spese operative', 'Risultato']],
      body: reportMonthly.map((month) => [month.month, money.format(month.revenue), money.format(month.cost), money.format(month.expenses), money.format(month.result)]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [56, 104, 78] },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120, 130, 122);
        doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 12, 202);
      },
    });
    doc.addPage();
    pageHeading('Dettaglio vendite');
    autoTable(doc, {
      startY: 36,
      head: [['Scontrino', 'Data e ora', 'Articoli', 'Costo merce', 'Totale vendita', 'Profitto']],
      body: reportSales.map((sale) => {
        const cost = sale.items.reduce((sum, item) => sum + item.quantity * item.purchase_price, 0);
        const items = sale.items.map((item) => `${item.name} × ${quantityFormat.format(item.quantity)}`).join(', ');
        return [sale.receipt_no, dateTime.format(new Date(sale.created_at)), items, money.format(cost), money.format(sale.total), money.format(sale.total - cost)];
      }),
      theme: 'striped',
      styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [56, 104, 78] },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120, 130, 122);
        doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 12, 202);
      },
    });
    doc.addPage();
    pageHeading('Dettaglio spese operative');
    autoTable(doc, {
      startY: 36,
      head: [['Data', 'Descrizione', 'Categoria', 'Importo']],
      body: reportExpenses.map((expense) => [expense.expense_date, expense.description, expense.category, money.format(expense.amount)]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [56, 104, 78] },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120, 130, 122);
        doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 12, 202);
      },
    });
    doc.save(filename);
  };
  const expiryLimit = new Date();
  expiryLimit.setDate(expiryLimit.getDate() + 10);
  const expiryLimitKey = localDateKey(expiryLimit);
  const expiringProducts = data?.products.filter((product) =>
    product.expiry_enabled && product.expiry_date && product.expiry_date >= todayKey && product.expiry_date <= expiryLimitKey
  ) ?? [];
  const expiredProducts = data?.products.filter((product) =>
    product.expiry_enabled && product.expiry_date && product.expiry_date < todayKey && product.stock > 0
  ) ?? [];
  const inventoryList = data?.products.filter((item) =>
    (item.name.toLowerCase().includes(inventorySearch.toLowerCase()) || item.code.includes(inventorySearch))
    && (category === 'Tutte' || item.category === category)
    && (inventoryStatus === 'out' ? item.stock === 0 : item.stock > 0)
    && (inventoryStatus === 'all'
      || (inventoryStatus === 'available' && item.stock > item.low_stock_threshold)
      || (inventoryStatus === 'low' && item.stock > 0 && item.stock <= item.low_stock_threshold)
      || (inventoryStatus === 'out' && item.stock === 0))
  ) ?? [];
  const inventoryControlList = data?.products.filter((item) => item.stock > 0 &&
    (item.name.toLocaleLowerCase('it').includes(inventoryControlSearch.toLocaleLowerCase('it')) || item.code.includes(inventoryControlSearch))
  ) ?? [];
  const employeeList = data?.employees.filter((employee) =>
    [employee.first_name, employee.last_name, employee.role, employee.shift, employee.operational_site, employee.email]
      .some((value) => value.toLocaleLowerCase('it').includes(employeeSearch.trim().toLocaleLowerCase('it')))
  ) ?? [];
  const expenseList = data?.expenses.filter((expense) =>
    `${expense.description} ${expense.category} ${expense.site}`.toLocaleLowerCase('it').includes(expenseSearch.trim().toLocaleLowerCase('it'))
  ) ?? [];
  const matchesSalesPeriod = (createdAt: string) => {
    const saleDate = new Date(createdAt);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (salesPeriod === 'Da - A') {
      const from = salesFrom ? new Date(`${salesFrom}T00:00:00`) : null;
      const to = salesTo ? new Date(`${salesTo}T23:59:59.999`) : null;
      return (!from || saleDate >= from) && (!to || saleDate <= to);
    }
    if (salesPeriod === 'Tutti') return true;
    if (salesPeriod === 'Oggi') return saleDate >= todayStart && saleDate < new Date(todayStart.getTime() + 86400000);
    if (salesPeriod === 'Ieri') return saleDate >= new Date(todayStart.getTime() - 86400000) && saleDate < todayStart;
    const rangeStart = new Date(todayStart);
    if (salesPeriod === 'Ultima settimana') rangeStart.setDate(rangeStart.getDate() - 6);
    if (salesPeriod === 'Ultimo mese' || salesPeriod === 'Ultimi 3 mesi') {
      const daysBack = salesPeriod === 'Ultimo mese' ? 1 : 3;
      const dayOfMonth = rangeStart.getDate();
      rangeStart.setDate(1);
      rangeStart.setMonth(rangeStart.getMonth() - daysBack);
      rangeStart.setDate(Math.min(dayOfMonth, new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0).getDate()));
    }
    return saleDate >= rangeStart;
  };
  const salesList = data?.sales.filter((sale) =>
  sale.receipt_no.includes(saleSearch)
    && (salesCategory === 'Tutte' || sale.items.some((item) => data.products.some((product) => product.id === item.product_id && product.category === salesCategory)))
    && matchesSalesPeriod(sale.created_at)
  ) ?? [];
  const saleMatch = saleManagementSearch.trim()
    ? data?.sales.find((sale) => sale.receipt_no === saleManagementSearch.trim())
    : undefined;
  const matchesInventoryHistoryPeriod = (createdAt: string) => {
    const movementDate = new Date(createdAt);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (inventoryHistoryPeriod === 'Da - A') {
      const from = inventoryHistoryFrom ? new Date(`${inventoryHistoryFrom}T00:00:00`) : null;
      const to = inventoryHistoryTo ? new Date(`${inventoryHistoryTo}T23:59:59.999`) : null;
      return (!from || movementDate >= from) && (!to || movementDate <= to);
    }
    if (inventoryHistoryPeriod === 'Tutti') return true;
    if (inventoryHistoryPeriod === 'Oggi') return movementDate >= todayStart && movementDate < new Date(todayStart.getTime() + 86400000);
    if (inventoryHistoryPeriod === 'Ieri') return movementDate >= new Date(todayStart.getTime() - 86400000) && movementDate < todayStart;
    const rangeStart = new Date(todayStart);
    if (inventoryHistoryPeriod === 'Ultima settimana') rangeStart.setDate(rangeStart.getDate() - 6);
    else if (inventoryHistoryPeriod === 'Ultimo mese') rangeStart.setMonth(rangeStart.getMonth() - 1);
    return movementDate >= rangeStart;
  };
  const inventoryHistoryMovements = data?.stockMovements.filter((movement) =>
    matchesInventoryHistoryPeriod(movement.created_at)
    && [movement.product_name, movement.person, movement.note].some((value) => value.toLowerCase().includes(inventoryHistorySearch.toLowerCase()))
  ) ?? [];
  const matchesActivityPeriod = (createdAt: string) => {
    const activityDate = new Date(createdAt);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (activityPeriod === 'Da - A') {
      const from = activityFrom ? new Date(`${activityFrom}T00:00:00`) : null;
      const to = activityTo ? new Date(`${activityTo}T23:59:59.999`) : null;
      return (!from || activityDate >= from) && (!to || activityDate <= to);
    }
    if (activityPeriod === 'Tutti') return true;
    if (activityPeriod === 'Oggi') return activityDate >= todayStart && activityDate < new Date(todayStart.getTime() + 86400000);
    if (activityPeriod === 'Ieri') return activityDate >= new Date(todayStart.getTime() - 86400000) && activityDate < todayStart;
    const rangeStart = new Date(todayStart);
    if (activityPeriod === 'Ultima settimana') rangeStart.setDate(rangeStart.getDate() - 6);
    else if (activityPeriod === 'Ultimo mese') rangeStart.setMonth(rangeStart.getMonth() - 1);
    return activityDate >= rangeStart;
  };
  const employeeActivityList = data?.employeeActivities.filter((entry) =>
    (activityEmployeeId === 'Tutti' || entry.employee_id === Number(activityEmployeeId))
    && matchesActivityPeriod(entry.created_at)
  ) ?? [];
  const sectionLabel = sectionNames[section] ?? nav.find((item) => item.section === section)?.label ?? 'Impostazioni';
  const startEmployeeCreation = () => {
    if (!data) {
      notify('Archivio non disponibile.');
      return;
    }
    setEmployeeDraft(newEmployeeDraft(data.employees));
    navigateTo('employee-create');
  };
  const editEmployee = (employee: Employee) => {
    const { id, created_at, ...details } = employee;
    setEmployeeDraft({ ...details, id, initial_password: '' });
    setEmployeeDetails(null);
    navigateTo('employee-create');
  };
  const printReceipt = () => {
    if (data?.settings.receipt_printer) {
      void window.gestionale.printReceipt().catch((error: unknown) => notify(errorText(error)));
    } else window.print();
  };
  const scanCameraCode = (code: string) => {
    setCamera(false);
    if (checkoutOpen) void applyVoucherCode(code);
    else if (section === 'cash') scanCode(code);
    else if (section === 'inventory') setInventorySearch(code.trim());
    else setSaleSearch(code.replace(/\D/g, ''));
  };
  const calendarDays = () => { const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth(); const offset = (new Date(year, month, 1).getDay() + 6) % 7; return [...Array(offset).fill(null), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => i + 1)]; };
  const resetPromotionForm = () => {
    setPromotion(blankPromotion());
    setPromotionDuration('1 giorno');
    setPromotionMinimum('none');
    setPromotionDiscountType('percentage');
  };
  const changePromotionDiscountType = (value: string) => {
    const type = value as PromotionDiscountType;
    setPromotionDiscountType(type);
    if (type === 'percentage') setPromotion((current) => ({ ...current, discount_type: 'percentage' }));
    else setPromotion((current) => ({
      ...current,
      discount_type: 'buy_get',
      buy_quantity: type === '2+1' ? 2 : type === '3+1' ? 3 : current.buy_quantity,
      free_quantity: type === 'custom' ? current.free_quantity : 1,
    }));
  };
  const promotionDiscountLabel = (offer: Promotion) => offer.discount_type === 'percentage'
    ? `${offer.percentage}%`
    : `${offer.buy_quantity}+${offer.free_quantity}`;
  const createUnsoldListPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(data?.settings.shop_name ?? 'Gestione Supermercato', 14, 17);
    doc.setFontSize(11);
    doc.text('Articoli ancora in magazzino', 14, 25);
    autoTable(doc, {
      startY: 32,
      head: [['Articolo', 'Categoria', 'Quantità non venduta', 'Prezzo vendita']],
      body: unsoldProducts.map((product) => [product.name, product.category, `${product.stock} ${product.unit ?? 'PEZZO'}`, money.format(product.sale_price)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [56, 104, 78] },
    });
    return doc;
  };
  const downloadInventoryControlList = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(18);
    doc.text(data?.settings.shop_name ?? 'Gestione Supermercato', 14, 17);
    doc.setFontSize(11);
    doc.text('Articoli in magazzino', 14, 25);
    autoTable(doc, {
      startY: 32,
      head: [['Articolo', 'Codice', 'Categoria', 'Giacenza', 'Prezzo vendita']],
      body: inventoryControlList.map((product) => [product.name, product.code, product.category, `${quantityFormat.format(product.stock)} ${product.unit ?? 'PEZZO'}`, money.format(product.sale_price)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [56, 104, 78] },
    });
    doc.save(`lista-magazzino-${todayKey}.pdf`);
  };
  const shareUnsoldList = async () => {
    try {
      const doc = createUnsoldListPdf();
      const file = new File([doc.output('blob')], `articoli-magazzino-${todayKey}.pdf`, { type: 'application/pdf' });
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
        doc.save(file.name);
        notify('La condivisione non è supportata qui: ho scaricato la lista in PDF.');
        return;
      }
      await navigator.share({ files: [file], title: 'Articoli ancora in magazzino' });
      notify('Lista PDF condivisa.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      notify(errorText(error));
    }
  };

  if (locked) return <div className="lock-screen"><div className="lock-panel"><div className="language-choice" role="group" aria-label="Lingua"><button type="button" className={language === 'it' ? 'selected' : ''} aria-pressed={language === 'it'} onClick={() => setLanguage('it')}>ITALIANO</button><button type="button" className={language === 'ar' ? 'selected' : ''} aria-pressed={language === 'ar'} onClick={() => setLanguage('ar')}>العربية</button></div><div className="brand-mark"><Store size={23} /></div><p className="eyebrow">{language === 'ar' ? 'تسجيل الدخول' : 'ACCESSO AL GESTIONALE'}</p><h1>{data?.settings.shop_name ?? (language === 'ar' ? 'متجرك' : 'Il tuo supermercato')}</h1>{pinFallback ? <><p className="muted">{language === 'ar' ? 'أدخل رمز الأمان' : 'Inserisci il PIN di sicurezza'}</p><form onSubmit={unlock}><Field label={language === 'ar' ? 'رمز الأمان' : 'PIN di sicurezza'} type="password" value={pin} onChange={(event) => setPin(event.target.value)} autoFocus /><button className="button button-primary full-width"><LockKeyhole size={16} /> {language === 'ar' ? 'دخول' : 'Accedi'}</button></form><button className="text-button" type="button" onClick={() => { setPinFallback(false); setPin(''); }}>{language === 'ar' ? 'الدخول بالباركود' : 'Accedi con barcode'}</button></> : <><p className="muted">{language === 'ar' ? 'امسح الرمز الشريطي للموظف للدخول' : 'Scansiona il barcode del dipendente per accedere'}</p><form onSubmit={(event) => { event.preventDefault(); void unlockWithBarcode(loginBarcode); }}><Field label={language === 'ar' ? 'باركود الموظف' : 'Barcode dipendente'} value={loginBarcode} onChange={(event) => setLoginBarcode(event.target.value.trim())} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void unlockWithBarcode(loginBarcode); } }} autoFocus /><button className="button button-primary full-width"><Barcode size={16} /> {language === 'ar' ? 'تحقق من الرمز' : 'Verifica barcode'}</button></form>{hasPin && <button className="text-button" type="button" onClick={() => setPinFallback(true)}>{language === 'ar' ? 'استخدم رمز الأمان' : 'Usa il PIN'}</button>}</>}</div>{notice && <div className="toast">{notice}</div>}</div>;
  if (!data) return <div className="loading-screen"><span className="loader" />{language === 'ar' ? 'جارٍ تحميل الأرشيف…' : 'Caricamento archivio…'}</div>;

  const dynamicNames = new Set([
    data.settings.shop_name,
    ...data.products.map((product) => product.name),
    ...data.employees.flatMap((employee) => [employee.first_name, employee.last_name, `${employee.first_name} ${employee.last_name}`.trim()]),
    ...data.sales.flatMap((sale) => sale.items.map((item) => item.name)),
  ].filter(Boolean));
  return <AppLanguageContext.Provider value={language}><AppDynamicNamesContext.Provider value={dynamicNames}><LocalizedNodes><div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className={`brand-mark${data.settings.shop_logo ? ' has-logo' : ''}`}>{data.settings.shop_logo ? <img src={data.settings.shop_logo} alt="Logo negozio" /> : <Store size={20} />}</div><div><strong>{data.settings.shop_name}</strong><small>GESTIONE NEGOZIO</small></div></div>
      <div className="nav-label">OPERATIVITÀ</div>
      <nav>
        {canAccess('home') && <button className={`nav-item${section === 'home' ? ' active' : ''}`} onClick={() => navigateTo('home')}><House size={18} /><span>Homepage</span></button>}
        {canAccess('inventory') && <>
          <button aria-expanded={openSidebarMenu === 'inventory'} className={`nav-item${section === 'inventory' || section === 'inventory-control' || section === 'expired-products' || section === 'inventory-history' || section === 'stock-movement' ? ' active' : ''}`} onClick={() => setOpenSidebarMenu((current) => current === 'inventory' ? null : 'inventory')}><Package size={18} /><span>{language === 'ar' ? 'المخزن' : 'Magazzino'}</span>{!isCashierRole(activeRole) && <ChevronDown className={`nav-chevron${openSidebarMenu === 'inventory' ? ' open' : ''}`} size={15} />}</button>
          {openSidebarMenu === 'inventory' && <div className="sidebar-submenu"><button className={`sidebar-subitem${section === 'inventory' ? ' selected' : ''}`} onClick={() => navigateTo('inventory')}>{language === 'ar' ? 'المخزن' : 'Magazzino'}</button>{canAccess('inventory-history') && <button className={`sidebar-subitem${section === 'inventory-history' ? ' selected' : ''}`} onClick={() => navigateTo('inventory-history')}>{language === 'ar' ? 'سجل المخزن' : 'Storico Magazzino'}</button>}<button className={`sidebar-subitem${section === 'inventory-control' ? ' selected' : ''}`} onClick={() => navigateTo('inventory-control')}>{language === 'ar' ? 'فحص المخزن' : 'Controllo'}</button></div>}
        </>}
        {nav.filter((item) => ['cash', 'sales'].includes(item.section) && canAccess(item.section)).map(({ section: target, label, icon: Icon }) => <button key={target} className={`nav-item${section === target ? ' active' : ''}`} onClick={() => navigateTo(target)}><Icon size={18} /><span>{label}</span>{target === 'cash' && <kbd>F2</kbd>}</button>)}
        {canAccess('statistics') && <>
          <button aria-expanded={openSidebarMenu === 'statistics'} className={`nav-item${['statistics', 'financial-balance', 'expenses'].includes(section) ? ' active' : ''}`} onClick={() => setOpenSidebarMenu((current) => current === 'statistics' ? null : 'statistics')}><BarChart3 size={18} /><span>Statistiche</span><ChevronDown className={`nav-chevron${openSidebarMenu === 'statistics' ? ' open' : ''}`} size={15} /></button>
          {openSidebarMenu === 'statistics' && <div className="sidebar-submenu">
            <button className={`sidebar-subitem${section === 'statistics' ? ' selected' : ''}`} onClick={() => navigateTo('statistics')}>Statistiche</button>
            {canAccess('financial-balance') && <button className={`sidebar-subitem${section === 'financial-balance' ? ' selected' : ''}`} onClick={() => navigateTo('financial-balance')}>Bilancio gestionale</button>}
            {canAccess('expenses') && <button className={`sidebar-subitem${section === 'expenses' ? ' selected' : ''}`} onClick={() => navigateTo('expenses')}>Spese</button>}
          </div>}
        </>}
        {(canAccess('sale-management') || canAccess('promotions') || canAccess('employees')) && <div className="nav-label nav-label-extra">GESTIONE EXTRA</div>}
        {canAccess('sale-management') && <>
          <button className={`nav-item${section === 'sale-management' ? ' active' : ''}`} onClick={() => navigateTo('sale-management')}><ClipboardList size={18} /><span>Modifica o Elimina</span></button>
        </>}
        {canAccess('promotions') && <>
          <button aria-expanded={openSidebarMenu === 'offers'} className={`nav-item${['promotions', 'vouchers-create', 'vouchers-list'].includes(section) ? ' active' : ''}`} onClick={() => setOpenSidebarMenu((current) => current === 'offers' ? null : 'offers')}><TrendingUp size={18} /><span>Offerta</span><ChevronDown className={`nav-chevron${openSidebarMenu === 'offers' ? ' open' : ''}`} size={15} /></button>
          {openSidebarMenu === 'offers' && <div className="sidebar-submenu"><button className={`sidebar-subitem${section === 'promotions' ? ' selected' : ''}`} onClick={() => navigateTo('promotions')}>Promozioni</button><button className={`sidebar-subitem${section === 'vouchers-create' ? ' selected' : ''}`} onClick={() => { cancelVoucherPreview(); navigateTo('vouchers-create'); }}>Crea buoni sconto</button><button className={`sidebar-subitem${section === 'vouchers-list' ? ' selected' : ''}`} onClick={() => navigateTo('vouchers-list')}>Lista buoni sconto</button></div>}
        </>}
        {canAccess('employees') && <>
          <button aria-expanded={openSidebarMenu === 'employees'} className={`nav-item${['employees', 'employee-create', 'payroll', 'employee-tracker'].includes(section) ? ' active' : ''}`} onClick={() => setOpenSidebarMenu((current) => current === 'employees' ? null : 'employees')}><ClipboardList size={18} /><span>Dipendenti</span><ChevronDown className={`nav-chevron${openSidebarMenu === 'employees' ? ' open' : ''}`} size={15} /></button>
          {openSidebarMenu === 'employees' && <div className="sidebar-submenu"><button className={`sidebar-subitem${section === 'employees' ? ' selected' : ''}`} onClick={() => navigateTo('employees')}>Lista Dipendenti</button><button className={`sidebar-subitem${section === 'employee-create' ? ' selected' : ''}`} onClick={startEmployeeCreation}>Crea Dipendente</button><button className={`sidebar-subitem${section === 'payroll' ? ' selected' : ''}`} onClick={() => navigateTo('payroll')}>Paga Stipendi</button><button className={`sidebar-subitem${section === 'employee-tracker' ? ' selected' : ''}`} onClick={() => navigateTo('employee-tracker')}>Tracker Dipendenti</button></div>}
        </>}
      </nav>
      <div className="sidebar-bottom">{canAccess('settings') && <button className={`nav-item settings-link${section === 'settings' ? ' active' : ''}`} onClick={() => { setSettingsTab(null); setDeviceTab(null); navigateTo('settings'); }}><Settings size={18} /><span>Impostazioni</span></button>}<div className="user-card"><div className="user-avatar">{currentUser?.first_name.slice(0, 1).toUpperCase() ?? data.settings.shop_name.slice(0, 1).toUpperCase()}</div><div><strong>{currentUser ? `${currentUser.first_name} ${currentUser.last_name}`.trim() : 'Gestore'}</strong><small>{currentUser?.role ?? 'Account locale'}</small></div>{data.employees.length > 0 && <button className="icon-button small" title="Blocca e cambia utente" aria-label="Blocca e cambia utente" onClick={() => { trackActivity('Accesso', 'Uscita dal gestionale'); setSelectedProduct(null); setProductAuthorization(null); setStockProduct(null); setCurrentUser(null); setLocked(true); setLoginBarcode(''); setPin(''); }}><LockKeyhole size={15} /></button>}</div></div>
    </aside>
    <main className="main-content"><header className="topbar"><h1>{sectionLabel}</h1>{data.settings.shop_logo ? <img className="topbar-logo" src={data.settings.shop_logo} alt="Logo negozio" /> : <div className="topbar-logo-fallback"><Store size={19} /></div>}<div className="topbar-right"><div className="today-date">{navbarDate.format(currentTime)} · {navbarTime.format(currentTime)}</div></div></header>

      {section === 'home' && <div className="page-content home-page"><img className="home-banner" src={data.settings.home_image || homeBanner} alt="Immagine homepage" /><div className="metric-grid"><Metric icon={Banknote} label="Vendite di oggi" value={money.format(dailyGross)} detail={`${todaySales.length} scontrini emessi`} /><Metric icon={TrendingUp} label="Netto vendite" value={money.format(dailyProfit)} detail="Profitto dopo sconti e costo merce" /><Metric icon={Package} label="Articoli venduti" value={dailyUnits.toLocaleString('it-IT')} detail="Pezzi registrati oggi" /></div><section className="expiry-alert expiry-home-alert"><div className="expiry-alert-heading"><CircleAlert size={18} /><div><strong>Avviso date di scadenza</strong><span>{expiringProducts.length ? `${expiringProducts.length} ${expiringProducts.length === 1 ? 'articolo' : 'articoli'} in scadenza entro 10 giorni` : 'Nessun articolo in scadenza nei prossimi 10 giorni'}</span></div></div>{canAccess('inventory') && expiringProducts.length > 0 && <div className="expiry-list">{expiringProducts.map((product) => <button key={product.id} onClick={() => setSelectedProduct(product)}><span>{product.name}</span><strong>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</strong></button>)}</div>}</section><section className="content-section reorder-section"><SectionHeading icon={CircleAlert} title="Da riordinare" detail={`${data.products.filter((p) => p.stock <= p.low_stock_threshold).length} articoli sotto soglia`} action={canAccess('inventory') ? <button className="text-button" onClick={() => { setInventorySearch(''); setCategory('Tutte'); setInventoryStatus('low'); navigateTo('inventory'); }}>Vai al magazzino →</button> : undefined} /><Table headings={['Articolo', 'Codice', 'Categoria', 'Disponibili', 'Soglia', 'Stato']}><>{data.products.filter((p) => p.stock <= p.low_stock_threshold).slice(0, 5).map((p) => <tr key={p.id} onClick={() => { if (canAccess('inventory')) setSelectedProduct(p); }}><td className="cell-primary">{p.name}</td><td className="mono">{p.code}</td><td>{p.category}</td><td>{p.stock}</td><td>{p.low_stock_threshold}</td><td><span className="stock-badge low">Riordinare</span></td></tr>)}</></Table></section><section className="content-section"><SectionHeading icon={ClipboardList} title="Ultime vendite" detail="Transazioni più recenti" action={<button className="text-button" onClick={() => navigateTo('sales')}>Tutte le vendite →</button>} /><SalesTable sales={data.sales.slice(0, 5)} onSelect={setReceipt} /></section></div>}

      {section === 'inventory' && <div className="page-content">
        <div className="page-toolbar inventory-toolbar"><div><h2>Articoli in magazzino</h2><p>{data.products.length} articoli registrati</p></div>{!isCashierRole(activeRole) && <div className="toolbar-actions"><button className="button button-outline" onClick={exportInventoryReport}><ArrowDownToLine size={16} /> Scarica report</button><button className="button button-primary" onClick={() => { setProductEditingId(null); setProductForm({ ...blankProduct }); }}><Plus size={16} /> Aggiungi nuovo articolo</button></div>}</div>
        <div className="filter-row"><SearchInput value={inventorySearch} onChange={setInventorySearch} placeholder="Cerca per nome o codice…" /><label className="select-wrap"><span>Categoria</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option>Tutte</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label><details className="inventory-filter-dropdown"><summary className="select-wrap"><span>Disponibilità: {inventoryFilters.find((item) => item.value === inventoryStatus)?.label}</span><ChevronDown size={14} /></summary><div className="inventory-status-filters" role="group" aria-label="Filtra prodotti per disponibilità">{inventoryFilters.map(({ value, label }) => <button key={value} className={`status-filter${inventoryStatus === value ? ' active' : ''}`} aria-pressed={inventoryStatus === value} onClick={(event) => { setInventoryStatus(value); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{label}</button>)}</div></details></div>
        {!isCashierRole(activeRole) && <div className="expiry-panels">
          <section className="expiry-alert"><div className="expiry-alert-heading"><CircleAlert size={18} /><div><strong>Avviso date di scadenza</strong><span>{expiringProducts.length ? `${expiringProducts.length} ${expiringProducts.length === 1 ? 'articolo' : 'articoli'} in scadenza entro 10 giorni` : 'Nessun articolo in scadenza nei prossimi 10 giorni'}</span></div></div>{expiringProducts.length > 0 && <div className="expiry-list">{expiringProducts.map((product) => <button key={product.id} onClick={() => setSelectedProduct(product)}><span>{product.name}</span><strong>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</strong></button>)}</div>}</section>
          <section className="expiry-alert expired-alert"><div className="expired-alert-top"><div className="expiry-alert-heading"><CircleAlert size={18} /><div><strong>Prodotti scaduti</strong><span>{expiredProducts.length ? `${expiredProducts.length} ${expiredProducts.length === 1 ? 'articolo scaduto' : 'articoli scaduti'}` : 'Nessun prodotto scaduto'}</span></div></div><button className="text-button expired-manage-link" onClick={() => navigateTo('expired-products')}>Gestisci articoli scaduti</button></div>{expiredProducts.length > 0 && <div className="expiry-list">{expiredProducts.map((product) => <button key={product.id} onClick={() => setSelectedProduct(product)}><span>{product.name}</span><strong>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</strong></button>)}</div>}</section>
        </div>}
        <div className="product-grid">{inventoryList.map((product) => <button className="product-tile" key={product.id} onClick={() => { if (!isCashierRole(activeRole)) setSelectedProduct(product); }}><div className="tile-icon"><Package size={20} /></div><span className="tile-category">{product.category}</span><strong>{product.name}</strong><span className="tile-price">{money.format(product.sale_price)}</span><span className={`tile-stock${product.stock <= product.low_stock_threshold ? ' text-low' : ''}`}>{quantityFormat.format(product.stock)} disponibili</span></button>)}</div>{inventoryList.length === 0 && <Empty icon={Package} title="Nessun articolo trovato" detail="Modifica la ricerca o aggiungi un articolo." />}
      </div>}

      {section === 'inventory-control' && <div className="page-content inventory-control-page">
        {!inventoryControlAuthorized ? <section className="panel inventory-control-auth"><div className="security-icon"><ShieldCheck size={22} /></div><h2>Verifica dipendente</h2><p>Scansiona o inserisci il barcode del dipendente per aprire il controllo magazzino.</p><form onSubmit={(event) => { event.preventDefault(); void authorizeInventoryControl(inventoryControlBarcode); }}><Field label="Barcode dipendente" value={inventoryControlBarcode} onChange={(event) => setInventoryControlBarcode(event.target.value)} autoFocus required /><button className="button button-primary"><Barcode size={16} /> Verifica barcode</button></form></section> : <>
          <div className="page-toolbar"><h2>Articoli in magazzino</h2></div>
          <div className="inventory-control-tools no-print"><SearchInput value={inventoryControlSearch} onChange={setInventoryControlSearch} placeholder="Cerca per nome o barcode…" /><button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Stampa lista</button><button className="button button-primary" onClick={downloadInventoryControlList}><ArrowDownToLine size={16} /> Scarica lista</button></div>
          <div id="inventory-control-print"><Table headings={['Articolo', 'Codice', 'Categoria', 'Giacenza', 'Prezzo vendita']}><>{inventoryControlList.map((product) => <tr key={product.id}><td className="cell-primary">{product.name}</td><td className="mono">{product.code}</td><td>{product.category}</td><td>{quantityFormat.format(product.stock)} {product.unit ?? 'PEZZO'}</td><td>{money.format(product.sale_price)}</td></tr>)}</>{!inventoryControlList.length && <tr><td colSpan={5} className="empty-cell">Nessun articolo in magazzino trovato.</td></tr>}</Table></div>
        </>}
      </div>}

      {section === 'expired-products' && <div className="page-content"><div className="page-toolbar"><div><h2>Gestione prodotti scaduti</h2><p>Verifica gli articoli scaduti e registra lo smaltimento.</p></div><button className="button button-outline" onClick={() => navigateTo('inventory')}>Torna al magazzino</button></div><Table headings={['Articolo', 'Codice', 'Categoria', 'Giacenza', 'Data di scadenza', 'Azione']}><>{expiredProducts.map((product) => <tr key={product.id}><td className="cell-primary">{product.name}</td><td className="mono">{product.code}</td><td>{product.category}</td><td>{quantityFormat.format(product.stock)} {product.unit ?? 'PEZZO'}</td><td>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</td><td><button className="button button-danger" onClick={() => void disposeExpiredProduct(product)}><Trash2 size={14} /> Butta articolo</button></td></tr>)}</>{!expiredProducts.length && <tr><td colSpan={6} className="empty-cell">Non ci sono prodotti scaduti da gestire.</td></tr>}</Table></div>}

      {section === 'inventory-history' && <div className="page-content"><div id="inventory-history-print">
        <div className="inventory-history-actions no-print"><SelectField label="Periodo" value={inventoryHistoryPeriod} onChange={setInventoryHistoryPeriod} options={['Tutti', 'Oggi', 'Ieri', 'Ultima settimana', 'Ultimo mese', 'Da - A']} />{inventoryHistoryPeriod === 'Da - A' && <><Field label="Da" type="date" value={inventoryHistoryFrom} onChange={(event) => setInventoryHistoryFrom(event.target.value)} /><Field label="A" type="date" value={inventoryHistoryTo} onChange={(event) => setInventoryHistoryTo(event.target.value)} /></>}<SearchInput value={inventoryHistorySearch} onChange={setInventoryHistorySearch} placeholder="Cerca articolo, persona o nota…" /><button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Stampa</button></div>
        <Table headings={['Data e ora', 'Articolo', 'Movimento', 'Quantità', 'Persona', 'Nota']}><>{inventoryHistoryMovements.map((movement) => <tr key={movement.id}><td>{dateTime.format(new Date(movement.created_at))}</td><td className="cell-primary">{movement.product_name}</td><td><span className={`movement-badge ${movement.movement_type === 'Carico' ? 'movement-in' : 'movement-out'}`}>{movement.movement_type}</span></td><td>{quantityFormat.format(movement.quantity)}</td><td>{movement.person || '—'}</td><td>{movement.note || '—'}</td></tr>)}</>{!inventoryHistoryMovements.length && <tr><td colSpan={6} className="empty-cell">Nessun movimento nel periodo selezionato.</td></tr>}</Table></div></div>}

      {section === 'cash' && <div className="page-content cash-content"><div className="cash-layout">
        <section className="cash-products">
          <div className="cash-search-row"><div className="search-field"><Barcode size={17} /><input id="scanner-field" placeholder="Cerca o scansiona un codice a barre…" value={scannerSearch} onChange={(e) => setScannerSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scanCode(scannerSearch); } }} /><button type="button" className="search-clear" aria-label="Cancella ricerca" disabled={!scannerSearch} onClick={() => setScannerSearch('')}><X size={15} /></button></div><button className="icon-button camera-button" title="Scansiona con fotocamera" onClick={() => setCamera(true)}><Camera size={18} /></button></div>
          <div className="cash-product-grid">{data.products.filter((p) => (p.name.toLowerCase().includes(scannerSearch.toLowerCase()) || p.code.includes(scannerSearch)) && p.stock > 0).map((product) => { const remainingStock = Math.max(0, product.stock - (cart.find((item) => item.product_id === product.id)?.quantity ?? 0)); return <button className="cash-product" key={product.id} disabled={remainingStock === 0} onClick={() => addProductToCart(product)}><span className="tile-category">{product.category}</span><strong>{product.name}</strong><span className="cash-product-bottom"><b>{money.format(product.sale_price)}{product.unit === 'KG' ? ' / kg' : product.unit === 'LITRO' ? ' / lit.' : ''}</b><small>{quantityFormat.format(remainingStock)} {product.unit === 'KG' ? 'kg' : product.unit === 'LITRO' ? 'lit.' : 'pz'}</small></span></button>; })}</div>
        </section>
        <aside className="cart-panel"><div className="cart-heading"><div className="cart-heading-title"><h2>CARRELLO <span>{quantityFormat.format(cart.reduce((sum, item) => sum + item.quantity, 0))}</span></h2></div><button className="icon-button" title="Svuota carrello" aria-label="Svuota carrello" disabled={!cart.length} onClick={() => { setCart([]); setManualPromotionId(undefined); setAutomaticPromotionId(undefined); }}><Trash2 size={17} /></button></div><div className="cart-lines">{cart.map((item) => <div className="cart-line" key={item.product_id}><div className="cart-line-name"><strong>{item.name}</strong><small>{quantityFormat.format(item.quantity)} {item.unit === 'KG' ? 'kg' : item.unit === 'LITRO' ? 'L' : 'pz'}</small></div><div className="quantity-control"><button onClick={() => changeQuantity(item.product_id, -1)} aria-label="Rimuovi uno"><Minus size={13} /></button><span>{quantityFormat.format(item.quantity)}</span><button onClick={() => changeQuantity(item.product_id, 1)} aria-label="Aggiungi uno"><Plus size={13} /></button></div><strong className="line-total">{money.format(item.quantity * item.unit_price)}</strong></div>)}{!cart.length && <div className="cart-empty"><ShoppingBasket size={25} /><span>Seleziona gli articoli<br />per iniziare una vendita</span></div>}</div><div className="receipt-summary"><div><span>Subtotale</span><span>{money.format(subtotal)}</span></div><div className="total-row"><strong>TOTALE</strong><strong>{money.format(subtotal)}</strong></div></div><button className="button button-primary checkout-button" disabled={!cart.length} onClick={() => setCheckoutOpen(true)}>Procedi al pagamento <span>→</span></button></aside>
      </div></div>}

      {section === 'sales' && <div className="page-content"><div className="sale-tools"><button className="button button-outline sale-camera-button" onClick={() => setCamera(true)}><Camera size={16} /> Cerca con fotocamera</button><SearchInput value={saleSearch} onChange={setSaleSearch} placeholder="Cerca numero scontrino…" numericOnly /><button className="button button-outline" onClick={() => { setReportExportType('sales-pdf'); setReportExportOpen(true); }}><ArrowDownToLine size={16} /> Scarica report</button><button className="button button-outline" onClick={() => { setReportExportType('sales-xlsx'); setReportExportOpen(true); }}><ArrowDownToLine size={16} /> Esporta Excel</button></div><div className="sale-filters"><SelectField label="Periodo" value={salesPeriod} onChange={setSalesPeriod} options={['Tutti', 'Oggi', 'Ieri', 'Ultima settimana', 'Ultimo mese', 'Ultimi 3 mesi', 'Da - A']} />{salesPeriod === 'Da - A' && <><Field label="Da" type="date" value={salesFrom} onChange={(event) => setSalesFrom(event.target.value)} /><Field label="A" type="date" value={salesTo} onChange={(event) => setSalesTo(event.target.value)} /></>}<SelectField label="Categoria" value={salesCategory} onChange={setSalesCategory} options={['Tutte', ...categories]} /></div><SalesTable sales={salesList} onSelect={setReceipt} /></div>}
      {section === 'sale-management' && <div className="page-content sale-management-page">
        <div className="sale-management-search"><SearchInput value={saleManagementSearch} onChange={setSaleManagementSearch} placeholder="Inserisci o scansiona il numero dello scontrino…" numericOnly /></div>
        {saleMatch ? <section className="panel sale-found">
          <div className="sale-found-shop">{data.settings.shop_name}</div>
          <div className="sale-found-meta"><span>{dateTime.format(new Date(saleMatch.created_at))}</span><span>Scontrino #{saleMatch.receipt_no}</span></div>
          <div className="sale-found-items">{saleMatch.items.map((item, index) => <div className="sale-found-item" key={`${item.code}-${index}`}><span>{item.name}<small>{quantityFormat.format(item.quantity)} × {money.format(item.unit_price)}</small></span><strong>{money.format(item.quantity * item.unit_price)}</strong></div>)}</div>
          <div className="sale-found-total"><strong>TOTALE</strong><strong>{money.format(saleMatch.total)}</strong></div>
          <div className="sale-found-actions">
            <button className="button button-danger" onClick={() => { setSaleEmployeeBarcode(''); setSaleAction({ sale: saleMatch, action: 'delete' }); }}><Trash2 size={15} /> Elimina vendita</button>
            <button className="button button-primary" onClick={() => { setSaleEmployeeBarcode(''); setSaleAction({ sale: saleMatch, action: 'edit' }); }}><Pencil size={15} /> Modifica vendita</button>
          </div>
        </section> : saleManagementSearch.trim() ? <p className="sale-not-found">Nessuno scontrino trovato con questo numero.</p> : null}
      </div>}


      {section === 'promotions' && <div className="page-content settings-page"><section className="settings-panel">
        <button className="settings-back" onClick={() => setSection('home')}><ArrowLeft size={15} /> Menu principale</button>
        <div className="settings-title"><h2>Promozioni</h2></div>
        <form className="form-grid promotion-form" onSubmit={savePromotion}>
          <Field label="Nome offerta" value={promotion.name} onChange={(e) => setPromotion({ ...promotion, name: e.target.value })} required />
          <SelectField label="Sconto" value={promotionDiscountType} onChange={changePromotionDiscountType} options={['percentage', '2+1', '3+1', 'custom']} labels={['Percentuale %', '2+1', '3+1', 'Crea forma']} />
          {promotionDiscountType === 'percentage' && <Field label="Percentuale di sconto (%)" type="number" min="1" max="100" value={promotion.percentage} onChange={(e) => setPromotion({ ...promotion, percentage: Number(e.target.value) })} required />}
          {promotionDiscountType === 'custom' && <div className="promotion-bundle-fields"><Field label="Articoli da acquistare" type="number" min="1" step="1" value={promotion.buy_quantity} onChange={(e) => setPromotion({ ...promotion, buy_quantity: Number(e.target.value) })} required /><Field label="Articoli in omaggio" type="number" min="1" step="1" value={promotion.free_quantity} onChange={(e) => setPromotion({ ...promotion, free_quantity: Number(e.target.value) })} required /></div>}
          <SelectField label="Categoria" value={promotion.category} onChange={(value) => setPromotion({ ...promotion, category: value })} options={['Tutte', ...categories]} />
          <SelectField label="Applicazione" value={promotion.application_mode} onChange={(value) => setPromotion({ ...promotion, application_mode: value as Promotion['application_mode'] })} options={['Automatica', 'Manuale']} />
          <SelectField label="Durata offerta" value={promotionDuration} onChange={changePromotionDuration} options={promotionDurations} />
          {promotionDuration === 'Personalizzata' && <><Field label="Dal" type="date" value={promotion.starts_at} onChange={(e) => changePromotionStart(e.target.value)} required /><Field label="Al" type="date" value={promotion.ends_at} onChange={(e) => setPromotion({ ...promotion, ends_at: e.target.value })} required /></>}
          <fieldset className="promotion-minimum-options"><legend>Requisito minimo</legend>
            {([{ value: 'none', label: 'Nessuno' }, { value: 'spend', label: 'Spesa minima' }, { value: 'kilograms', label: 'KG minimi' }, { value: 'pieces', label: 'Pezzi minimi' }, { value: 'liters', label: 'Litri minimi' }] as const).map(({ value, label }) => <label key={value}><input type="radio" name="promotion-minimum" checked={promotionMinimum === value} onChange={() => setPromotionMinimum(value)} /><span>{label}</span></label>)}
          </fieldset>
          {promotionMinimum === 'spend' && <Field label="Spesa minima (€)" type="number" min="0.01" step="0.01" value={promotion.minimum_spend || ''} onChange={(e) => setPromotion({ ...promotion, minimum_spend: Number(e.target.value) })} required />}
          {promotionMinimum === 'kilograms' && <Field label="KG minimi" type="number" min="0.1" step="0.1" value={promotion.minimum_kilograms || ''} onChange={(e) => setPromotion({ ...promotion, minimum_kilograms: Number(e.target.value) })} required />}
          {promotionMinimum === 'pieces' && <Field label="Pezzi minimi" type="number" min="1" step="1" value={promotion.minimum_pieces || ''} onChange={(e) => setPromotion({ ...promotion, minimum_pieces: Number(e.target.value) })} required />}
          {promotionMinimum === 'liters' && <Field label="Litri minimi" type="number" min="0.1" step="0.1" value={promotion.minimum_liters || ''} onChange={(e) => setPromotion({ ...promotion, minimum_liters: Number(e.target.value) })} required />}
          <div className="form-actions">{promotion.id !== undefined && <button className="button button-quiet" type="button" onClick={resetPromotionForm}>Annulla modifica</button>}<button className="button button-primary"><Check size={16} /> {promotion.id === undefined ? 'Crea promozione' : 'Salva modifiche'}</button></div>
        </form>
        <div className="promotion-list">{data.promotions.map((item) => <div className="promotion-row" key={item.id}>
          <div><strong>{item.name}</strong><span>{item.category} · {item.starts_at} — {item.ends_at === permanentPromotionEnd ? 'Sempre' : item.ends_at}{item.minimum_spend > 0 ? ` · Spesa minima ${money.format(item.minimum_spend)}` : ''}{item.minimum_kilograms ? ` · ${item.minimum_kilograms} KG minimi` : ''}{item.minimum_pieces ? ` · ${item.minimum_pieces} pezzi minimi` : ''}{item.minimum_liters ? ` · ${item.minimum_liters} litri minimi` : ''}</span></div>
          <b>{promotionDiscountLabel(item)}</b><span className="stock-badge">{item.application_mode}</span>
          <div className="promotion-actions">
            <button className="button button-outline" onClick={() => { setPromotion({ ...item }); setPromotionDiscountType(item.discount_type !== 'buy_get' ? 'percentage' : item.buy_quantity === 2 && item.free_quantity === 1 ? '2+1' : item.buy_quantity === 3 && item.free_quantity === 1 ? '3+1' : 'custom'); setPromotionDuration(item.ends_at === permanentPromotionEnd ? 'Sempre' : 'Personalizzata'); setPromotionMinimum(item.minimum_spend > 0 ? 'spend' : item.minimum_kilograms ? 'kilograms' : item.minimum_pieces ? 'pieces' : item.minimum_liters ? 'liters' : 'none'); }}><Pencil size={14} /> Modifica</button>
            <button className="button button-danger" onClick={() => void deletePromotion(item)}><Trash2 size={14} /> Elimina</button>
          </div>
        </div>)}</div>
      </section></div>}

      {section === 'employees' && <div className="page-content employee-page">
        <div className="page-toolbar employee-toolbar"><button className="button button-outline" onClick={() => void exportEmployeeContracts()}><ArrowDownToLine size={16} /> Scarica contratti</button><SearchInput value={employeeSearch} onChange={setEmployeeSearch} placeholder="Cerca dipendente, ruolo o sede…" /><button className="button button-outline" onClick={() => void exportEmployeeList()}><ArrowDownToLine size={16} /> Scarica report</button></div>
        <div className="employee-card-grid">{employeeList.map((employee) => <button className="employee-card" key={employee.id} onClick={() => setEmployeeDetails(employee)} aria-label={`Apri informazioni di ${employee.first_name} ${employee.last_name}`}><img className="employee-list-photo" src={employee.photo_data} alt={`Foto di ${employee.first_name} ${employee.last_name}`} /><span><small>Nome</small><strong>{employee.first_name}</strong></span><span><small>Cognome</small><strong>{employee.last_name}</strong></span><span><small>Ruolo</small><strong>{employee.role}</strong></span><span><small>Sede</small><strong>{employee.operational_site}</strong></span></button>)}{!employeeList.length && <Empty icon={ClipboardList} title={data.employees.length ? 'Nessun dipendente corrisponde alla ricerca.' : 'Nessun dipendente registrato.'} detail="" />}</div>
      </div>}
      {section === 'employee-tracker' && <div className="page-content">
        <div id="employee-tracker-print">
          <div className="inventory-history-actions no-print">
            <SelectField label="Periodo" value={activityPeriod} onChange={setActivityPeriod} options={['Tutti', 'Oggi', 'Ieri', 'Ultima settimana', 'Ultimo mese', 'Da - A']} />
            {activityPeriod === 'Da - A' && <><Field label="Da" type="date" value={activityFrom} onChange={(event) => setActivityFrom(event.target.value)} /><Field label="A" type="date" value={activityTo} onChange={(event) => setActivityTo(event.target.value)} /></>}
            <SelectField label="Dipendente" value={activityEmployeeId} onChange={setActivityEmployeeId} options={['Tutti', ...data.employees.map((employee) => String(employee.id))]} labels={['Tutti', ...data.employees.map((employee) => `${employee.first_name} ${employee.last_name}`)]} preserveLabels />
            <button className="button button-outline" onClick={() => void exportEmployeeActivityXlsx()}><ArrowDownToLine size={16} /> Scarica lista Excel</button>
            <button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Stampa lista</button>
          </div>
          <Table headings={['Data e ora', 'Dipendente', 'Attività', 'Sezione', 'Dettagli']}>
            <>{employeeActivityList.map((entry) => <tr key={entry.id}><td>{dateTime.format(new Date(entry.created_at))}</td><td className="cell-primary">{entry.employee_name}</td><td>{entry.action}</td><td>{entry.section}</td><td>{entry.detail || '—'}</td></tr>)}</>
            {!employeeActivityList.length && <tr><td colSpan={5} className="empty-cell">Nessuna attività registrata per i filtri selezionati.</td></tr>}
          </Table>
        </div>
      </div>}
      {section === 'employee-create' && employeeDraft && <div className="page-content settings-page"><section className="settings-panel employee-create-panel"><EmployeeForm initial={employeeDraft} save={saveEmployee} cancel={() => { setEmployeeDraft(null); navigateTo('employees'); }} notify={notify} canDelete={canAccess('employees')} onDelete={async () => { const employee = data.employees.find((item) => item.id === employeeDraft.id); if (employee) await deleteEmployee(employee); }} /></section></div>}
      {section === 'payroll' && <div className="page-content">
        <div className="panel payroll-toolbar"><Field label="Mese di competenza" type="month" value={payrollMonth} onChange={(event) => setPayrollMonth(event.target.value)} /><Field label="Data di pagamento" type="date" value={payrollDate} onChange={(event) => setPayrollDate(event.target.value)} /><button className="button button-primary" onClick={() => void payAllEmployees()}><Banknote size={15} /> Paga tutti gli stipendi</button><button className="button button-outline" onClick={() => { const payments = data.payrollPayments.filter((payment) => payment.pay_month === payrollMonth); void exportPayrollZip(payments).catch((error: unknown) => notify(errorText(error))); }}><ArrowDownToLine size={15} /> Scarica ricevute del mese</button></div>
        <Table headings={['Dipendente', 'Ruolo', 'Stipendio', 'Metodo', 'Stato', 'Azione']}><>{data.employees.map((employee) => { const payment = data.payrollPayments.find((item) => item.employee_id === employee.id && item.pay_month === payrollMonth); return <tr key={employee.id}><td className="cell-primary">{employee.first_name} {employee.last_name}</td><td>{employee.role}</td><td>{money.format(employee.salary)}</td><td>{employee.payment_method}</td><td><span className={`stock-badge${payment ? '' : ' low'}`}>{payment ? `Pagato il ${payment.payment_date}` : 'Da pagare'}</span></td><td>{payment ? <button className="button button-outline" onClick={() => savePdf(createSalaryPdf(employee, payment.payment_date, payment.pay_month, payment.amount), `Stipendio-${safeFilePart(employee.first_name)}-${safeFilePart(employee.last_name)}-${payment.payment_date}.pdf`)}><ArrowDownToLine size={14} /> Ricevuta</button> : <button className="button button-primary" onClick={() => void payEmployee(employee)}><Check size={14} /> Paga</button>}</td></tr>; })}</>{!data.employees.length && <tr><td colSpan={6} className="empty-cell">Nessun dipendente registrato.</td></tr>}</Table>
      </div>}
      {section === 'expenses' && <div className="page-content accounting-page">
        <section className="panel expense-entry-panel"><div className="panel-heading"><div><h3>Registra una spesa</h3><p>Inserisci descrizione, categoria, importo e data.</p></div></div>
          <form className="expense-form" onSubmit={(event) => void saveExpense(event)}>
            <Field label="Descrizione" value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} required />
            <SelectField label="Categoria" value={expenseCategory} onChange={(value) => { setExpenseCategory(value); if (value !== 'Affitto') setExpenseReceiptData(''); }} options={expenseCategories} />
            {expenseCategory === 'Altro' && <Field label="Nome della categoria" value={expenseOtherCategory} onChange={(event) => setExpenseOtherCategory(event.target.value)} required />}
            <Field label="Importo (€)" type="number" min="0.01" step="0.01" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} required />
            <Field label="Data" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
            {expenseCategory === 'Affitto' && <label className="field expense-receipt-field"><span>Ricevuta pagamento affitto</span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => { void attachExpenseReceipt(event.target.files?.[0]); event.currentTarget.value = ''; }} required={!expenseReceiptData} />{expenseReceiptData && <small>Ricevuta allegata</small>}</label>}
            <div className="expense-actions"><button className="button button-outline" type="button" onClick={(event) => { event.currentTarget.form?.reset(); setExpenseDescription(''); setExpenseCategory(expenseCategories[0]); setExpenseOtherCategory(''); setExpenseAmount(''); setExpenseDate(localDateKey()); setExpenseReceiptData(''); }}>Annulla</button><button className="button button-primary"><Plus size={16} /> Registra spesa</button></div>
          </form>
        </section>
        <div className="expense-list-toolbar"><SearchInput value={expenseSearch} onChange={setExpenseSearch} placeholder="Cerca descrizione o categoria…" /></div>
        <Table headings={['Data', 'Descrizione', 'Sede', 'Categoria', 'Importo', 'Ricevuta', '']}>{expenseList.map((expense) => <tr key={expense.id}><td>{expense.expense_date}</td><td className="cell-primary">{expense.description}</td><td>{expense.site}</td><td>{expense.category}</td><td className="align-right">{money.format(expense.amount)}</td><td>{expense.receipt_data ? <a className="button button-outline expense-receipt-download" href={expense.receipt_data} download={`ricevuta-${safeFilePart(expense.description)}.${dataUrlExtension(expense.receipt_data)}`}><ArrowDownToLine size={14} /> Scarica</a> : '—'}</td><td><button className="icon-button small" title="Elimina spesa" aria-label={`Elimina la spesa ${expense.description}`} onClick={() => void deleteExpense(expense)}><Trash2 size={15} /></button></td></tr>)}{!expenseList.length && <tr><td colSpan={7} className="empty-cell">{data.expenses.length ? 'Nessuna spesa corrisponde alla ricerca.' : 'Nessuna spesa registrata.'}</td></tr>}</Table>
      </div>}

      {section === 'financial-balance' && <div id="financial-balance-report" className="page-content accounting-page">
        <div className="page-toolbar balance-toolbar no-print">
          <button className="button button-primary balance-download" onClick={() => { setReportExportType('balance'); setReportExportOpen(true); }}><ArrowDownToLine size={16} /> Scarica bilancio</button>
          <div className="balance-periods" role="group" aria-label="Filtra bilancio per periodo">
            {(['Ultimi 3 mesi', 'Ultimi 6 mesi', 'Ultimo anno'] as const).map((period) => <button key={period} className={`status-filter${balancePeriod === period ? ' active' : ''}`} aria-pressed={balancePeriod === period} onClick={() => setBalancePeriod(period)}>{period}</button>)}
          </div>
        </div>
        <div className="metric-grid accounting-balance-metrics">
          <Metric icon={Banknote} label="Ricavi da vendite" value={money.format(balanceRevenue)} detail={balancePeriod} />
          <Metric icon={Package} label="Costo della merce venduta" value={money.format(balanceGoodsCost)} detail={balancePeriod} />
          <Metric icon={ArrowDownToLine} label="Spese operative" value={money.format(balanceOperatingExpenses)} detail={balancePeriod} />
          <Metric icon={TrendingUp} label="Risultato gestionale" value={money.format(balanceOperatingResult)} detail="Ricavi meno costi e spese" />
        </div>
        <div className="analytics-grid">
          <section className="panel"><div className="panel-heading"><div><h3>Composizione del bilancio</h3><p>{balancePeriod}</p></div></div><div className="balance-breakdown"><Detail label="Ricavi netti" value={money.format(balanceRevenue)} /><Detail label="Costo del venduto" value={`− ${money.format(balanceGoodsCost)}`} /><Detail label="Margine lordo" value={money.format(balanceRevenue - balanceGoodsCost)} /><Detail label="Spese operative" value={`− ${money.format(balanceOperatingExpenses)}`} /><Detail label="Risultato gestionale" value={money.format(balanceOperatingResult)} /></div></section>
          <section className="panel"><div className="panel-heading"><div><h3>Valore del magazzino</h3><p>Valorizzazione della giacenza attuale</p></div></div><div className="balance-breakdown"><Detail label="Valore a costo" value={money.format(stockCost)} /><Detail label="Valore potenziale di vendita" value={money.format(stockRetail)} /><Detail label="Articoli in giacenza" value={`${data.products.filter((product) => product.stock > 0).length}`} /><Detail label="Margine potenziale" value={money.format(stockRetail - stockCost)} /></div></section>
        </div>
        <section className="panel balance-monthly-panel"><div className="panel-heading"><div><h3>Dettaglio mensile · {balancePeriod.toLowerCase()}</h3><p>Ricavi, costo merce, spese operative e risultato</p></div></div><div className="table-wrap"><table><thead><tr><th>Mese</th><th className="align-right">Ricavi</th><th className="align-right">Costo merce</th><th className="align-right">Spese operative</th><th className="align-right">Risultato</th></tr></thead><tbody>{balanceMonthly.map((month) => <tr key={month.mese}><td className="cell-primary">{month.mese}</td><td className="align-right">{money.format(month.vendite)}</td><td className="align-right">{money.format(month.costiMerce)}</td><td className="align-right">{money.format(month.speseOperative)}</td><td className="align-right cell-primary">{money.format(month.risultato)}</td></tr>)}</tbody></table></div></section>
      </div>}

      {(section === 'vouchers-create' || section === 'vouchers-list') && <div className="page-content settings-page"><section className="settings-panel">
        {section === 'vouchers-create' && <div className="voucher-section">
          <div className="settings-title"><h2>{editingVoucherBatchId ? `Modifica gruppo ${editingVoucherBatchId}` : 'Crea buoni sconto'}</h2></div>
          {!voucherPreview ? <form className="form-grid promotion-form voucher-form" onSubmit={editingVoucherBatchId ? saveVoucherBatchChanges : generateVoucherPreview}>
            <Field label="Percentuale di sconto (%)" type="number" min="1" max="100" step="1" value={voucherPercentage} onChange={(event) => setVoucherPercentage(event.target.value)} required />
            {!editingVoucherBatchId && <Field label="Quantità di codici" type="number" min="1" step="1" value={voucherQuantity} onChange={(event) => setVoucherQuantity(event.target.value)} required />}
            <Field label="Data di inizio" type="date" value={voucherStartsAt} onChange={(event) => setVoucherStartsAt(event.target.value)} required />
            <Field label="Data di scadenza" type="date" value={voucherEndsAt} onChange={(event) => setVoucherEndsAt(event.target.value)} required />
            {editingVoucherBatchId
              ? <div className="voucher-edit-actions"><button className="button button-quiet" type="button" onClick={() => { cancelVoucherPreview(); navigateTo('vouchers-list'); }}>Annulla</button><button className="button button-primary"><Check size={16} /> Salva modifiche</button></div>
              : <button className="button button-primary"><Check size={16} /> Genera codici</button>}
          </form> : <>
            <div className="voucher-preview-heading"><strong>{voucherPreview.codes.length} codici · {voucherPreview.discount_percentage}% di sconto</strong><span>{voucherPreview.starts_at} — {voucherPreview.ends_at}</span></div>
            <div id="voucher-print" className="table-wrap voucher-codes"><table><thead><tr><th>Codice</th><th>Barcode</th><th>Sconto</th><th>Inizio</th><th>Scadenza</th></tr></thead><tbody>{voucherPreview.codes.map((code) => <tr key={code}><td className="mono">{code}</td><td><BarcodeImage value={code} /></td><td>{voucherPreview.discount_percentage}%</td><td>{voucherPreview.starts_at}</td><td>{voucherPreview.ends_at}</td></tr>)}</tbody></table></div>
            <div className="voucher-actions no-print"><button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Stampa codici</button><button className="button button-quiet" onClick={cancelVoucherPreview}>Annulla</button><button className="button button-primary" onClick={() => void confirmVoucherBatch()}><Check size={16} /> Conferma e salva</button></div>
          </>}
        </div>}
        {section === 'vouchers-list' && <div className="voucher-section">
          {!data.voucherBatches.length ? <Empty icon={Barcode} title="Nessun buono sconto" detail="Crea e conferma un gruppo di codici per visualizzarlo qui." /> : <>
            <div className="voucher-batch-list">{data.voucherBatches.map((batch) => <div className="voucher-batch-row" key={batch.id}>
              <div><strong>Gruppo {batch.id}</strong><span>{batch.codes.length} codici · {batch.discount_percentage}% di sconto</span><small>{batch.starts_at} — {batch.ends_at}</small></div>
              <div className="voucher-actions no-print"><button className="icon-button" title="Visualizza codici" aria-label={`Visualizza codici del gruppo ${batch.id}`} onClick={() => setVoucherViewBatch(batch)}><Eye size={17} /></button><button className="button button-outline" onClick={() => startVoucherBatchEdit(batch)}><Pencil size={15} /> Modifica</button><button className="button button-outline" onClick={() => setVoucherPrintBatch(batch)}><Printer size={15} /> Stampa</button><button className="button button-outline" onClick={() => downloadVoucherBatch(batch)}><ArrowDownToLine size={15} /> Scarica lista</button><button className="button button-danger" onClick={() => void deleteVoucherBatch(batch)}><Trash2 size={15} /> Elimina</button></div>
            </div>)}</div>
            {voucherPrintBatch && <div id="voucher-print" className="table-wrap voucher-codes voucher-print-only"><h2>Buoni sconto gruppo {voucherPrintBatch.id} · {voucherPrintBatch.discount_percentage}%</h2><p>{voucherPrintBatch.starts_at} — {voucherPrintBatch.ends_at}</p><table><thead><tr><th>Codice</th><th>Barcode</th><th>Sconto</th><th>Inizio</th><th>Scadenza</th></tr></thead><tbody>{voucherPrintBatch.codes.map((code) => <tr key={code}><td className="mono">{code}</td><td><BarcodeImage value={code} /></td><td>{voucherPrintBatch.discount_percentage}%</td><td>{voucherPrintBatch.starts_at}</td><td>{voucherPrintBatch.ends_at}</td></tr>)}</tbody></table></div>}
          </>}
        </div>}
      </section></div>}

      {section === 'statistics' && <div className="page-content">
        <div className="statistics-periods" role="group" aria-label="Filtra statistiche per periodo">{statisticsPeriods.map((period) => <button key={period} className={`status-filter${statisticsPeriod === period ? ' active' : ''}`} aria-pressed={statisticsPeriod === period} onClick={() => setStatisticsPeriod(period)}>{period}</button>)}</div>
        <section className="panel product-sales-panel"><div className="panel-heading"><div><h3>Prodotti più e meno venduti</h3></div></div><Table headings={['Posizione', 'Prodotto', 'Quantità venduta', 'Ricavi']}><>{productSalesRanking.map((product, index) => <tr key={product.id}><td>{index + 1}</td><td className="cell-primary">{product.name}</td><td>{quantityFormat.format(product.quantitySold)} {product.unit === 'PEZZO' ? 'pz' : product.unit === 'KG' ? 'kg' : product.unit === 'LITRO' ? 'L' : ''}</td><td>{money.format(product.revenue)}</td></tr>)}</>{!productSalesRanking.length && <tr><td colSpan={4} className="empty-cell">Nessun prodotto registrato.</td></tr>}</Table></section>
        <div className="metric-grid stats-metrics"><Metric icon={Banknote} label="Vendite" value={money.format(soldTotal)} detail="Incassi registrati nel periodo" /><Metric icon={CreditCard} label="Acquisto merce venduta" value={money.format(soldCost)} detail="Costo degli articoli venduti" /><Metric icon={TrendingUp} label="Netto stimato" value={money.format(estimatedNet)} detail="Ricavi meno costo del venduto e spese" /><Metric icon={ShoppingBasket} label="Quantità vendite" value={`${soldUnits.toLocaleString('it-IT')} di ${totalTrackedUnits.toLocaleString('it-IT')}`} detail="Articoli venduti rispetto a quelli ancora in magazzino" action={<button className="text-button metric-action" onClick={() => setUnsoldListOpen(true)}>Vedi lista</button>} /></div>
        <div className="metric-grid inventory-values"><Metric icon={Package} label="Valore vendita in magazzino" value={money.format(stockRetail)} detail="Valore al prezzo di vendita" compact /><Metric icon={Archive} label="Valore acquisto in magazzino" value={money.format(stockCost)} detail="Costo delle scorte attuali" compact /><Metric icon={TrendingUp} label="Netto potenziale" value={money.format(stockRetail - stockCost)} detail="Margine potenziale delle scorte" compact /></div>
        <div className="analytics-grid"><section className="panel calendar-panel"><div className="panel-heading"><div><h3>Calendario vendite</h3><p>Incasso per giorno</p></div><div className="month-controls"><button className="icon-button small" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><strong>{calendarMonth.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</strong><button className="icon-button small" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div></div><div className="calendar-grid">{['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((day, index) => <span className="calendar-weekday" key={`${day}${index}`}>{day}</span>)}{calendarDays().map((day, index) => { const date = day ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day) : null; const revenue = date ? statisticsSales.filter((sale) => new Date(sale.created_at).toDateString() === date.toDateString()).reduce((sum, sale) => sum + sale.total, 0) : 0; return <div key={index} className={`calendar-day${revenue ? ' has-sales' : ''}${date?.toDateString() === new Date().toDateString() ? ' today' : ''}`}>{day && <><span>{day}</span>{revenue > 0 && <small>{money.format(revenue)}</small>}</>}</div>; })}</div></section><section className="panel chart-panel"><div className="panel-heading"><div><h3>Vendite giornaliere</h3><p>Ultimi sette giorni nel periodo selezionato</p></div></div><ResponsiveContainer width="100%" height={242}><BarChart data={chartDays} margin={{ top: 14, right: 8, left: -15, bottom: 0 }}><CartesianGrid stroke="#e9ece8" vertical={false} /><XAxis dataKey="giorno" axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 10 }} tickFormatter={(value) => `${value}€`} /><Tooltip formatter={(value) => money.format(Number(value))} /><Bar dataKey="totale" fill="var(--green)" radius={[4, 4, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></section></div>
        <div className="analytics-grid statistics-extra"><section className="panel chart-panel"><div className="panel-heading"><div><h3>Andamento mensile</h3><p>Incasso per mese nel periodo selezionato</p></div></div><ResponsiveContainer width="100%" height={242}><LineChart data={monthlySales} margin={{ top: 14, right: 12, left: -15, bottom: 0 }}><CartesianGrid stroke="#e9ece8" vertical={false} /><XAxis dataKey="mese" axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 10 }} tickFormatter={(value) => `${value}€`} /><Tooltip formatter={(value) => money.format(Number(value))} /><Line type="monotone" dataKey="totale" stroke="var(--green)" strokeWidth={3} dot={{ fill: 'var(--green)', r: 4 }} /></LineChart></ResponsiveContainer></section><section className="panel payment-panel"><div className="panel-heading"><div><h3>Pagamenti per metodo</h3><p>Totale incassato nel periodo</p></div></div><div className="payment-totals">{Object.entries(paymentTotals).length ? Object.entries(paymentTotals).map(([method, amount], index) => <div key={method}><span className="payment-dot" style={{ backgroundColor: colors[index % colors.length] }} /><span>{method}</span><strong>{money.format(amount)}</strong></div>) : <span className="muted">Nessun pagamento nel periodo selezionato.</span>}</div></section></div>
        <section className="panel category-panel"><div className="panel-heading"><div><h3>Vendite per categoria</h3><p>Valore degli articoli venduti nel periodo selezionato</p></div></div><div className="category-chart"><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={Object.entries(categoriesSales).map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" innerRadius={57} outerRadius={88} paddingAngle={3}>{Object.keys(categoriesSales).map((name, i) => <Cell key={name} fill={colors[i % colors.length]} />)}</Pie><Tooltip formatter={(value) => money.format(Number(value))} /></PieChart></ResponsiveContainer><div className="chart-legend">{Object.entries(categoriesSales).length ? Object.entries(categoriesSales).map(([name, value], i) => <div key={name}><span style={{ backgroundColor: colors[i % colors.length] }} /><span>{name}</span><strong>{money.format(value)}</strong></div>) : <span className="muted">Le categorie appariranno dopo la prima vendita.</span>}</div></div></section>
      </div>}

      {section === 'settings' && <div className="page-content settings-page"><div className="settings-layout">{settingsTab === null ? <nav className="settings-nav">{[{ name: 'Nome negozio', icon: Store }, { name: 'Sicurezza', icon: ShieldCheck }, { name: 'Archivio dati', icon: Archive }, { name: 'Dispositivi', icon: Barcode }, { name: "Tema dell'app", icon: Palette }, { name: 'Operativo', icon: Check }].filter(({ name }) => normalizedRole(activeRole) === 'proprietario' || !['Nome negozio', 'Sicurezza', 'Archivio dati'].includes(name)).map(({ name, icon: Icon }) => <button key={name} onClick={() => { setSettingsTab(name); setDeviceTab(null); }}><Icon size={17} />{name}</button>)}</nav> : <section className="settings-panel"><button className="settings-back" onClick={() => { if (settingsTab === 'Dispositivi' && deviceTab) setDeviceTab(null); else { setSettingsTab(null); setDeviceTab(null); } }}><ArrowLeft size={15} />{settingsTab === 'Dispositivi' && deviceTab ? 'Dispositivi' : 'Impostazioni'}</button>
        {settingsTab === 'Nome negozio' && <><div className="settings-title"><h2>Info negozio</h2><p>Nome e logo del negozio per il menu e la barra superiore.</p></div><form className="settings-form" onSubmit={saveStoreName}><Field label="Nome attività" value={shopName} onChange={(e) => setShopName(e.target.value)} required /><div className="receipt-preview"><Store size={17} /><span>{shopName || 'Nome negozio'}</span><small>Anteprima intestazione scontrino</small></div><div className="shop-logo-setting"><span className="field-label">Logo del negozio</span>{data.settings.shop_logo && <img src={data.settings.shop_logo} alt="Logo attuale" />}<button className="button button-outline" type="button" onClick={() => void chooseShopLogo()}><Store size={15} /> {data.settings.shop_logo ? 'Sostituisci logo' : 'Scegli logo'}</button></div><button className="button button-primary"><Check size={16} /> Salva nome</button></form></>}
        {settingsTab === 'Sicurezza' && <><div className="settings-title"><h2>Accesso e sicurezza</h2><p>All’avvio viene richiesto il barcode di un dipendente; puoi mantenere il PIN come alternativa.</p></div><div className="security-status"><div className="security-icon"><ShieldCheck size={20} /></div><div><strong>{hasPin ? 'PIN alternativo attivo' : 'Nessun PIN alternativo configurato'}</strong><span>{hasPin ? 'Puoi usare il PIN dalla schermata di accesso.' : 'Configura un PIN da 4 a 8 cifre come alternativa al barcode.'}</span></div></div><form className="settings-form" onSubmit={async (event) => { event.preventDefault(); try { await window.gestionale.setPin(newPin); setHasPin(true); setNewPin(''); notify('PIN aggiornato'); } catch (error) { notify(errorText(error)); } }}><Field label={hasPin ? 'Nuovo PIN (4–8 cifre)' : 'PIN (4–8 cifre)'} type="password" inputMode="numeric" minLength={4} maxLength={8} pattern="[0-9]{4,8}" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} required /><button className="button button-primary"><LockKeyhole size={16} />{hasPin ? 'Aggiorna PIN' : 'Attiva PIN'}</button></form></>}
        {settingsTab === 'Archivio dati' && <><div className="settings-title"><h2>Archivio locale</h2><p>Database SQLite e copie giornaliere dei dati.</p></div><div className="connection-status settings-connection"><span className="status-dot" />Archivio locale attivo</div><div className="database-card"><div className="security-icon"><Archive size={20} /></div><div><strong>Database SQLite</strong><span className="database-path">{data.settings.database_file}</span></div><span className="stock-badge">Attivo</span></div><div className="settings-form"><label className="field"><span>Cartella esportazioni giornaliere</span><div className="folder-input"><input value={archiveFolder} readOnly /><button className="button button-outline" type="button" onClick={() => void chooseFolder()}>Scegli cartella</button></div></label><p className="help-copy">Ogni giorno a mezzanotte vengono aggiornati file TXT e PDF nelle cartelle Magazzino, Cassa, Vendite e Statistiche.</p></div></>}
        {settingsTab === 'Dispositivi' && (deviceTab === null ? <><div className="settings-title"><h2>Dispositivi</h2><p>Seleziona un dispositivo per configurarlo.</p></div><nav className="settings-nav device-menu"><button onClick={() => setDeviceTab('Lettore barcode')}><Barcode size={17} />Lettore di codici a barre</button><button onClick={() => setDeviceTab('Stampante scontrini')}><Printer size={17} />Stampante scontrini</button></nav></> : deviceTab === 'Lettore barcode' ? <><div className="settings-title"><h2>Lettore di codici a barre</h2><p>Configura il lettore collegato al computer.</p></div><div className="device-setting"><div className="device-heading"><div className="security-icon"><Barcode size={20} /></div><div><strong>Lettore di codici a barre</strong><span>{data.settings.barcode_scanner_detected ? 'Rilevato: è stata acquisita almeno una scansione su questo computer.' : 'In attesa della prima lettura del lettore USB/HID.'}</span></div><button className={`toggle-button${data.settings.barcode_scanner_enabled ? ' enabled' : ''}`} type="button" role="switch" aria-checked={data.settings.barcode_scanner_enabled} onClick={() => void toggleBarcodeScanner()}>{data.settings.barcode_scanner_enabled ? 'Attivo' : 'Disattivo'}</button></div><p className="help-copy">I lettori USB che si comportano come tastiera vengono riconosciuti automaticamente quando inviano un codice. La preferenza resta salvata tra gli avvii.</p></div></> : <><div className="settings-title"><h2>Stampante scontrini</h2><p>Collega una stampante rilevata dal sistema.</p></div><div className="device-setting"><div className="device-printer-row"><SelectField label="Stampante collegata" value={data.settings.receipt_printer} onChange={(value) => void saveReceiptPrinter(value)} options={['', ...printers.map((printer) => printer.name)]} labels={['Seleziona stampante', ...printers.map((printer) => printer.displayName || printer.name)]} /><button className="button button-outline" type="button" onClick={() => void window.gestionale.getPrinters().then(setPrinters).catch((error: unknown) => notify(errorText(error)))}><Printer size={15} /> Rileva stampanti</button></div>{!printers.length && <p className="help-copy">Nessuna stampante rilevata. Verifica che sia collegata e installata nel sistema.</p>}{data.settings.receipt_printer && !printers.some((printer) => printer.name === data.settings.receipt_printer) && <p className="help-copy">La stampante salvata non è attualmente disponibile: selezionane una nuova.</p>}</div></>)}
        {settingsTab === "Tema dell'app" && <><div className="settings-title"><h2>Tema dell'app</h2><p>Scegli i colori dell’interfaccia. La selezione viene salvata su questo dispositivo.</p></div><div className="theme-options" role="group" aria-label="Temi dell'app">{appThemes.map((theme) => <button key={theme.id} className={`theme-option${appTheme === theme.id ? ' selected' : ''}`} type="button" aria-pressed={appTheme === theme.id} onClick={() => setAppTheme(theme.id)}><span className="theme-swatch" style={{ backgroundColor: theme.color }} /><span>{theme.label}</span>{appTheme === theme.id && <Check size={15} />}</button>)}</div><div className="settings-title homepage-image-title"><h2>Immagine homepage</h2><p>Scegli un’immagine salvata nel gestionale per la pagina iniziale.</p></div><div className="shop-logo-setting">{data.settings.home_image && <img src={data.settings.home_image} alt="Immagine homepage attuale" />}<button className="button button-outline" type="button" onClick={() => void chooseHomepageImage()}><House size={15} />{data.settings.home_image ? 'Sostituisci immagine' : 'Scegli immagine'}</button></div></>}
        {settingsTab === 'Operativo' && <><div className="settings-title"><h2>Stato operativo</h2><p>Stato corrente del gestionale.</p></div><div className="connection-status settings-connection"><span className="status-dot" />Operativo</div></>}
      </section>}</div></div>}
    </main>

    {unsoldListOpen && <Modal title="Articoli ancora in magazzino" close={() => setUnsoldListOpen(false)} wide><div id="unsold-list-print"><Table headings={['Articolo', 'Categoria', 'Quantità non venduta', 'Prezzo vendita']}><>{unsoldProducts.map((product) => <tr key={product.id}><td className="cell-primary">{product.name}</td><td>{product.category}</td><td>{product.stock} {product.unit ?? 'PEZZO'}</td><td>{money.format(product.sale_price)}</td></tr>)}</>{!unsoldProducts.length && <tr><td colSpan={4} className="empty-cell">Non risultano articoli rimanenti in magazzino.</td></tr>}</Table></div><div className="unsold-list-actions no-print"><button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Stampa</button><button className="button button-primary" onClick={() => void shareUnsoldList()}><Share2 size={16} /> Condividi</button></div></Modal>}
    {reportExportOpen && <Modal title={reportExportType.startsWith('sales') ? 'Esporta report vendite' : 'Esporta report contabilità e finanza'} close={() => setReportExportOpen(false)}><div className="report-export-options"><p>Vuoi applicare al report il filtro temporale selezionato ({reportExportType.startsWith('sales') ? salesPeriod : balancePeriod}) o includere tutto il periodo disponibile?</p><button className="button button-primary" onClick={() => { setReportExportOpen(false); if (reportExportType === 'sales-pdf') exportReport(true); else if (reportExportType === 'sales-xlsx') void exportSalesXlsx(true); else downloadFinancialBalance(true); }}><Check size={15} /> Rispetta il filtro di tempo</button><button className="button button-outline" onClick={() => { setReportExportOpen(false); if (reportExportType === 'sales-pdf') exportReport(false); else if (reportExportType === 'sales-xlsx') void exportSalesXlsx(false); else downloadFinancialBalance(false); }}><ArrowDownToLine size={15} /> Esporta tutto</button></div></Modal>}
    {employeeDetails && <Modal title={`${employeeDetails.first_name} ${employeeDetails.last_name}`} close={() => setEmployeeDetails(null)} rightHalf>
      <div className="employee-detail-content">
        <div className="employee-detail-hero"><img src={employeeDetails.photo_data} alt={`Foto di ${employeeDetails.first_name} ${employeeDetails.last_name}`} /><div><strong>{employeeDetails.role}</strong><span>{employeeDetails.operational_site} · {employeeDetails.shift}</span></div></div>
        <div className="employee-detail-fields">{[['Età', employeeDetails.age], ['Sesso', employeeDetails.gender], ['Indirizzo', employeeDetails.home_address], ['Email', employeeDetails.email], ['Telefono', employeeDetails.phone], ['Ruolo', employeeDetails.role], ['Turno', employeeDetails.shift], ['Sede operativa', employeeDetails.operational_site], ['Stipendio', money.format(employeeDetails.salary)], ['Metodo di pagamento', employeeDetails.payment_method], ['IBAN', employeeDetails.payment_method === 'Bonifico' ? employeeDetails.iban : '—'], ['Codice riconoscimento', employeeDetails.recognition_code], ['Contratto', employeeDetails.contract_pdf_data ? 'PDF allegato' : 'Non presente']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}<section className="employee-detail-barcode"><h3>Barcode</h3><BarcodeImage value={employeeDetails.recognition_code} /><strong>{employeeDetails.recognition_code}</strong></section></div>
        <section className="employee-detail-docs"><h3>Foto documenti</h3><div>{employeeDocumentImages(employeeDetails.documents_data).map((image, index) => <img src={image} alt={`Documento ${index + 1}`} key={`${index}-${image.slice(0, 30)}`} />)}</div></section>
      </div>
      <div className="drawer-footer employee-profile-actions"><button className="button button-outline" onClick={() => void exportEmployeePdf(employeeDetails)}><ArrowDownToLine size={15} /> Scarica</button><button className="button button-outline" onClick={() => void printEmployeePdf(employeeDetails)}><Printer size={15} /> Stampa</button><button className="button button-outline" onClick={() => editEmployee(employeeDetails)}><Pencil size={15} /> Modifica dipendente</button>{canAccess('employees') && <button className="button button-danger" onClick={() => void deleteEmployee(employeeDetails)}><Trash2 size={15} /> Elimina dipendente</button>}<button className="button button-primary" onClick={() => setEmployeeDetails(null)}>Chiudi</button></div>
    </Modal>}
    {voucherViewBatch && <Modal title={`Codici buono · Gruppo ${voucherViewBatch.id}`} close={() => setVoucherViewBatch(null)} wide><div className="voucher-preview-heading"><strong>{voucherViewBatch.discount_percentage}% di sconto</strong><span>{voucherViewBatch.starts_at} — {voucherViewBatch.ends_at}</span></div><Table headings={['Codice', 'Barcode', 'Sconto', 'Inizio', 'Scadenza']}><>{voucherViewBatch.codes.map((code) => <tr key={code}><td className="mono">{code}</td><td><BarcodeImage value={code} /></td><td>{voucherViewBatch.discount_percentage}%</td><td>{voucherViewBatch.starts_at}</td><td>{voucherViewBatch.ends_at}</td></tr>)}</></Table></Modal>}
    {pendingUnknownCode && <Modal title="Articolo non presente" wide close={() => { setPendingUnknownCode(''); setScannerSearch(''); }}><div className="unknown-code-message"><CircleAlert size={26} /><p>Il codice a barre <strong>{pendingUnknownCode}</strong> non è presente tra gli articoli.</p><span>Puoi aggiungerlo come nuovo articolo: il codice acquisito sarà già inserito nel modulo.</span><div className="form-actions"><button className="button button-quiet" onClick={() => { setPendingUnknownCode(''); setScannerSearch(''); }}>Annulla</button><button className="button button-primary" onClick={() => { setProductEditingId(null); setProductForm({ ...blankProduct, code: pendingUnknownCode }); setPendingUnknownCode(''); }}><Plus size={16} /> Aggiungi articolo</button></div></div></Modal>}
    {measuredProduct && <Modal title={measuredProduct.unit === 'KG' ? `Inserisci il peso · ${measuredProduct.name}` : `Inserisci il volume · ${measuredProduct.name}`} close={() => setMeasuredProduct(null)}><form className="form-grid measured-quantity-form" onSubmit={confirmMeasuredQuantity}><p className="measured-price">{money.format(measuredProduct.sale_price)} / {measuredProduct.unit === 'KG' ? 'kg' : 'lit.'}</p><Field label={measuredProduct.unit === 'KG' ? 'Peso in kg' : 'Volume in litri'} type="number" min="0.001" step="0.001" value={measuredQuantity} onChange={(event) => setMeasuredQuantity(event.target.value)} required autoFocus placeholder={measuredProduct.unit === 'KG' ? 'Es. 0,750' : 'Es. 1,500'} /><div className="measured-quantity-options">{(measuredProduct.unit === 'KG' ? [{ label: '50 g', quantity: 0.05 }, { label: '100 g', quantity: 0.1 }, { label: '250 g', quantity: 0.25 }, { label: '500 g', quantity: 0.5 }, { label: '1 kg', quantity: 1 }, { label: '2 kg', quantity: 2 }] : [{ label: '50 ml', quantity: 0.05 }, { label: '100 ml', quantity: 0.1 }, { label: '250 ml', quantity: 0.25 }, { label: '500 ml', quantity: 0.5 }, { label: '1 L', quantity: 1 }, { label: '2 L', quantity: 2 }]).map(({ label, quantity }) => <button className="button button-outline" key={label} type="button" onClick={() => addMeasuredQuantity(quantity)}>{label}</button>)}</div><div className="form-actions"><button className="button button-quiet full-width" type="button" onClick={() => setMeasuredProduct(null)}>Annulla</button><button className="button button-primary full-width"><Check size={16} /> Aggiungi al carrello</button></div></form></Modal>}
    {productAuthorization && <Modal title={productAuthorization.action === 'edit' ? 'Autorizza modifica articolo' : 'Autorizza nuova quantità'} close={() => { setProductAuthorization(null); setProductAuthorizationBarcode(''); }}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); void authorizeProductAction(productAuthorizationBarcode); }}><p>Scansiona il barcode di un dipendente per continuare con «{productAuthorization.product.name}».</p><Field label="Barcode del dipendente" value={productAuthorizationBarcode} onChange={(event) => setProductAuthorizationBarcode(event.target.value)} autoFocus required /><div className="form-actions"><button className="button button-quiet" type="button" onClick={() => { setProductAuthorization(null); setProductAuthorizationBarcode(''); }}>Annulla</button><button className="button button-primary"><Barcode size={16} /> Verifica barcode</button></div></form></Modal>}
    {productForm && <ProductForm initial={productForm} save={saveProduct} close={() => { setProductForm(null); setProductEditingId(null); }} categories={categories} addCategory={addProductCategory} deleteCategory={deleteProductCategory} onDelete={productEditingId !== null ? async () => { const product = data.products.find((item) => item.id === productEditingId); if (product) await deleteProduct(product); } : undefined} />}
    {stockProduct && <Modal title={`Aggiungi quantità · ${stockProduct.name}`} close={() => { setStockProduct(null); setStockMovementEmployeeBarcode(''); }}><form className="form-grid stock-form" onSubmit={(event) => void saveStock(event)}>
      <p className="stock-current">Giacenza attuale: <strong>{stockProduct.stock}</strong></p>
      <Field label="Nuova quantità" type="number" min="0.01" step="any" value={stockInput} onChange={(event) => setStockInput(event.target.value)} required placeholder="Quantità da aggiungere" />
      <Field fieldClassName="movement-barcode-field" label="Barcode del personale verificato" value={stockMovementEmployeeBarcode} readOnly />
      <div className="form-actions"><button className="button button-quiet full-width" type="button" onClick={() => { setStockProduct(null); setStockMovementEmployeeBarcode(''); }}>Annulla</button><button className="button button-primary full-width" disabled={!stockMovementEmployeeBarcode}><Check size={16} /> Conferma giacenza</button></div>
    </form></Modal>}{selectedProduct && !isCashierRole(activeRole) && <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedProduct(null); }}><aside className="detail-drawer"><header className="drawer-header"><div><p className="eyebrow">DETTAGLIO ARTICOLO</p><h2>{selectedProduct.name}</h2></div><button className="icon-button" onClick={() => setSelectedProduct(null)}><X size={18} /></button></header><div className="drawer-content"><div className="detail-icon"><Package size={26} /></div><span className="stock-badge">{selectedProduct.category}</span><div className="detail-list"><Detail label="Codice a barre" value={selectedProduct.code} /><Detail label="Prezzo vendita" value={money.format(selectedProduct.sale_price)} /><Detail label="Prezzo acquisto" value={money.format(selectedProduct.purchase_price)} /><Detail label="Giacenza" value={`${selectedProduct.stock} ${selectedProduct.unit ?? 'PEZZO'}`} /><Detail label="Soglia minima" value={`${selectedProduct.low_stock_threshold} ${selectedProduct.unit ?? 'PEZZO'}`} />{selectedProduct.expiry_enabled && selectedProduct.expiry_date && <Detail label="Data di scadenza" value={receiptDate.format(new Date(`${selectedProduct.expiry_date}T00:00:00`))} />}<Detail label="Margine unitario" value={money.format(selectedProduct.sale_price - selectedProduct.purchase_price)} /></div></div><footer className="drawer-footer"><button className="button button-outline full-width" onClick={() => { setProductAuthorizationBarcode(''); setProductAuthorization({ product: selectedProduct, action: 'edit' }); }}><Settings size={15} /> Modifica articolo</button><button className="button button-outline full-width" onClick={() => { setProductAuthorizationBarcode(''); setProductAuthorization({ product: selectedProduct, action: 'quantity' }); }}><Package size={15} /> Nuova quantità</button></footer></aside></div>}
    {checkoutOpen && <Modal title="Pagamento" close={() => { setCheckoutOpen(false); setVoucherCode(''); setVoucherMessage(''); setVoucherDiscountPercentage(0); }} rightHalf narrowPanel><div className="payment-content">
      <section className="payment-promotion-info payment-promotion-always-visible">
        <strong>Offerte automatiche applicate</strong>
        <div className="payment-offer-list">{automaticApplicableOffers.length ? automaticApplicableOffers.map((offer) => <div className="payment-offer" key={offer.id}>
          <span>{offer.name} · {promotionDiscountLabel(offer)}</span>
          <small>{promotionDiscounts.automaticPromotion?.id === offer.id ? 'Applicata' : 'Non applicata (massimo 1)'}</small>
        </div>) : <small>Nessuna offerta automatica applicabile al carrello.</small>}
        {automaticDiscount > 0 && <small>Risparmio: {money.format(automaticDiscount)}</small>}</div>
      </section>
      {manualApplicableOffers.length > 0 && <details className="payment-promotion-info">
        <summary><strong>Offerte manuali disponibili</strong></summary>
        <div className="payment-offer-list">{manualApplicableOffers.map((offer) => <button className={`payment-offer-choice${promotionDiscounts.manualPromotion?.id === offer.id ? ' selected' : ''}`} type="button" key={offer.id} onClick={() => setManualPromotionId((current) => current === offer.id ? undefined : offer.id)}><span>{offer.name} · {promotionDiscountLabel(offer)}</span><small>{promotionDiscounts.manualPromotion?.id === offer.id ? 'Applicata' : 'Applica'}</small></button>)}
          {manualDiscount > 0 && <small>Risparmio: {money.format(manualDiscount)}</small>}</div>
      </details>}
      <SelectField label="Metodo di pagamento" value={paymentMethod} onChange={setPaymentMethod} options={['Carta', 'Contanti', 'Bancomat', 'Buono']} />
      <div className="voucher-checkout"><Field label="Buono sconto" value={voucherCode} onChange={(event) => { setVoucherCode(event.target.value); setVoucherMessage(''); setVoucherDiscountPercentage(0); }} placeholder="Scansiona o inserisci il codice" /><button className="button button-outline" type="button" onClick={() => void applyVoucherCode(voucherCode)} disabled={!voucherCode.trim()}><Barcode size={16} /> Verifica</button>{voucherMessage && <small className={voucherDiscountPercentage > 0 ? 'voucher-status valid' : 'voucher-status invalid'}>{voucherMessage}</small>}</div>
      <div className="payment-total">{total < subtotal && <div className="payment-total-before"><span>Prezzo prima dello sconto</span><strong>{money.format(subtotal)}</strong></div>}{voucherDiscount > 0 && <div className="payment-total-before"><span>Buono sconto ({voucherDiscountPercentage}%)</span><strong>− {money.format(voucherDiscount)}</strong></div>}<div className="payment-total-after"><span>Totale da pagare</span><strong>{money.format(total)}</strong></div></div>
      <div className="payment-note"><ShieldCheck size={16} />Lo scontrino viene registrato nel database locale.</div>
      <button className="button button-primary full-width" onClick={() => void checkout()}><Check size={17} /> Conferma e stampa scontrino</button>
    </div></Modal>}
    {receipt && <Modal title={`Scontrino #${receipt.receipt_no}`} close={() => setReceipt(null)}><div className="receipt-print" id="receipt-print"><div className="receipt-shop">{data.settings.shop_name}</div><div className="receipt-spacer" /><div className="receipt-datetime"><span>{receiptDate.format(new Date(receipt.created_at))}</span><span>{receiptTime.format(new Date(receipt.created_at))}</span></div><div>Numero scontrino: {receipt.receipt_no}</div><div className="receipt-dash" /><div className="receipt-head"><span>Articolo</span><span>Qtà</span><span>Prezzo</span></div>{receipt.items.map((item, index) => <div className="receipt-item" key={`${item.code}-${index}`}><span>{item.name}</span><span>{receiptQuantity.format(item.quantity)}{item.unit === 'KG' ? ' kg' : item.unit === 'LITRO' ? ' L' : ''}</span><span>{money.format(item.unit_price * item.quantity)}</span></div>)}<div className="receipt-dash" /><div className="receipt-total"><strong>TOTALE</strong><strong>{money.format(receipt.total)}</strong></div><div className="receipt-payment-savings"><span>Pagamento: {receipt.payment_method}</span>{receipt.discount > 0 && <span>Risparmio: {money.format(receipt.discount)}</span>}</div><div className="receipt-dash" /><div className="receipt-spacer" /><svg id="receipt-barcode" /><div className="receipt-spacer" /><div className="receipt-thanks">Grazie per averci scelto!</div></div><div className="receipt-actions"><button className="button button-primary full-width" onClick={printReceipt}><Printer size={16} /> Stampa scontrino</button></div></Modal>}
    {saleAdjustment !== null && <Modal title="Modifica vendita completata" close={() => setSaleAdjustment(null)}><div className="sale-adjustment-message"><p>{saleAdjustment > 0 ? `Il cliente deve pagare ancora ${money.format(saleAdjustment)}.` : saleAdjustment < 0 ? `Devi rimborsare al cliente ${money.format(Math.abs(saleAdjustment))}.` : 'Non è necessario effettuare un rimborso o un pagamento aggiuntivo.'}</p><button className="button button-primary" onClick={() => setSaleAdjustment(null)}>Ok</button></div></Modal>}
    {saleAction && <Modal title={`Verifica dipendente · scontrino #${saleAction.sale.receipt_no}`} close={() => { setSaleAction(null); setSaleEmployeeBarcode(''); }}><form className="sale-authorization" onSubmit={(event) => { event.preventDefault(); void authorizeSaleAction(); }}>
      <p>Scansiona o inserisci il barcode di riconoscimento del dipendente per {saleAction.action === 'edit' ? 'modificare' : 'eliminare'} questo scontrino.</p>
      <Field label="Barcode dipendente" value={saleEmployeeBarcode} onChange={(event) => setSaleEmployeeBarcode(event.target.value.trim())} autoFocus required />
      <div className="form-actions"><button className="button button-quiet" type="button" onClick={() => { setSaleAction(null); setSaleEmployeeBarcode(''); }}>Annulla</button><span className="sale-authorization-hint">La scansione del badge verifica e apre automaticamente la vendita.</span></div>
    </form></Modal>}
    {saleDialog && <Modal title={`Vendita #${saleDialog.receipt_no}`} close={() => { setSaleDialog(null); setSaleEmployeeBarcode(''); }} wide><div className="sale-edit">
      <div className="sale-edit-fields">
        <SelectField label="Metodo di pagamento" value={saleDialog.payment_method} onChange={(value) => setSaleDialog({ ...saleDialog, payment_method: value })} options={['Carta', 'Contanti', 'Bancomat', 'Buono']} />
        <div className="sale-discount-fields"><Field label="Sconto (%)" type="number" min="0" max="100" step="0.01" value={saleDiscountPercentage} onChange={(e) => changeSaleDiscount(Number(e.target.value))} /><Field label="Sconto (€)" type="number" value={saleDialog.discount.toFixed(2)} readOnly /></div>
      </div>
      <div className="sale-edit-add">
        <button className="button button-primary full-width" type="button" onClick={() => { setSaleCart([]); setSaleProductSearch(''); setSaleAddOpen(true); }}><Plus size={15} /> Aggiungi articolo</button>
      </div>
      <div className="edit-item-list"><div className="edit-list-head"><span>Articolo</span><span>Quantità</span><span>Prezzo</span><span></span></div>{saleDialog.items.map((item, index) => <div className="edit-item" key={`${item.product_id}-${index}`}><span>{item.name}</span><input aria-label={`Quantità ${item.name}`} type="number" min="0" step={item.unit === 'PEZZO' || !item.unit ? '1' : '0.1'} value={item.quantity} onChange={(e) => changeSaleQuantity(index, Number(e.target.value))} /><span>{money.format(item.unit_price)} / {item.unit ?? 'PEZZO'}</span><button className="icon-button small" type="button" title="Rimuovi articolo dalla vendita" aria-label={`Rimuovi ${item.name} dalla vendita`} onClick={() => changeSaleQuantity(index, 0)}><Trash2 size={15} /></button></div>)}</div>
      <div className="sale-edit-total"><span>Sconto in euro</span><strong>{money.format(saleDialog.discount)}</strong></div>
      <div className="sale-edit-total"><span>Nuovo totale</span><strong>{money.format(Math.max(0, saleDialog.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) - saleDialog.discount))}</strong></div>
      <div className="sale-edit-actions"><button className="button button-primary" onClick={() => void updateSale()}><Check size={15} /> Salva modifiche</button></div>
    </div></Modal>}
    {saleAddOpen && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSaleAddOpen(false); }}><aside className="detail-drawer sale-add-drawer"><header className="drawer-header"><div><p className="eyebrow">MODIFICA VENDITA</p><h2>Aggiungi articoli</h2></div><button className="icon-button" onClick={() => setSaleAddOpen(false)} aria-label="Chiudi"><X size={18} /></button></header><div className="sale-add-content"><SearchInput value={saleProductSearch} onChange={setSaleProductSearch} placeholder="Cerca articolo o codice…" /><div className="sale-add-products">{availableSaleProducts.filter((product) => product.name.toLowerCase().includes(saleProductSearch.toLowerCase()) || product.code.includes(saleProductSearch)).map((product) => { const selected = saleCart.find((item) => item.product_id === product.id); return <button className={`sale-add-product${selected ? ' selected' : ''}`} key={product.id} onClick={() => addProductToSaleCart(product)}><span><strong>{product.name}</strong><small>{product.code} · {product.stock} {product.unit ?? 'PEZZO'} disponibili</small></span><span>{money.format(product.sale_price)} / {product.unit ?? 'PEZZO'}<b>{selected ? ` · ${selected.quantity}` : ''}</b></span></button>; })}</div><details className="sale-add-cart"><summary><strong>Carrello · {saleCart.length}</strong></summary>{saleCart.map((item) => <span key={item.product_id}>{item.name} · {item.quantity} {item.unit} <b>{money.format(item.quantity * item.unit_price)}</b></span>)}</details><button className="button button-primary full-width sale-add-confirm" disabled={!saleCart.length} onClick={addProductToSale}><ShoppingCart size={16} /> Conferma l'aggiunta</button></div></aside></div>}
    {camera && <CameraScanner close={() => setCamera(false)} scan={scanCameraCode} />}
    {notice && <div className="toast">{notice}</div>}
  </div></LocalizedNodes></AppDynamicNamesContext.Provider></AppLanguageContext.Provider>;
}

function Metric({ icon: Icon, label, value, detail, compact = false, action }: { icon: typeof House; label: string; value: string; detail: string; compact?: boolean; action?: ReactNode }) {
  const language = useContext(AppLanguageContext);
  return <section className={`metric-card${compact ? ' compact' : ''}`}>{action}<div className="metric-icon"><Icon size={18} /></div><span className="metric-label">{localizedText(label, language)}</span><strong>{value}</strong><small>{localizedText(detail, language)}</small></section>;
}
function SectionHeading({ icon: Icon, title, detail, action }: { icon: typeof House; title: string; detail: string; action: ReactNode }) {
  const language = useContext(AppLanguageContext);
  return <div className="section-heading"><div className="section-title-icon"><Icon size={18} /></div><div><h3>{localizedText(title, language)}</h3><p>{localizedText(detail, language)}</p></div>{action}</div>;
}
function Table({ headings, children }: { headings: string[]; children: ReactNode }) {
  const language = useContext(AppLanguageContext);
  return <div className="table-wrap"><table><thead><tr>{headings.map((heading) => <th key={heading}>{localizedText(heading, language)}</th>)}</tr></thead><tbody><LocalizedNodes>{children}</LocalizedNodes></tbody></table></div>;
}
function SalesTable({ sales, onSelect }: { sales: Sale[]; onSelect?: (sale: Sale) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Numero scontrino</th><th>Data e ora</th><th>Articoli</th><th>Pagamento</th><th className="align-right">Totale</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id} onClick={onSelect ? () => onSelect(sale) : undefined}><td className="receipt-number">#{sale.receipt_no}</td><td>{dateTime.format(new Date(sale.created_at))}</td><td>{sale.item_count}</td><td><span className="payment-tag">{sale.payment_method}</span></td><td className="align-right cell-primary">{money.format(sale.total)}</td></tr>)}{!sales.length && <tr><td colSpan={5} className="empty-cell">Nessuna vendita registrata.</td></tr>}</tbody></table></div>;
}
function SearchInput({ value, onChange, placeholder, numericOnly = false }: { value: string; onChange: (value: string) => void; placeholder: string; numericOnly?: boolean }) {
  const language = useContext(AppLanguageContext);
  return <div className="search-field"><Search size={17} /><input placeholder={localizedText(placeholder, language)} value={value} inputMode={numericOnly ? 'numeric' : undefined} pattern={numericOnly ? '[0-9]*' : undefined} onChange={(event) => onChange(numericOnly ? event.target.value.replace(/\D/g, '') : event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} /><button type="button" className="search-clear" aria-label={localizedText('Cancella ricerca', language)} disabled={!value} onClick={() => onChange('')}><X size={15} /></button></div>;
}
function SelectField({ label, value, onChange, options, labels, preserveLabels = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; labels?: string[]; preserveLabels?: boolean }) {
  const language = useContext(AppLanguageContext);
  return <label className="field"><span>{localizedText(label, language)}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option, index) => { const display = labels?.[index] ?? option; return <option key={`${option}-${index}`} value={option}>{preserveLabels && labels?.[index] ? display : localizedText(display, language)}</option>; })}</select></label>;
}
function Detail({ label, value }: { label: string; value: string }) { const language = useContext(AppLanguageContext); return <div className="detail-row"><span>{localizedText(label, language)}</span><strong>{value}</strong></div>; }
function Empty({ icon: Icon, title, detail }: { icon: typeof House; title: string; detail: string }) { const language = useContext(AppLanguageContext); return <div className="empty-state"><Icon size={28} /><strong>{localizedText(title, language)}</strong><span>{localizedText(detail, language)}</span></div>; }

function CameraScanner({ close, scan }: { close: () => void; scan: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState('Inquadra il codice a barre');
  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer = 0;
    let active = true;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (video.current) video.current.srcObject = stream;
        const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
        if (!Detector) { setMessage('Scansione camera non supportata. Collega il lettore barcode USB.'); return; }
        const detector = new Detector({ formats: ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        const readFrame = async () => { if (!active || !video.current) return; try { const result = await detector.detect(video.current); if (result[0]?.rawValue) { scan(result[0].rawValue); return; } } catch { /* il video non ha ancora un frame */ } timer = window.setTimeout(() => void readFrame(), 240); };
        timer = window.setTimeout(() => void readFrame(), 500);
      } catch { setMessage('Fotocamera non disponibile o permesso negato.'); }
    };
    void start();
    return () => { active = false; window.clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, [scan]);
  return <Modal title="Scansiona codice" close={close}><div className="camera-view"><video ref={video} autoPlay muted playsInline /><div className="camera-frame" /><p>{message}</p></div></Modal>;
}