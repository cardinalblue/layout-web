export const TEXT_SCRAP_PRESETS_SINGLE = [
  { id: 'p-1w', label: '1w', text: 'TOKYO' },
  { id: 'p-2w', label: '2w', text: 'Hello World!' },
  { id: 'p-4w', label: '4w', text: 'Summer at the beach' },
  {
    id: 'p-10w',
    label: '10w',
    text: 'We spent the weekend exploring hidden mountain trails and waterfalls',
  },
  {
    id: 'p-28w',
    label: '28w',
    text: 'Last summer we drove along the coast for three weeks, stopping at every small town. The sunsets were incredible and the memories will stay with us forever.',
  },
  { id: 'p-cjk7', label: '中文7', text: '夏日海邊的回憶' },
] as const;

export const TEXT_SCRAP_PRESETS_PAIRED = [
  { id: 'pp-date', label: 'date', title: 'TOKYO', subtitle: '2025 · Travel Journal' },
  {
    id: 'pp-desc',
    label: 'desc',
    title: 'Summer at the beach',
    subtitle: 'A collection of our favorite moments from this summer',
  },
  {
    id: 'pp-credit',
    label: 'credit',
    title: 'Hello World!',
    subtitle: 'Photography by Sarah & Tom',
  },
  { id: 'pp-cjk', label: '中文', title: '夏日海邊的回憶', subtitle: '回憶錄 · 第三章' },
] as const;
