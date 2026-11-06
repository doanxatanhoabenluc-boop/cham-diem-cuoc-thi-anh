const clean = (s = '') => String(s).replace(/\r\n?/g, '\n').trim();

function valueAfter(text, labels) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^\\s*${escaped}\\s*:\\s*(.*?)\\s*$`, 'im');
    const match = String(text || '').match(re);
    if (match) return clean(match[1]);
  }
  return '';
}


function multilineValueAfter(text, labels) {
  const source = String(text || '').replace(/\r\n?/g, '\n');
  const labelPattern = labels
    .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const nextFieldLabels = [
    'STT', 'Số thứ tự tác phẩm', 'Số thứ tự', 'Số TT', 'So thu tu', 'So TT',
    'Họ tên tác giả', 'Họ và Tên', 'Họ tên', 'Đơn vị',
    'Tên tác phẩm', 'Tên bài thi', 'Tên ảnh'
  ];
  const nextPattern = nextFieldLabels
    .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:${labelPattern})\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${nextPattern})\\s*:|$)`,
    'i'
  );
  const match = source.match(re);
  return match ? clean(match[1]) : '';
}

function integerAfter(text, labels) {
  const raw = valueAfter(text, labels);
  if (!raw) return null;
  const match = raw.match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Đọc một file TXT của tác phẩm.
 * - Các trường thông tin (STT, họ tên, đơn vị, tên tác phẩm) được tìm trên toàn file.
 * - Nếu có dạng Nội dung[...], toàn bộ phần nằm trong dấu [] là thông điệp.
 * - Vẫn hỗ trợ các mẫu TXT cũ dùng Thông điệp:/Lời giới thiệu:.
 */
export function parseEntryTxt(raw) {
  const text = clean(raw);
  const contentMatch = text.match(/Nội\s*dung(?:\s+ý\s+nghĩa\s+của\s+ảnh)?\s*:?\s*\[([\s\S]*?)\]/i);
  const bracketContent = contentMatch ? clean(contentMatch[1]) : '';

  // Ưu tiên đọc metadata ở ngoài ngoặc vuông. Fallback vào trong ngoặc để
  // tương thích với các file TXT cũ đặt toàn bộ thông tin trong Nội dung[...].
  const metadataText = contentMatch
    ? `${text.slice(0, contentMatch.index)}\n${text.slice(contentMatch.index + contentMatch[0].length)}`
    : text;
  const fallbackText = `${metadataText}\n${bracketContent}`;

  const messageLabels = [
    'Nội dung ý nghĩa của ảnh',
    'Nội dung thông điệp',
    'Thông điệp',
    'Lời giới thiệu'
  ];
  // Giữ nguyên các dòng trong phần nội dung; dừng khi gặp nhãn metadata kế tiếp.
  const messageFromLabel = multilineValueAfter(fallbackText, messageLabels) ||
    valueAfter(fallbackText, messageLabels);

  return {
    // STT được giữ riêng; không có STT thì null để ứng dụng tự xếp theo tên tác giả.
    source_stt: integerAfter(fallbackText, [
      'STT',
      'Số thứ tự tác phẩm',
      'Số thứ tự',
      'Số TT',
      'So thu tu',
      'So TT'
    ]),
    author_name: valueAfter(fallbackText, ['Họ tên tác giả', 'Họ và Tên', 'Họ tên']),
    unit: valueAfter(fallbackText, ['Đơn vị']),
    title: valueAfter(fallbackText, ['Tên tác phẩm', 'Tên bài thi', 'Tên ảnh']),
    // Với mẫu Nội dung[...], lấy NGUYÊN PHẦN trong ngoặc vuông làm thông điệp.
    message: bracketContent || messageFromLabel
  };
}

export function pairUploads(files) {
  const images = files.filter(file => file.type.startsWith('image/'));
  const texts = files.filter(file => /\.txt$/i.test(file.name));
  const normalize = name => name
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return images.map(image => {
    const key = normalize(image.name);
    const txt = texts.find(file => normalize(file.name) === key);
    return { image, txt, matched: Boolean(txt) };
  });
}
