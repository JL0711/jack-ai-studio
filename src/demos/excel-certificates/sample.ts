// The preloaded list. Made-up people and a made-up academy; dates are a few
// weeks before today so the sample never looks stale. On purpose it has one
// blank row, one row without a course, one duplicate, one very long name,
// one row that already has a certificate number, and dates typed in mixed
// formats (two of them real Excel dates in the .xlsx download).

import type { Lang } from '../../i18n/strings';
import { formatNumber, type CellValue, type SheetRow } from './xlsx';

export interface SampleList {
  sheetName: string;
  cells: CellValue[][];
  colWidths: number[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_EN_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function daysBefore(today: Date, n: number): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
}

const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const real = (d: Date): CellValue => ({ date: isoOf(d) });

export function sampleList(lang: Lang, today: Date, prefix: string): SampleList {
  const a = daysBefore(today, 18);
  const b = daysBefore(today, 15);
  const c = daysBefore(today, 12);
  const y = (d: Date) => d.getFullYear();
  const m = (d: Date) => d.getMonth() + 1;
  const kept = `${prefix}-${today.getFullYear()}-0003`;

  if (lang === 'zh') {
    const py = 'Python 数据分析入门训练营';
    const xl = 'Excel 函数与数据透视实战';
    const ai = 'AI 办公效率提升课';
    const slash = (d: Date) => `${y(d)}/${m(d)}/${d.getDate()}`;
    const cn = (d: Date) => `${y(d)}年${m(d)}月${d.getDate()}日`;
    const dot = (d: Date) => `${y(d)}.${m(d)}.${d.getDate()}`;
    return {
      sheetName: '结业名单',
      colWidths: [7, 30, 28, 11, 16, 18],
      cells: [
        ['序号', '姓名', '课程名称', '考核等级', '结业日期', '证书编号'],
        [1, '王子涵', py, '优秀', real(a)],
        [2, '李雨桐', xl, '良好', slash(b)],
        [3, '张浩然', ai, '优秀', cn(c)],
        [4, '刘思远', py, '合格', dot(a)],
        [5, '陈欣怡', xl, '良好', real(b), kept],
        [],
        [6, '赵一鸣', '', '良好', cn(c)],
        [7, '克里斯蒂娜·玛丽亚·冯·霍恩施泰因', ai, '优秀', cn(c)],
        [8, '孙明轩', py, '良好', isoOf(a)],
        [9, '周一诺', ai, '合格', slash(c)],
        [10, '李雨桐', xl, '良好', slash(b)],
        [11, '吴诗雨', xl, '优秀', dot(b)],
        [12, '郑梦瑶', py, '良好', ''],
        [13, '黄梓萱', ai, '优秀', isoOf(c)],
      ],
    };
  }
  const py = 'Intro to Data Analysis with Python';
  const xl = 'Excel Formulas and Pivot Tables';
  const ai = 'AI Tools for Office Work';
  const us = (d: Date) => `${m(d)}/${d.getDate()}/${y(d)}`;
  const short = (d: Date) => `${MONTHS_EN[d.getMonth()]} ${d.getDate()}, ${y(d)}`;
  const long = (d: Date) => `${d.getDate()} ${MONTHS_EN_LONG[d.getMonth()]} ${y(d)}`;
  return {
    sheetName: 'Graduates',
    colWidths: [6, 40, 34, 12, 18, 18],
    cells: [
      ['#', 'Name', 'Course', 'Grade', 'Completion date', 'Certificate No.'],
      [1, 'Emma Carter', py, 'Merit', real(a)],
      [2, 'Liam Nguyen', xl, 'Distinction', us(b)],
      [3, 'Olivia Patel', ai, 'Pass', short(c)],
      [4, 'Noah Rivera', py, 'Merit', isoOf(a).replace(/-/g, '/')],
      [5, 'Ava Kim', xl, 'Merit', real(b), kept],
      [],
      [6, 'Ethan Brooks', '', 'Merit', short(c)],
      [7, 'Maximiliana Alexandra Fitzgerald-Montgomery', ai, 'Distinction', long(c)],
      [8, 'Sophia Martinez', py, 'Pass', isoOf(a)],
      [9, 'Lucas Schmidt', ai, 'Merit', us(c)],
      [10, 'Liam Nguyen', xl, 'Distinction', us(b)],
      [11, 'Mia Thompson', xl, 'Merit', long(b)],
      [12, "James O'Connor", py, 'Merit', ''],
      [13, 'Chloe Dubois', ai, 'Distinction', isoOf(c)],
    ],
  };
}

/** The same rows as readXlsx returns them for the downloaded file: text, dates as YYYY-MM-DD. */
export function cellsToRows(cells: CellValue[][]): SheetRow[] {
  const rows: SheetRow[] = [];
  cells.forEach((row, i) => {
    const out = row.map((v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return formatNumber(v);
      if (typeof v === 'object') return v.date;
      return v;
    });
    while (out.length && out[out.length - 1] === '') out.pop();
    if (out.some((c) => c.trim() !== '')) rows.push({ r: i + 1, cells: out });
  });
  return rows;
}
