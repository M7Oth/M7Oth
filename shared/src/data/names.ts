import type { L10n } from '../types';
import { l } from '../util';

// All companies and people are fictional.
export const CLIENT_NAMES: { name: L10n; industry: L10n }[] = [
  { name: l('مقهى نَسَق', 'Nasaq Café'), industry: l('مقاهي', 'Coffee') },
  { name: l('استوديو مدار الناشئ', 'Madar Startup Studio'), industry: l('شركة ناشئة', 'Startup') },
  { name: l('رمال للعقار', 'Rimal Real Estate'), industry: l('عقار', 'Real estate') },
  { name: l('متجر لمسة', 'Lamsa Store'), industry: l('تجارة إلكترونية', 'E-commerce') },
  { name: l('تطبيق سَفَر', 'Safar App'), industry: l('سفر', 'Travel') },
  { name: l('مطعم بيت الزعتر', 'Bait Al-Zaatar'), industry: l('مطاعم', 'Restaurant') },
  { name: l('أكاديمية روّاد', 'Rowad Academy'), industry: l('تعليم', 'Education') },
  { name: l('نادي الصقر الرياضي', 'Saqr Sports Club'), industry: l('رياضة', 'Sports') },
  { name: l('عطور ريحان', 'Rayhan Perfumes'), industry: l('عطور', 'Fragrance') },
  { name: l('مجلة الأفق', 'Al-Ofuq Magazine'), industry: l('إعلام', 'Media') },
  { name: l('معرض الدانة للسيارات', 'Al-Dana Motors'), industry: l('سيارات', 'Automotive') },
  { name: l('مخبز السنابل', 'Sanabel Bakery'), industry: l('مخابز', 'Bakery') },
  { name: l('قناة حكايا', 'Hakaya Channel'), industry: l('صناعة محتوى', 'Content creator') },
  { name: l('منصة بذرة', 'Bathra Platform'), industry: l('تقنية', 'Tech') },
  { name: l('فندق الواحة', 'Al-Waha Hotel'), industry: l('ضيافة', 'Hospitality') },
  { name: l('عيادات بسمة', 'Basma Clinics'), industry: l('صحة', 'Health') },
  { name: l('مهرجان ضوء', 'Dhaw Festival'), industry: l('فعاليات', 'Events') },
  { name: l('شاي جبلي', 'Jabali Tea'), industry: l('مشروبات', 'Beverages') },
  { name: l('ألعاب نجمة', 'Najma Games'), industry: l('ألعاب', 'Games') },
  { name: l('أثاث دار', 'Dar Furniture'), industry: l('أثاث', 'Furniture') },
];

export const PERSON_NAMES: L10n[] = [
  l('سارة', 'Sara'), l('خالد', 'Khalid'), l('نورة', 'Noura'), l('فيصل', 'Faisal'), l('ريم', 'Reem'),
  l('عبدالله', 'Abdullah'), l('لمى', 'Lama'), l('ماجد', 'Majed'), l('هيا', 'Haya'), l('تركي', 'Turki'),
  l('جود', 'Joud'), l('سلمان', 'Salman'), l('دانة', 'Dana'), l('يوسف', 'Yousef'), l('رهف', 'Rahaf'),
  l('عمر', 'Omar'), l('شهد', 'Shahad'), l('بدر', 'Badr'), l('غلا', 'Ghala'), l('نواف', 'Nawaf'),
  l('ليان', 'Layan'), l('مشاري', 'Mishari'), l('أروى', 'Arwa'), l('زياد', 'Ziyad'),
];

export const SKIN_TONES = ['#f1c9a5', '#e0ac85', '#c68b5e', '#9a6840', '#6b4628'];
export const HAIR_COLORS = ['#1d1612', '#3b2416', '#6a4426', '#b08040', '#8a8a8a', '#5a2a6a'];
export const SHIRT_COLORS = ['#2f6fdf', '#e25b45', '#2aa876', '#f2b134', '#6c4bd8', '#222831', '#f4f1ea', '#d95f8c'];
export const PANTS_COLORS = ['#2b3442', '#4a3b2f', '#1f1f24', '#56627a', '#7b6a52'];
